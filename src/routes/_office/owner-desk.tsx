import { createFileRoute, Link } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useManagerMemory, formatCents } from "@/lib/use-manager-memory";
import { useOwnerSession } from "@/lib/owner-session";
import { loadViewerDeskMemory, type ViewerDeskMemory } from "@/lib/owner-desk-viewer.functions";
import { PreTripCard } from "@/components/office/PreTripCard";

export const Route = createFileRoute("/_office/owner-desk")({
  head: () => ({
    meta: [
      { title: "CanX Office" },
      { name: "description", content: "Owner-only CanX operations workspace." },
      { property: "og:title", content: "CanX Office" },
      { property: "og:description", content: "Owner-only CanX operations workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnersDesk,
});

/** An assistant's read-only viewing session reads the desk through its own grant; the owner path is unchanged. */
function useViewerDesk(): { desk: ViewerDeskMemory | null; error: string | null } {
  const { viewer, accessToken } = useOwnerSession();
  const load = useServerFn(loadViewerDeskMemory);
  const [desk, setDesk] = useState<ViewerDeskMemory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewer || !accessToken) {
      setDesk(null);
      setError(null);
      return;
    }
    let cancelled = false;
    load({ data: { accessToken } })
      .then((result) => {
        if (cancelled) return;
        setDesk(result.ok ? result : null);
        setError(result.ok ? null : result.message);
      })
      .catch(() => {
        if (!cancelled) setError("The shared workbench could not be reached.");
      });
    return () => {
      cancelled = true;
    };
  }, [viewer, accessToken, load]);

  return { desk, error };
}

function OwnersDesk() {
  const { viewer } = useOwnerSession();
  const owner = useManagerMemory();
  const viewed = useViewerDesk();
  const { isOwner, sessionMessage } = owner;
  const memory = viewer ? viewed.desk : owner.memory;
  const error = viewer ? viewed.error : owner.error;

  const tasks = memory?.tasks.filter((task) => task.status === "open" || task.status === "in_progress" || task.status === "waiting") ?? null;
  const approvals = memory?.approvals ?? null;
  const budget = owner.memory?.budget ?? null;
  const changes = memory?.changes ?? null;

  const statusLine = memory
    ? viewer
      ? "Read-only viewer copy — the same saved records, read under John's viewing permission. The AI budget is not shared with viewers."
      : "Shared memory — saved in the CanX-owned database."
    : isOwner
      ? error ?? "Shared memory is not available yet. No current status can be reported."
      : sessionMessage;

  return (
    <RoomShell showSample={false}>
      <p className="mb-4 text-xs text-muted-foreground">{statusLine}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        {!viewer && <PreTripCard />}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Today's priorities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tasks
              ? tasks.length === 0
                ? <p className="text-sm text-muted-foreground">No open work is recorded.</p>
                : tasks.slice(0, 5).map((item) => (
                    <div key={item.id} className="rounded-lg border border-border/50 p-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          tone={
                            item.status === "done"
                              ? "green"
                              : item.status === "waiting"
                                ? "yellow"
                              : item.status === "in_progress"
                                ? "blue"
                                : item.status === "cancelled"
                                  ? "red"
                                  : "grey"
                          }
                          label={item.status === "waiting" ? `Waiting — ${item.waiting_reason || "reason not recorded"}` : item.status === "in_progress" ? "Assigned — activity unconfirmed" : item.status.replace("_", " ")}
                        />
                        <span className="font-medium">{item.title}</span>
                      </div>
                      {item.worker && <p className="mt-1 text-xs text-muted-foreground">Worker: {item.worker}</p>}
                    </div>
                  ))
              : <p className="text-sm text-muted-foreground">Live priorities are unavailable. Open the account menu to check owner verification, then refresh the Work Board.</p>}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Pending approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvals
              ? approvals.filter((a) => a.status === "pending").length === 0
                ? <p className="text-sm text-muted-foreground">Nothing is waiting for your approval.</p>
                : approvals
                    .filter((a) => a.status === "pending")
                    .map((item) => (
                      <div key={item.id} className="rounded-lg border border-border/50 p-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge tone="yellow" label="pending" />
                          <span className="font-medium">{item.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Cost: {formatCents(item.cost_cents)} · Risk: {item.risk}
                        </p>
                        <Link to="/approvals" hash={`approval-${item.id}`}
                          className="mt-3 inline-flex min-h-11 items-center rounded border border-canx-yellow px-3 text-sm font-semibold text-canx-yellow">
                          Open details and decide
                        </Link>
                      </div>
                    ))
              : <p className="text-sm text-muted-foreground">Live approvals are unavailable. This does not mean the approval box is empty.</p>}
          </CardContent>
        </Card>

        {budget && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">AI operating budget this month</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>
                Used {formatCents(budget.used_cents)} of {formatCents(budget.ceiling_cents)}
              </p>
              <p>Warning point: {formatCents(budget.warn_cents)}</p>
              <p>
                {budget.paused
                  ? "Paused — the ceiling has been reached."
                  : budget.warning
                    ? "Warning — spending has passed the warning point."
                    : "Within budget."}
              </p>
            </CardContent>
          </Card>
        )}

        {changes && (
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">Recent change log</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              {changes.length === 0 ? (
                <p>No changes recorded yet.</p>
              ) : (
                changes.slice(0, 8).map((change) => (
                  <p key={change.id}>
                    {new Date(change.at).toLocaleString()} · {change.action} · {change.entity}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        )}

        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Office connection status</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Open Systems &amp; Connections for the current session checks. A saved task or a working page does not
            prove an AI worker is running. Background maintenance and restore tests have not been verified here.
          </p>
        </div>
      </div>
    </RoomShell>
  );
}
