import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/safe-highways")({
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
  component: SafeHighways,
});

const COMPONENTS = [
  { name: "Public Reporting App", status: "grey" as const, note: "No live connection" },
  { name: "Foreman Dashboard", status: "grey" as const, note: "No live connection" },
  { name: "Operations Centre", status: "grey" as const, note: "No live connection" },
  { name: "Master Oversight", status: "grey" as const, note: "No live connection" },
  { name: "Public Website", status: "grey" as const, note: "No live connection" },
];

function SafeHighways() {
  return (
    <RoomShell>
      <div className="space-y-6">
        <Card className="border-l-4 border-l-canx-red border-border bg-card">
          <CardContent className="p-4">
            <p className="text-sm text-foreground">
              CanX Office oversees Safe Highways; it does not replace its reporting app or rewrite
              its architecture. This room is read-only and disconnected in Phase 1.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMPONENTS.map((c) => (
            <Card key={c.name} className="border-border bg-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <StatusBadge tone={c.status} />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{c.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Routing evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Report → verified routing → operational review → foreman/crew action → completion or
              reasoned closure → reporter notification → permanent record → analytics. Live routing
              data requires a scoped Phase 3 connection.
            </p>
            <Button className="mt-4" disabled>
              Request read-only inventory connection
            </Button>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
