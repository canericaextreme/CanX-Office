import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_office/future")({
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
  component: Future,
});

function Future() {
  return (
    <RoomShell>
      <Card className="border-dashed border-border bg-card/50">
        <CardHeader>
          <CardTitle className="text-base">Reserved expansion</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This room is intentionally empty. It will not contain pretend staff, fake budget, or
            unapproved capabilities. New departments are added only after explicit Phase 4+ planning.
          </p>
        </CardContent>
      </Card>
    </RoomShell>
  );
}
