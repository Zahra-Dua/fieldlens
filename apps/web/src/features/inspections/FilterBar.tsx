import { useState, type FormEvent } from "react";
import type { InspectionFilters } from "./filters";
import { WASTE_CLASSES } from "./types";

interface FilterBarProps {
  filters: InspectionFilters;
  onApply: (changes: Partial<InspectionFilters>) => void;
}

const NO_FILTERS: Partial<InspectionFilters> = {
  label: null,
  dateFrom: null,
  dateTo: null,
  minConf: null,
  maxConf: null,
  page: 1,
};

// Empty box means "no limit". Anything else must be a whole number 0 to 100.
function parsePercent(text: string): number | null | "invalid" {
  if (text.trim() === "") return null;
  if (!/^\d+$/.test(text.trim())) return "invalid";
  const value = Number(text);
  return value <= 100 ? value : "invalid";
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";

/**
 * The filter form. It keeps its own draft values and only changes the table
 * when the admin presses Apply, so typing does not send a request per key.
 * The parent gives it a new `key` when the filters change from outside, which
 * resets the draft.
 */
export default function FilterBar({ filters, onApply }: FilterBarProps) {
  const [label, setLabel] = useState(filters.label ?? "");
  const [dateFrom, setDateFrom] = useState(filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(filters.dateTo ?? "");
  const [minConf, setMinConf] = useState(filters.minConf?.toString() ?? "");
  const [maxConf, setMaxConf] = useState(filters.maxConf?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const min = parsePercent(minConf);
    const max = parsePercent(maxConf);

    if (min === "invalid" || max === "invalid") {
      setError("Confidence must be a whole number from 0 to 100.");
      return;
    }
    if (min !== null && max !== null && min > max) {
      setError("Minimum confidence cannot be above the maximum.");
      return;
    }
    if (dateFrom !== "" && dateTo !== "" && dateFrom > dateTo) {
      setError("The start date cannot be after the end date.");
      return;
    }

    setError(null);
    onApply({
      label: WASTE_CLASSES.find((item) => item === label) ?? null,
      dateFrom: dateFrom === "" ? null : dateFrom,
      dateTo: dateTo === "" ? null : dateTo,
      minConf: min,
      maxConf: max,
      page: 1,
    });
  }

  function handleClear() {
    setError(null);
    onApply(NO_FILTERS);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-4"
      aria-label="Filter inspections"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Label</span>
          <select
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
            className={inputClass}
          >
            <option value="">All labels</option>
            {WASTE_CLASSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => {
              setDateFrom(event.target.value);
            }}
            className={inputClass}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => {
              setDateTo(event.target.value);
            }}
            className={inputClass}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Min confidence (%)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="0"
            value={minConf}
            onChange={(event) => {
              setMinConf(event.target.value);
            }}
            className={inputClass}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium text-slate-600">Max confidence (%)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="100"
            value={maxConf}
            onChange={(event) => {
              setMaxConf(event.target.value);
            }}
            className={inputClass}
          />
        </label>
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
          onClick={handleClear}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
        >
          Clear
        </button>
        {error !== null && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
