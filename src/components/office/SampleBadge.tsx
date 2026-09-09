import { FlaskConical } from "lucide-react";

export function SampleBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-canx-yellow/30 bg-canx-yellow/10 px-2 py-0.5 text-xs font-medium text-canx-yellow">
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      Sample data
    </span>
  );
}
