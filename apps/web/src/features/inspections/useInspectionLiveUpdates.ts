import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../lib/apiClient";
import { API_URL } from "../../lib/config";
import { tokenStorage } from "../../lib/tokenStorage";

export type LiveUpdateStatus = "connecting" | "connected" | "reconnecting";

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function processEventBlock(block: string, onInspectionCreated: () => void) {
  const eventName = block
    .split(/\r?\n/)
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();

  if (eventName === "inspection.created") {
    onInspectionCreated();
  }
}

async function readInspectionEvents(
  response: Response,
  signal: AbortSignal,
  onInspectionCreated: () => void,
): Promise<void> {
  if (!response.body) {
    throw new Error("The live updates response did not include a stream.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        processEventBlock(block, onInspectionCreated);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function useInspectionLiveUpdates(): LiveUpdateStatus {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveUpdateStatus>("connecting");

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let retryDelay = 1_000;

    const handleInspectionCreated = () => {
      void queryClient.invalidateQueries({ queryKey: ["inspections"] });
      void queryClient.invalidateQueries({ queryKey: ["devices", "fleet"] });
      window.dispatchEvent(new Event("fieldlens:inspection-created"));
    };

    async function connect() {
      while (!signal.aborted) {
        try {
          const token = tokenStorage.getAccessToken();
          if (token === null) {
            setStatus("reconnecting");
            await wait(retryDelay, signal);
            retryDelay = Math.min(retryDelay * 2, 30_000);
            continue;
          }

          const response = await fetch(`${API_URL}/inspections/events`, {
            headers: { Authorization: `Bearer ${token}` },
            signal,
          });

          if (response.status === 401) {
            await apiClient.get("/auth/me", { signal });
            continue;
          }
          if (!response.ok) {
            throw new Error(`Live updates request failed (${response.status}).`);
          }

          setStatus("connected");
          retryDelay = 1_000;
          await readInspectionEvents(response, signal, handleInspectionCreated);
          if (!signal.aborted) {
            throw new Error("The live updates stream was closed.");
          }
        } catch (error) {
          if (signal.aborted) return;
          console.error("Inspection live updates disconnected; reconnecting.", error);
          setStatus("reconnecting");
          await wait(retryDelay, signal);
          retryDelay = Math.min(retryDelay * 2, 30_000);
        }
      }
    }

    void connect();
    return () => controller.abort();
  }, [queryClient]);

  return status;
}
