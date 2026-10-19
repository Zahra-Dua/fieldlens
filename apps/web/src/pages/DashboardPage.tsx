import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchInspectionStats } from "../features/inspections/api";
import { parseFilters } from "../features/inspections/filters";
import { WASTE_CLASSES } from "../features/inspections/types";
import { getErrorMessage } from "../lib/apiClient";

const filters = parseFilters(new URLSearchParams());
const CLASS_COLORS = ["#2563eb", "#16a34a", "#eab308", "#f97316", "#8b5cf6"];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      <div className="h-64">{children}</div>
    </section>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-56 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="h-5 w-40 rounded bg-slate-200" />
            <div className="mt-6 h-60 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const query = useQuery({
    queryKey: ["inspections", "stats", filters],
    queryFn: ({ signal }) => fetchInspectionStats(filters, signal),
  });

  if (query.isPending) {
    return <DashboardSkeleton />;
  }

  if (query.isError) {
    return (
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">Inspection activity and model results</p>
        </header>
        <section
          role="alert"
          className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-white p-6 text-center"
        >
          <h2 className="text-lg font-semibold text-red-700">Could not load dashboard</h2>
          <p className="max-w-md text-sm text-slate-600">{getErrorMessage(query.error)}</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Try again
          </button>
        </section>
      </div>
    );
  }

  const stats = query.data;
  const hasOverTime = stats.overTime.length > 0;
  const hasDistribution = stats.distribution.length > 0;
  const hasHistogram = stats.confidenceHistogram.some((bucket) => bucket.count > 0);
  const hasLowConfidenceResults = stats.lowConfidence.total > 0;
  const lowConfidenceData = [
    { name: "Low confidence", value: stats.lowConfidence.count },
    {
      name: "Other",
      value: stats.lowConfidence.total - stats.lowConfidence.count,
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-600">Inspection activity and model results</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Inspections over time">
          {hasOverTime ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.overTime} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Inspections"
                  stroke="#2563eb"
                  fill="#bfdbfe"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No inspections to chart yet." />
          )}
        </ChartCard>

        <ChartCard title="Class distribution">
          {hasDistribution ? (
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.distribution}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius="72%"
                    >
                      {stats.distribution.map((entry) => (
                        <Cell
                          key={entry.label}
                          fill={CLASS_COLORS[WASTE_CLASSES.indexOf(entry.label)]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul
                aria-label="Class counts"
                className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-600"
              >
                {stats.distribution.map((entry) => (
                  <li key={entry.label} className="flex items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CLASS_COLORS[WASTE_CLASSES.indexOf(entry.label)] }}
                    />
                    {entry.label}: {entry.count}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ChartEmpty message="No predicted classes to show yet." />
          )}
        </ChartCard>

        <ChartCard title="Confidence distribution">
          {hasHistogram ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats.confidenceHistogram}
                margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="from"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(value) => `${Math.round(Number(value) * 100)}% confidence`}
                />
                <Bar dataKey="count" name="Inspections" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ChartEmpty message="No confidence scores to show yet." />
          )}
        </ChartCard>

        <ChartCard title="Low-confidence results">
          {hasLowConfidenceResults ? (
            <div className="relative h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={lowConfidenceData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="78%"
                  >
                    <Cell fill="#f97316" />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold text-slate-900">
                  {(stats.lowConfidence.share * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-slate-500">below threshold</span>
              </div>
              <p className="absolute bottom-0 left-0 right-0 text-center text-xs text-slate-500">
                {stats.lowConfidence.count} of {stats.lowConfidence.total} results, below{" "}
                {(stats.lowConfidence.threshold * 100).toFixed(0)}% confidence
              </p>
            </div>
          ) : (
            <ChartEmpty message="Low-confidence share will appear when inspections have predictions." />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
