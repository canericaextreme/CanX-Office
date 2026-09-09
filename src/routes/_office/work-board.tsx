import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_WORK_ITEMS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";

export const Route = createFileRoute("/_office/work-board")({
  head: () => ({
    meta: [
      { title: "CanX Office — Work Board" },
      { name: "description", content: "Canonical work queue for CanX Office." },
      { property: "og:title", content: "CanX Office — Work Board" },
      { property: "og:description", content: "Canonical work queue for CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkBoard,
});

function WorkBoard() {
  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Canonical queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SAMPLE_WORK_ITEMS.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={item.status} />
                <span className="font-medium">{item.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Project: {item.project}</p>
              {item.blocker && (
                <p className="mt-1 text-xs text-canx-yellow">Blocker: {item.blocker}</p>
              )}
              {item.evidence && (
                <p className="mt-1 text-xs text-canx-green">Evidence: {item.evidence}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </RoomShell>
  );
}
