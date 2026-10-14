import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { parseFilters, serializeFilters, type InspectionFilters } from "./filters";

/**
 * The table filters live in the page address (?label=PLASTIC&page=2), not in
 * component state. This way a reload, the back button and a copied link all
 * show the same table.
 */
export function useInspectionFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const update = useCallback(
    (changes: Partial<InspectionFilters>) => {
      setSearchParams((previous) => serializeFilters({ ...parseFilters(previous), ...changes }));
    },
    [setSearchParams],
  );

  return { filters, update };
}
