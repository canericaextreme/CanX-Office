import { BrainHub } from "@/components/office/BrainHub";
import { BrainDocuments } from "@/components/office/BrainDocuments";
import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { BrainMap } from "@/components/office/BrainMap";
import { BrainMemory } from "@/components/office/BrainMemory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_office/brain")({
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
  component: Brain,
});

function Brain() {
  return (
    <RoomShell showFiles={false} showSample={false}>
      <div className="space-y-6">
        <BrainHub />
        <div id="brain-documents"><BrainDocuments /></div>
        <div id="brain-memory"><BrainMemory /></div>
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
