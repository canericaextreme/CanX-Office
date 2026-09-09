import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { BrainMap } from "@/components/office/BrainMap";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_office/brain")({
  head: () => ({
    meta: [
      { title: "CanX Office — CanX Brain" },
      { name: "description", content: "Interactive brain map of CanX Office projects, workers, and connections." },
      { property: "og:title", content: "CanX Office — CanX Brain" },
      { property: "og:description", content: "Interactive brain map of CanX Office projects, workers, and connections." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Brain,
});

function Brain() {
  return (
    <RoomShell>
      <div className="space-y-6">
        <BrainMap />
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Growth history</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No recorded changes yet. Growth will appear here after approved skills, added
              projects, verified sources, or completed work items are recorded.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
