import { useQuery } from "@tanstack/react-query";
import { fetchDeviceFleet } from "../features/devices/api";
import type { DeviceFleetRow } from "../features/devices/types";
import { getErrorMessage } from "../lib/apiClient";

const statusStyles: Record<DeviceFleetRow["status"], string> = {
  HEALTHY: "bg-emerald-100 text-emerald-700",
  STALE: "bg-amber-100 text-amber-700",
  OFFLINE: "bg-rose-100 text-rose-700",
  UNKNOWN: "bg-slate-100 text-slate-700",
};

function formatLastSeen(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function DeviceFleetPage() {
  const fleet = useQuery({
    queryKey: ["devices", "fleet"],
    queryFn: ({ signal }) => fetchDeviceFleet(signal),
  });

  if (fleet.isPending) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-56 animate-pulse rounded bg-slate-200" />
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="h-12 border-b border-slate-200 bg-slate-50" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 border-b border-slate-100 px-4 py-4">
              <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (fleet.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700"
      >
        <span>Could not load devices. {getErrorMessage(fleet.error)}</span>
        <button
          type="button"
          onClick={() => void fleet.refetch()}
          className="rounded-md border border-rose-300 px-3 py-1.5 text-sm font-medium hover:bg-rose-100"
        >
          Retry
        </button>
      </div>
    );
  }

  const devices = fleet.data;

  if (devices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-lg font-medium text-slate-900">No devices registered</p>
        <p className="mt-2 text-sm text-slate-600">
          Devices will appear here when they register and send their first heartbeat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Device fleet</h1>
          <p className="text-sm text-slate-600">
            {devices.length} device{devices.length === 1 ? "" : "s"} tracked
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50 text-sm text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Device</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Assigned user</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Inspections</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {devices.map((device) => (
              <tr key={device.id} className="align-middle">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {device.name ?? device.deviceUuid.slice(0, 8)}
                  </div>
                  <div className="text-xs text-slate-500">{device.deviceUuid}</div>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{device.platform}</td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {device.currentModelVersion ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {device.user?.name ?? "Unassigned"}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">
                  {formatLastSeen(device.lastSeenAt)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{device.inspectionCount}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusStyles[device.status]}`}
                  >
                    {device.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
