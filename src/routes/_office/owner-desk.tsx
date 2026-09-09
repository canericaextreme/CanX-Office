import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { StatusPanel } from "@/components/office/StatusPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_STATUS, SAMPLE_APPROVALS, SAMPLE_WORK_ITEMS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";

export const Route = createFileRoute("/_office/owner-desk")({
  head: () => ({
    meta: [
      { title: "CanX Office — Owner's Desk" },
      { name: "description", content: "John's daily overview in CanX Office." },
      { property: "og:title", content: "CanX Office — Owner's Desk" },
      { property: "og:description", content: "John's daily overview in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OwnersDesk,
});

function OwnersDesk() {
  return (
    <RoomShell>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Today's priorities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SAMPLE_WORK_ITEMS.slice(0, 3).map((item) => (
              <div key={item.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={item.status} />
                  <span className="font-medium">{item.title}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.project}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Pending approvals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SAMPLE_APPROVALS.map((item) => (
              <div key={item.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={item.status} />
                  <span className="font-medium">{item.action}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cost: {item.cost} · Risk: {item.risk}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <StatusPanel items={SAMPLE_STATUS} />
        </div>
      </div>
    </RoomShell>
  );
}
