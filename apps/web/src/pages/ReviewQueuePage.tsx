import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { fetchDevices } from "../features/inspections/api";
import { WASTE_CLASSES } from "../features/inspections/types";
import { downloadReviewQueueCsv, fetchReviewQueue } from "../features/review-queue/api";
import type { ReviewQueueFilters, ReviewQueueRow } from "../features/review-queue/types";

const EMPTY_FILTERS: ReviewQueueFilters = {
  deviceId: "",
  dateFrom: "",
  dateTo: "",
  originalLabel: "",
  correctedLabel: "",
  minConfidence: "",
  maxConfidence: "",
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ReviewQueueTable({ rows }: { rows: ReviewQueueRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-left">
        <thead className="bg-slate-50 text-sm text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium">Timestamp</th>
            <th className="px-4 py-3 font-medium">Device</th>
            <th className="px-4 py-3 font-medium">Original</th>
            <th className="px-4 py-3 font-medium">Corrected</th>
            <th className="px-4 py-3 font-medium">Confidence</th>
            <th className="px-4 py-3 font-medium">Review</th>
            <th className="px-4 py-3 font-medium">Corrected by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">
                {formatDate(row.capturedAt)}
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">
                  {row.device.name ?? row.device.id.slice(0, 8)}
                </div>
                <div className="text-xs text-slate-500">{row.device.platform}</div>
              </td>
              <td className="px-4 py-3 text-sm font-medium text-slate-700">{row.predictedClass}</td>
              <td className="px-4 py-3 text-sm font-medium text-emerald-700">
                {row.correctedClass}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {(row.confidence * 100).toFixed(0)}%
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                {row.isAccepted === null ? "Pending" : row.isAccepted ? "Accepted" : "Rejected"}
              </td>
              <td className="px-4 py-3 text-sm text-slate-700">
                <div>{row.user.name}</div>
                <div className="text-xs text-slate-500">{row.user.email}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReviewQueuePage() {
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);

  const devices = useQuery({
    queryKey: ["inspections", "devices"],
    queryFn: ({ signal }) => fetchDevices(signal),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchReviewQueue(filters, controller.signal);
        setRows(data);
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not load review queue. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [filters, liveRefreshKey]);

  useEffect(() => {
    const refresh = () => setLiveRefreshKey((key) => key + 1);
    window.addEventListener("fieldlens:inspection-created", refresh);
    return () => window.removeEventListener("fieldlens:inspection-created", refresh);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const min = draft.minConfidence === "" ? null : Number(draft.minConfidence);
    const max = draft.maxConfidence === "" ? null : Number(draft.maxConfidence);

    if (
      (min !== null && (!Number.isInteger(min) || min < 0 || min > 100)) ||
      (max !== null && (!Number.isInteger(max) || max < 0 || max > 100))
    ) {
      setFilterError("Confidence must be a whole number from 0 to 100.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setFilterError("Minimum confidence cannot be above the maximum.");
      return;
    }
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setFilterError("The start date cannot be after the end date.");
      return;
    }

    setFilterError(null);
    setFilters({ ...draft });
  }

  function clearFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFilterError(null);
  }

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await downloadReviewQueueCsv(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fieldlens-review-queue.csv";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export the filtered review queue.");
    } finally {
      setExporting(false);
    }
  }

  function updateDraft(field: keyof ReviewQueueFilters, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Review queue</h1>
          <p className="text-sm text-slate-600">
            Filter corrected predictions and export matching records for retraining.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={loading || rows.length === 0 || exporting}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? "Exporting..." : "Export filtered CSV"}
        </button>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-4"
        aria-label="Filter review queue"
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">Device</span>
            <select
              value={draft.deviceId}
              disabled={devices.isPending}
              onChange={(event) => updateDraft("deviceId", event.target.value)}
              className={inputClass}
            >
              <option value="">{devices.isPending ? "Loading devices..." : "All devices"}</option>
              {devices.data?.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name ?? device.id.slice(0, 8)} ({device.platform})
                </option>
              ))}
            </select>
            {devices.isError && (
              <span className="text-xs text-rose-700">Device list unavailable.</span>
            )}
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">From</span>
            <input
              type="date"
              value={draft.dateFrom}
              onChange={(event) => updateDraft("dateFrom", event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-600">To</span>
            <input
              type="date"
              value={draft.dateTo}
              onChange={(event) => updateDraft("dateTo", event.target.value)}
              className={inputClass}
            />
          </label>

          {(
            [
              ["originalLabel", "Original label"],
              ["correctedLabel", "Corrected label"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="space-y-1">
              <span className="text-xs font-medium text-slate-600">{label}</span>
              <select
                value={draft[field]}
                onChange={(event) => updateDraft(field, event.target.value)}
                className={inputClass}
              >
                <option value="">All labels</option>
                {WASTE_CLASSES.map((wasteClass) => (
                  <option key={wasteClass} value={wasteClass}>
                    {wasteClass}
                  </option>
                ))}
              </select>
            </label>
          ))}

          {(
            [
              ["minConfidence", "Min confidence (%)"],
              ["maxConfidence", "Max confidence (%)"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="space-y-1">
              <span className="text-xs font-medium text-slate-600">{label}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                inputMode="numeric"
                value={draft[field]}
                onChange={(event) => updateDraft(field, event.target.value)}
                className={inputClass}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Apply filters
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Clear
          </button>
          {filterError && (
            <p role="alert" className="text-sm text-rose-700">
              {filterError}
            </p>
          )}
        </div>
      </form>

      {exportError && (
        <p role="alert" className="text-sm text-rose-700">
          {exportError}
        </p>
      )}

      {loading ? (
        <div className="space-y-3" aria-label="Loading review queue">
          <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="my-3 h-10 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700"
        >
          {error}
          <button
            type="button"
            onClick={() => setFilters({ ...filters })}
            className="ml-3 font-medium underline"
          >
            Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-lg font-medium text-slate-900">No corrections match these filters</p>
          <p className="mt-2 text-sm text-slate-600">
            Clear the filters or check back after corrected labels have synced.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {rows.length} corrected prediction{rows.length === 1 ? "" : "s"}
          </p>
          <ReviewQueueTable rows={rows} />
        </>
      )}
    </div>
  );
}
