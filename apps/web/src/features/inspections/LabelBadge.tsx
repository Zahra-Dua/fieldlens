import type { WasteClass } from "./types";

// Full class names, so Tailwind can find them.
const STYLES: Record<WasteClass, string> = {
  GLASS: "bg-teal-100 text-teal-800",
  METAL: "bg-slate-200 text-slate-800",
  ORGANIC: "bg-green-100 text-green-800",
  PAPER: "bg-amber-100 text-amber-800",
  PLASTIC: "bg-blue-100 text-blue-800",
};

export default function LabelBadge({ label }: { label: WasteClass }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[label]}`}>
      {label}
    </span>
  );
}
