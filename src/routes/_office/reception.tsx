import { createFileRoute, Link } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_office/reception")({
  component: ReceptionRoom,
});

function ReceptionRoom() {
  return (
    <RoomShell title="Reception" showSample={false}>
      <Card>
        <CardHeader>
          <CardTitle>Welcome to CanX Office</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Talk to Elsie about what you need, or open a room to review your work.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => window.dispatchEvent(new CustomEvent("canx:open-manager"))}>
              Talk to Elsie
            </Button>
            <Button asChild variant="outline"><Link to="/work-board">Work Board</Link></Button>
            <Button asChild variant="outline"><Link to="/brain">Brain</Link></Button>
            <Button asChild variant="outline"><Link to="/approvals">Approvals</Link></Button>
            <Button asChild variant="outline"><Link to="/">Office map</Link></Button>
          </div>
        </CardContent>
      </Card>
    </RoomShell>
  );
}
