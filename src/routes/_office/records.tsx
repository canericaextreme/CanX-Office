import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/records")({
  head: () => ({
    meta: [
      { title: "CanX Office — Records Room" },
      { name: "description", content: "Permanent, append-only records in CanX Office." },
      { property: "og:title", content: "CanX Office — Records Room" },
      { property: "og:description", content: "Permanent, append-only records in CanX Office." },
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
        <Card className="border-border bg-card">
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
        </Card>
        <Button disabled>Export sample record pack</Button>
        <p className="text-xs text-muted-foreground">
          Exports require a backend to be selected and configured.
        </p>
      </div>
    </RoomShell>
  );
}
