/**
 * Office-wide approval notice.
 *
 * Shows a small, dismissible bar whenever real approval requests are waiting
 * for the owner. It only appears for a verified owner session reading the
 * CanX-owned database; it never invents counts from sample data.
 */

import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useManagerMemory } from "@/lib/use-manager-memory";

export function ApprovalAlert() {
  const { memory, refresh } = useManagerMemory();
  const location = useLocation();
  const [dismissedCount, setDismissedCount] = useState<number | null>(null);

  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener("canx:workbench-changed", onChanged);
    return () => window.removeEventListener("canx:workbench-changed", onChanged);
  }, [refresh]);

  const pending = (memory?.approvals ?? []).filter((a) => a.status === "pending").length;

  if (pending === 0) return null;
  if (dismissedCount === pending) return null;
  if (location.pathname.startsWith("/approvals")) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-canx-yellow/60 bg-card px-3 py-2 shadow-2xl"
    >
      <BellRing className="h-4 w-4 shrink-0 text-canx-yellow" aria-hidden="true" />
      <span className="truncate text-sm text-foreground">
        {pending === 1 ? "1 item needs your approval" : `${pending} items need your approval`}
      </span>
      <Button asChild size="sm" variant="outline" className="h-8">
        <Link to="/approvals">Review</Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Hide the approval notice"
        onClick={() => setDismissedCount(pending)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
