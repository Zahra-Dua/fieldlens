import { formatPercent } from "./format";
import { LOW_CONFIDENCE_THRESHOLD } from "./types";

/** A small bar and the percent. Low confidence is amber. */
export default function ConfidenceBar({ value }: { value: number }) {
  const low = value < LOW_CONFIDENCE_THRESHOLD;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-slate-200" aria-hidden="true">
        <div
          className={`h-1.5 rounded-full ${low ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className={low ? "font-medium text-amber-700" : "text-slate-700"}>
        {formatPercent(value)}
      </span>
    </div>
  );
}
