import { PAGE_SIZE } from "./filters";

const COLUMNS = ["Captured", "Label", "Confidence", "Corrected", "Device", "Status"];
const CELL_WIDTHS = ["w-32", "w-20", "w-28", "w-20", "w-24", "w-16"];

/**
 * The table while the first page loads. It has the same header and the same
 * row height as the real table, so the page does not jump when data arrives.
 */
export default function TableSkeleton() {
  return (
    <div role="status" aria-label="Loading inspections" className="overflow-x-auto">
      <table className="w-full min-w-[48rem] text-sm">
        <thead>
          <tr className="h-11 border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="px-4">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: PAGE_SIZE }, (_, row) => (
            <tr key={row} className="h-12 border-b border-slate-100">
              {CELL_WIDTHS.map((width, cell) => (
                <td key={cell} className="px-4">
                  <div className={`h-4 animate-pulse rounded bg-slate-200 ${width}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
