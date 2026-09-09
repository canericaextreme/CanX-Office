import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";

export const Route = createFileRoute("/_office/systems")({
  head: () => ({
    meta: [
      { title: "CanX Office — Systems" },
      { name: "description", content: "Infrastructure, integrations, and environment status in CanX Office." },
      { property: "og:title", content: "CanX Office — Systems" },
      { property: "og:description", content: "Infrastructure, integrations, and environment status in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Systems,
});

const SYSTEMS = [
  { name: "Preview environment", status: "green" as const, note: "Lovable preview" },
  { name: "Published site", status: "grey" as const, note: "Not published" },
  { name: "Database", status: "grey" as const, note: "Not connected" },
  { name: "Authentication", status: "grey" as const, note: "Not connected" },
  { name: "Backups", status: "grey" as const, note: "Pending backend decision" },
];

function Systems() {
  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Environment status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SYSTEMS.map((system) => (
            <div key={system.name} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <div className="font-medium">{system.name}</div>
                <div className="text-xs text-muted-foreground">{system.note}</div>
              </div>
              <StatusBadge tone={system.status} />
            </div>
          ))}
        </CardContent>
      </Card>
    </RoomShell>
  );
}
