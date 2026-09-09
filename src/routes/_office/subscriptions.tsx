import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";

export const Route = createFileRoute("/_office/subscriptions")({
  head: () => ({
    meta: [
      { title: "CanX Office — Subscriptions" },
      { name: "description", content: "Track recurring costs and service inventory in CanX Office." },
      { property: "og:title", content: "CanX Office — Subscriptions" },
      { property: "og:description", content: "Track recurring costs and service inventory in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Subscriptions,
});

const SUBS = [
  { name: "Lovable", cost: "Credits", status: "green" as const, note: "Development platform" },
  { name: "Supabase (proposed)", cost: "TBD", status: "grey" as const, note: "Backend not selected" },
  { name: "Email sending", cost: "TBD", status: "grey" as const, note: "Not connected" },
  { name: "AI workers", cost: "TBD", status: "grey" as const, note: "Usage-capped when enabled" },
];

function Subscriptions() {
  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Service inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SUBS.map((sub) => (
            <div key={sub.name} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <div className="font-medium">{sub.name}</div>
                <div className="text-xs text-muted-foreground">{sub.note}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{sub.cost}</span>
                <StatusBadge tone={sub.status} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </RoomShell>
  );
}
