import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getErrorMessage } from "../lib/apiClient";
import { fetchInspections } from "../features/inspections/api";
import { filterKey, hasActiveFilters } from "../features/inspections/filters";
import FilterBar from "../features/inspections/FilterBar";
import InspectionsTable from "../features/inspections/InspectionsTable";
import Pagination from "../features/inspections/Pagination";
import StateMessage from "../features/inspections/StateMessage";
import TableSkeleton from "../features/inspections/TableSkeleton";
import type { SortBy } from "../features/inspections/types";
import { useInspectionFilters } from "../features/inspections/useInspectionFilters";

export default function InspectionsPage() {
  const { filters, update } = useInspectionFilters();

  // The filters are part of the query key, so every filter, sort and page
  // is its own request to the server. The server does the filtering.
  // keepPreviousData shows the old rows (dimmed) while the next ones load,
  // so the table does not flash empty or change height.
  const query = useQuery({
    queryKey: ["inspections", "list", filters],
    queryFn: ({ signal }) => fetchInspections(filters, signal),
    placeholderData: keepPreviousData,
  });

  function handleSort(column: SortBy) {
    update({
      sortBy: column,
      sortOrder: filters.sortBy === column && filters.sortOrder === "desc" ? "asc" : "desc",
      page: 1,
    });
  }

  function renderResults() {
    if (query.isPending) {
      return <TableSkeleton />;
    }

    if (query.isError) {
      return (
        <StateMessage
          tone="error"
          title="Could not load inspections"
          message={getErrorMessage(query.error)}
          action={{
            label: "Try again",
            onClick: () => {
              void query.refetch();
            },
          }}
        />
      );
    }

    const { data: rows, total, totalPages } = query.data;

    if (rows.length === 0 && filters.page > 1 && total > 0) {
      return (
        <StateMessage
          title="This page is empty"
          message="There are fewer results than this page number."
          action={{
            label: "Go to the first page",
            onClick: () => {
              update({ page: 1 });
            },
          }}
        />
      );
    }

    if (rows.length === 0) {
      return hasActiveFilters(filters) ? (
        <StateMessage
          title="No inspections match these filters"
          message="Try a wider date range or a different label or confidence."
          action={{
            label: "Clear filters",
            onClick: () => {
              update({
                label: null,
                dateFrom: null,
                dateTo: null,
                minConf: null,
                maxConf: null,
                page: 1,
              });
            },
          }}
        />
      ) : (
        <StateMessage
          title="No inspections yet"
          message="Inspections appear here after field workers sync them from the app."
        />
      );
    }

    return (
      <>
        <InspectionsTable rows={rows} filters={filters} onSort={handleSort} />
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          total={total}
          onChange={(page) => {
            update({ page });
          }}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Inspections</h1>
        <p className="text-sm text-slate-600">
          {query.data !== undefined
            ? `${query.data.total} ${query.data.total === 1 ? "inspection" : "inspections"}`
            : "Loading..."}
        </p>
      </header>

      <FilterBar key={filterKey(filters)} filters={filters} onApply={update} />

      <section
        aria-busy={query.isFetching}
        className={`rounded-xl border border-slate-200 bg-white transition-opacity ${
          query.isPlaceholderData ? "opacity-60" : "opacity-100"
        }`}
      >
        {renderResults()}
      </section>
    </div>
  );
}
