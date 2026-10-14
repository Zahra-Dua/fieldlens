import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import { getErrorMessage } from "../lib/apiClient";
import { fetchInspection } from "../features/inspections/api";
import ConfidenceBar from "../features/inspections/ConfidenceBar";
import { formatDateTime } from "../features/inspections/format";
import InspectionPicture from "../features/inspections/InspectionPicture";
import LabelBadge from "../features/inspections/LabelBadge";
import StateMessage from "../features/inspections/StateMessage";
import { LOW_CONFIDENCE_THRESHOLD, type Inspection } from "../features/inspections/types";

// The table sends its address (the filters) with the link. This reads it back
// so "Back to inspections" returns to the same filters and page.
function readBackSearch(state: unknown): string {
  if (
    typeof state === "object" &&
    state !== null &&
    "search" in state &&
    typeof state.search === "string"
  ) {
    return state.search;
  }
  return "";
}

function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-slate-100 py-3 text-sm last:border-b-0">
      <dt className="text-slate-500">{title}</dt>
      <dd className="col-span-2 text-slate-900">{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading inspection" className="grid gap-6 md:grid-cols-2">
      <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-slate-200" />
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        {Array.from({ length: 7 }, (_, row) => (
          <div key={row} className="h-5 animate-pulse rounded bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

function Details({ inspection }: { inspection: Inspection }) {
  const prediction = inspection.predictions[0];
  const confidence = prediction === undefined ? null : Number(prediction.confidence);
  const hasLocation = inspection.latitude !== null && inspection.longitude !== null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <InspectionPicture inspectionId={inspection.id} image={inspection.images[0]} />

      <dl className="rounded-xl border border-slate-200 bg-white px-4">
        <Row title="Predicted label">
          {prediction === undefined ? (
            <span className="text-slate-500">No prediction</span>
          ) : (
            <LabelBadge label={prediction.predictedClass} />
          )}
        </Row>

        <Row title="Confidence">
          {confidence === null ? (
            <span className="text-slate-500">-</span>
          ) : (
            <div className="space-y-1">
              <ConfidenceBar value={confidence} />
              {confidence < LOW_CONFIDENCE_THRESHOLD && (
                <p className="text-xs text-amber-700">
                  Low confidence: the app marked this result as uncertain.
                </p>
              )}
            </div>
          )}
        </Row>

        <Row title="Review">
          {prediction === undefined ? (
            <span className="text-slate-500">-</span>
          ) : prediction.correctedClass !== null ? (
            <span className="flex flex-wrap items-center gap-2">
              Worker changed
              <LabelBadge label={prediction.predictedClass} />
              to
              <LabelBadge label={prediction.correctedClass} />
            </span>
          ) : prediction.isAccepted === true ? (
            "Accepted as predicted"
          ) : (
            <span className="text-slate-500">Not reviewed</span>
          )}
        </Row>

        <Row title="Captured">{formatDateTime(inspection.capturedAt)}</Row>

        <Row title="Device">
          {inspection.device.name ?? inspection.device.id.slice(0, 8)} ({inspection.device.platform}
          )
        </Row>

        <Row title="Sync status">{inspection.status}</Row>

        <Row title="Location">
          {hasLocation ? (
            <a
              href={`https://www.openstreetmap.org/?mlat=${inspection.latitude}&mlon=${inspection.longitude}#map=16/${inspection.latitude}/${inspection.longitude}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-700 hover:underline"
            >
              {Number(inspection.latitude).toFixed(5)}, {Number(inspection.longitude).toFixed(5)}
            </a>
          ) : (
            <span className="text-slate-500">Not recorded</span>
          )}
        </Row>

        {prediction !== undefined && (
          <Row title="Model run">
            {prediction.inferenceSource === "ON_DEVICE" ? "On the phone" : "In the cloud"}
            {prediction.inferenceTimeMs !== null && `, ${prediction.inferenceTimeMs} ms`}
          </Row>
        )}

        <Row title="ID">
          <span className="break-all font-mono text-xs">{inspection.id}</span>
        </Row>
      </dl>
    </div>
  );
}

export default function InspectionDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const backSearch = readBackSearch(location.state);

  const query = useQuery({
    queryKey: ["inspections", "detail", id],
    queryFn: ({ signal }) => fetchInspection(id ?? "", signal),
    enabled: id !== undefined,
  });

  const backLink = (
    <Link
      to={{ pathname: "/inspections", search: backSearch }}
      className="text-sm font-medium text-slate-700 hover:underline"
    >
      ← Back to inspections
    </Link>
  );

  function renderContent() {
    if (query.isPending) {
      return <DetailSkeleton />;
    }

    if (query.isError) {
      const notFound = axios.isAxiosError(query.error) && query.error.response?.status === 404;

      return (
        <div className="rounded-xl border border-slate-200 bg-white">
          <StateMessage
            tone="error"
            title={notFound ? "Inspection not found" : "Could not load this inspection"}
            message={
              notFound
                ? "It may have been deleted, or the link is wrong."
                : getErrorMessage(query.error)
            }
            action={
              notFound
                ? undefined
                : {
                    label: "Try again",
                    onClick: () => {
                      void query.refetch();
                    },
                  }
            }
          />
        </div>
      );
    }

    return <Details inspection={query.data} />;
  }

  return (
    <div className="space-y-4">
      {backLink}
      <h1 className="text-2xl font-semibold text-slate-900">Inspection</h1>
      {renderContent()}
    </div>
  );
}
