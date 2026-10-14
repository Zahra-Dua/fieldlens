import { Link, useLocation } from "react-router";
import ConfidenceBar from "./ConfidenceBar";
import { formatDateTime } from "./format";
import type { InspectionFilters } from "./filters";
import LabelBadge from "./LabelBadge";
import type { Inspection, SortBy } from "./types";

interface InspectionsTableProps {
  rows: Inspection[];
  filters: InspectionFilters;
  onSort: (column: SortBy) => void;
}

interface SortHeaderProps {
  title: string;
  column: SortBy;
  filters: InspectionFilters;
  onSort: (column: SortBy) => void;
}

function SortHeader({ title, column, filters, onSort }: SortHeaderProps) {
  const active = filters.sortBy === column;
  const ascending = filters.sortOrder === "asc";
  const ariaSort = active ? (ascending ? "ascending" : "descending") : "none";

  return (
    <th scope="col" aria-sort={ariaSort} className="px-4">
      <button
        type="button"
        onClick={() => {
          onSort(column);
        }}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-900"
      >
        {title}
        {/* A fixed width, so the header does not move when the arrow appears. */}
        <span aria-hidden="true" className="w-3 text-slate-400">
          {active ? (ascending ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

export default function InspectionsTable({ rows, filters, onSort }: InspectionsTableProps) {
  // The detail page uses this to send the admin back to the same filters.
  const { search } = useLocation();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-sm">
        <thead>
          <tr className="h-11 border-b border-slate-200 text-left">
            <SortHeader title="Captured" column="capturedAt" filters={filters} onSort={onSort} />
            <SortHeader title="Label" column="label" filters={filters} onSort={onSort} />
            <SortHeader title="Confidence" column="confidence" filters={filters} onSort={onSort} />
            <th
              scope="col"
              className="px-4 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Corrected
            </th>
            <th
              scope="col"
              className="px-4 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Device
            </th>
            <SortHeader title="Status" column="status" filters={filters} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const prediction = row.predictions[0];

            return (
              <tr key={row.id} className="h-12 border-b border-slate-100 hover:bg-slate-50">
                <td className="whitespace-nowrap px-4">
                  <Link
                    to={`/inspections/${row.id}`}
                    state={{ search }}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {formatDateTime(row.capturedAt)}
                  </Link>
                </td>
                <td className="px-4">
                  {prediction === undefined ? (
                    <span className="text-slate-400">No prediction</span>
                  ) : (
                    <LabelBadge label={prediction.predictedClass} />
                  )}
                </td>
                <td className="px-4">
                  {prediction === undefined ? (
                    <span className="text-slate-400">-</span>
                  ) : (
                    <ConfidenceBar value={Number(prediction.confidence)} />
                  )}
                </td>
                <td className="px-4">
                  {prediction?.correctedClass != null ? (
                    <LabelBadge label={prediction.correctedClass} />
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </td>
                <td className="max-w-[12rem] truncate px-4 text-slate-700">
                  {row.device.name ?? row.device.id.slice(0, 8)}
                </td>
                <td className="px-4 text-slate-700">{row.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
