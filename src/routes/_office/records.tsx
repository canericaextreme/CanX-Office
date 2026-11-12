import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KnowledgeRecordPanel } from "@/components/office/KnowledgeRecordPanel";
import { OFFICE_KNOWLEDGE } from "@/lib/office-knowledge";
import { RoomBox } from "@/components/office/RoomLayout";

export const Route = createFileRoute("/_office/records")({
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
  component: Records,
});

function Records() {
  return (
    <RoomShell>
      <div className="space-y-6">
        {OFFICE_KNOWLEDGE.map((record) => (
          <RoomBox key={record.id} id={`records.knowledge-${record.id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} name={record.title}>
            <KnowledgeRecordPanel record={record} defaultOpen />
          </RoomBox>
        ))}
        <RoomBox id="records.classes" name="Record classes"><Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Record classes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Status history — append-only, never overwritten</li>
              <li>Routing decisions — evidence and authority recorded</li>
              <li>AI recommendations — kept separate from human decisions</li>
              <li>Approvals — who, when, scope, expiry</li>
              <li>Audit exports — portable formats</li>
            </ul>
          </CardContent>
        </Card></RoomBox>
        <RoomBox id="records.export" name="Export sample record pack"><Button disabled>Export sample record pack</Button>
        <p className="text-xs text-muted-foreground">
          Exports require a backend to be selected and configured.
        </p></RoomBox>
      </div>
    </RoomShell>
  );
}
