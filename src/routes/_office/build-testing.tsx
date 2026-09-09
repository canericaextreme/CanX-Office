import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/build-testing")({
  head: () => ({
    meta: [
      { title: "CanX Office — Build & Testing" },
      { name: "description", content: "Controlled development, review findings, and release gates in CanX Office." },
      { property: "og:title", content: "CanX Office — Build & Testing" },
      { property: "og:description", content: "Controlled development, review findings, and release gates in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuildTesting,
});

const GATES = [
  { name: "Brief", state: "Sample brief drafted" },
  { name: "Review findings", state: "Pending independent review" },
  { name: "Tests", state: "Not run" },
  { name: "Release gate", state: "Blocked — Phase 1 only" },
  { name: "Rollback plan", state: "To be documented" },
];

function BuildTesting() {
  return (
    <RoomShell>
      <div className="space-y-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Change pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {GATES.map((gate) => (
              <div key={gate.name} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                <span className="font-medium">{gate.name}</span>
                <span className="text-sm text-muted-foreground">{gate.state}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Button disabled>Propose a change</Button>
      </div>
    </RoomShell>
  );
}
