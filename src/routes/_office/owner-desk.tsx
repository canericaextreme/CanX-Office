import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";
import { useManagerMemory, formatCents } from "@/lib/use-manager-memory";

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

function OwnersDesk() {
  const { memory, error, isOwner, sessionMessage } = useManagerMemory();

  const tasks = memory?.tasks.filter((task) => task.status === "open" || task.status === "in_progress") ?? null;
  const approvals = memory?.approvals ?? null;
  const budget = memory?.budget ?? null;
  const changes = memory?.changes ?? null;

  const statusLine = memory
    ? "Shared memory — saved in the CanX-owned database."
    : isOwner
      ? error ?? "Shared memory is not available yet. No current status can be reported."
      : sessionMessage;

  return (
    <RoomShell showSample={false}>
      <p className="mb-4 text-xs text-muted-foreground">{statusLine}</p>
      <div className="grid gap-6 lg:grid-cols-2">
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
                              : item.status === "in_progress"
                                ? "blue"
                                : item.status === "cancelled"
                                  ? "red"
                                  : "grey"
                          }
                          label={item.status.replace("_", " ")}
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
