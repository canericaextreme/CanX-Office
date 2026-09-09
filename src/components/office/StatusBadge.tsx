import { STATUS_COLORS, type StatusTone } from "@/lib/office-data";

interface StatusBadgeProps {
  tone: StatusTone;
  label?: string;
}

const LABELS: Record<StatusTone, string> = {
  green: "Verified",
  blue: "Active",
  yellow: "Needs input",
  red: "Stop",
  grey: "Unknown / stale",
};

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: `${STATUS_COLORS[tone]}20`,
        color: STATUS_COLORS[tone],
        border: `1px solid ${STATUS_COLORS[tone]}40`,
      }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: STATUS_COLORS[tone] }}
        aria-hidden="true"
      />
      {label ?? LABELS[tone]}
    </span>
  );
}
