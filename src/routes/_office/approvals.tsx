import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_APPROVALS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/approvals")({
  head: () => ({
    meta: [
      { title: "CanX Office — Approvals Vault" },
      { name: "description", content: "Controlled approvals and authorization in CanX Office." },
      { property: "og:title", content: "CanX Office — Approvals Vault" },
      { property: "og:description", content: "Controlled approvals and authorization in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Approvals,
});

function Approvals() {
  return (
    <RoomShell>
      <Card className="border-l-4 border-l-canx-red border-border bg-card">
        <CardContent className="p-4">
          <p className="text-sm text-foreground">
            Approvals are owner-controlled, time-limited, and non-transferable. MFA and session
            integrity checks are required before any approval can execute external effects.
          </p>
        </CardContent>
      </Card>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_APPROVALS.map((item) => (
          <Card key={item.id} className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{item.action}</CardTitle>
                <StatusBadge tone={item.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Cost: {item.cost}</p>
              <p>Risk: {item.risk}</p>
              <p>Requested: {item.requestedAt}</p>
              <Button className="mt-3" disabled>
                Review
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </RoomShell>
  );
}
