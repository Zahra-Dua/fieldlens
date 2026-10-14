interface StateMessageProps {
  title: string;
  message: string;
  tone?: "neutral" | "error";
  action?: { label: string; onClick: () => void };
}

/** Used for the empty state and the error state of a list. */
export default function StateMessage({
  title,
  message,
  tone = "neutral",
  action,
}: StateMessageProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className="flex min-h-[24rem] flex-col items-center justify-center gap-2 px-4 text-center"
    >
      <h2
        className={`text-lg font-semibold ${tone === "error" ? "text-red-700" : "text-slate-800"}`}
      >
        {title}
      </h2>
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {action !== undefined && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
