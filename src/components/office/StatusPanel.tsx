import { STATUS_HELP, type StatusItem } from "@/lib/office-data";
import { StatusBadge } from "./StatusBadge";

interface StatusPanelProps {
  items: StatusItem[];
}

export function StatusPanel({ items }: StatusPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Office status
      </h2>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-border/50 bg-background/50 p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusBadge tone={item.tone} />
              <span className="font-medium text-foreground">{item.title}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {STATUS_HELP[item.tone]}
              {item.scope && ` — Scope: ${item.scope}`}
              {item.evidence && ` — Evidence: ${item.evidence}`}
              {item.time && ` — Time: ${item.time}`}
              {item.question && ` — Question: ${item.question}`}
              {item.reason && ` — Reason: ${item.reason}`}
              {item.cause && ` — Cause: ${item.cause}`}
              {item.effect && ` — Effect: ${item.effect}`}
              {item.action && ` — Safe action: ${item.action}`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
