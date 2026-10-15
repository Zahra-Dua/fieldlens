import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  fetchModelVersions,
  promoteModelVersion,
  stageModelVersion,
  uploadModelVersion,
} from "../features/models/api";
import type { ModelPlatform, ModelVersion } from "../features/models/types";
import { getErrorMessage } from "../lib/apiClient";

const MODELS_QUERY_KEY = ["models", "versions"] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: ModelVersion["status"] }) {
  const color =
    status === "production"
      ? "bg-green-100 text-green-800"
      : status === "staged"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function ModelsSkeleton() {
  return (
    <div role="status" aria-label="Loading model versions" className="space-y-3 p-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="h-12 animate-pulse rounded bg-slate-100" />
      ))}
    </div>
  );
}

export default function ModelsPage() {
  const queryClient = useQueryClient();
  const [platforms, setPlatforms] = useState<ModelPlatform[]>(["android", "ios"]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [promotionTarget, setPromotionTarget] = useState<string | null>(null);

  const modelsQuery = useQuery({
    queryKey: MODELS_QUERY_KEY,
    queryFn: ({ signal }) => fetchModelVersions(signal),
  });

  const uploadMutation = useMutation({
    mutationFn: uploadModelVersion,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
      setSelectedFile(null);
      const fileInput = document.querySelector<HTMLInputElement>("#model-file");
      if (fileInput) fileInput.value = "";
    },
  });

  const promoteMutation = useMutation({
    mutationFn: promoteModelVersion,
    onSuccess: async () => {
      setPromotionTarget(null);
      await queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
    },
  });
  const stageMutation = useMutation({
  mutationFn: stageModelVersion,
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
  },
});

  function togglePlatform(platform: ModelPlatform) {
    setPlatforms((current) =>
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform],
    );
  }

  function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedFile === null || platforms.length === 0) return;

    const form = new FormData(event.currentTarget);
    uploadMutation.mutate({
      version: String(form.get("version") ?? "").trim(),
      platforms,
      quantization: String(form.get("quantization") ?? ""),
      accuracy: Number(form.get("accuracy")),
      notes: String(form.get("notes") ?? "").trim(),
      file: selectedFile,
    });
  }

  const models = modelsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Model management</h1>
        <p className="text-sm text-slate-600">
          Upload model versions and manage the production release.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Upload a model</h2>
        <p className="mt-1 text-sm text-slate-600">
          New uploads start as drafts. Stage a version before promoting it.
        </p>

        <form onSubmit={handleUpload} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Version
            <input
              required
              name="version"
              pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)"
              placeholder="1.2.0"
              title="Use semantic versioning, for example 1.2.0"
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Quantization
            <select
              required
              name="quantization"
              defaultValue="float16"
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="float32">float32</option>
              <option value="float16">float16</option>
              <option value="dynamic_range">dynamic_range</option>
              <option value="int8">int8</option>
            </select>
          </label>

          <fieldset className="grid gap-2 text-sm text-slate-700">
            <legend className="font-medium">Platforms</legend>
            {(["android", "ios"] as const).map((platform) => (
              <label key={platform} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={platforms.includes(platform)}
                  onChange={() => togglePlatform(platform)}
                />
                {platform}
              </label>
            ))}
          </fieldset>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Test accuracy (0–1)
            <input
              required
              name="accuracy"
              type="number"
              min="0"
              max="1"
              step="0.0001"
              placeholder="0.92"
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            Notes
            <textarea
              name="notes"
              maxLength={500}
              rows={2}
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            TFLite model file
            <input
              id="model-file"
              required
              type="file"
              accept=".tflite,application/octet-stream"
              onChange={(event) => setSelectedFile(event.currentTarget.files?.[0] ?? null)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <span className="text-xs font-normal text-slate-500">
              Maximum file size: 50 MB.
            </span>
          </label>

          {uploadMutation.isError && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              Upload failed: {getErrorMessage(uploadMutation.error)}
            </p>
          )}

          {uploadMutation.isSuccess && (
            <p role="status" className="text-sm text-green-700 sm:col-span-2">
              Model version uploaded as a draft.
            </p>
          )}

          <button
            type="submit"
            disabled={
              uploadMutation.isPending ||
              platforms.length === 0 ||
              selectedFile === null
            }
            className="w-fit rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 sm:col-span-2"
          >
            {uploadMutation.isPending ? "Uploading..." : "Upload model"}
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Model versions</h2>
        </div>

        {modelsQuery.isPending ? (
          <ModelsSkeleton />
        ) : modelsQuery.isError ? (
          <div role="alert" className="space-y-3 p-6 text-center">
            <p className="font-medium text-red-700">Could not load model versions</p>
            <p className="text-sm text-slate-600">{getErrorMessage(modelsQuery.error)}</p>
            <button
              type="button"
              onClick={() => void modelsQuery.refetch()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
          </div>
        ) : models.length === 0 ? (
          <div role="status" className="px-4 py-12 text-center">
            <h3 className="font-semibold text-slate-800">No model versions yet</h3>
            <p className="mt-1 text-sm text-slate-600">
              Upload a TFLite model to start the release process.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Platforms</th>
                  <th className="px-4 py-3">Accuracy</th>
                  <th className="px-4 py-3">Quantization</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {models.map((model) => (
                  <tr key={model.version}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {model.version}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={model.status} />
                    </td>
                    <td className="px-4 py-3">{model.platforms.join(", ")}</td>
                    <td className="px-4 py-3">{(model.accuracy * 100).toFixed(2)}%</td>
                    <td className="px-4 py-3">{model.quantization}</td>
                    <td className="px-4 py-3">{formatBytes(model.size_bytes)}</td>
                    <td className="px-4 py-3">
                      {new Date(model.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {model.status === "draft" && (
  <button
    type="button"
    disabled={stageMutation.isPending}
    onClick={() => {
      stageMutation.reset();
      stageMutation.mutate(model.version);
    }}
    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
  >
    {stageMutation.isPending && stageMutation.variables === model.version
      ? "Staging..."
      : "Stage"}
  </button>
)}

{model.status === "staged" && (
  <button
    type="button"
    disabled={promoteMutation.isPending}
    onClick={() => {
      promoteMutation.reset();
      setPromotionTarget(model.version);
    }}
    className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
  >
    Promote
  </button>
)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {stageMutation.isError && (
        <p role="alert" className="text-sm text-red-700">
          Staging failed: {getErrorMessage(stageMutation.error)}
        </p>
      )}

      {promoteMutation.isError && (
        <p role="alert" className="text-sm text-red-700">
          Promotion failed: {getErrorMessage(promoteMutation.error)}
        </p>
      )}

      {promotionTarget !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation"
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="promote-title"
            aria-describedby="promote-description"
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id="promote-title" className="text-lg font-semibold text-slate-900">
              Promote model {promotionTarget}?
            </h2>
            <p id="promote-description" className="mt-2 text-sm text-slate-600">
              This will make it the production model. The current production version
              will be moved back to staged.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={promoteMutation.isPending}
                onClick={() => {
                  setPromotionTarget(null);
                  promoteMutation.reset();
                }}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={promoteMutation.isPending}
                onClick={() => {
                  if (promotionTarget !== null) {
                    promoteMutation.mutate(promotionTarget);
                  }
                }}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {promoteMutation.isPending ? "Promoting..." : "Confirm promotion"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}