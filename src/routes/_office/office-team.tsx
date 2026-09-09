import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_WORKERS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";

export const Route = createFileRoute("/_office/office-team")({
  head: () => ({
    meta: [
      { title: "CanX Office — Office Team" },
      { name: "description", content: "Worker roles and capabilities in CanX Office." },
      { property: "og:title", content: "CanX Office — Office Team" },
      { property: "og:description", content: "Worker roles and capabilities in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfficeTeam,
});

function OfficeTeam() {
  return (
    <RoomShell>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_WORKERS.map((worker) => (
          <Card key={worker.id} className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">{worker.role}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span>{worker.provider}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current job</span>
                <span>{worker.currentJob}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last result</span>
                <span>{worker.lastResult}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reviewer</span>
                <StatusBadge tone={worker.reviewer === "None" ? "grey" : "yellow"} label={worker.reviewer} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </RoomShell>
  );
}
