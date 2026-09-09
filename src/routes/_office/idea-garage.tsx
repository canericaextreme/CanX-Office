import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/idea-garage")({
  head: () => ({
    meta: [
      { title: "CanX Office — Idea Garage" },
      { name: "description", content: "Evaluate ideas and income experiments in CanX Office." },
      { property: "og:title", content: "CanX Office — Idea Garage" },
      { property: "og:description", content: "Evaluate ideas and income experiments in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IdeaGarage,
});

const STAGES = [
  { name: "Bike rack", desc: "Raw ideas, no filtering yet" },
  { name: "Bulletin board", desc: "Contenders with evidence" },
  { name: "Decision table", desc: "Scored against criteria" },
  { name: "Approved experiment", desc: "John chooses the test" },
  { name: "Park / reject", desc: "Reasoned closure" },
];

function IdeaGarage() {
  return (
    <RoomShell>
      <div className="grid gap-6 lg:grid-cols-3">
        {STAGES.map((stage) => (
          <Card key={stage.name} className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-base">{stage.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{stage.desc}</p>
              <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                No ideas here yet — demonstration stage
              </div>
            </CardContent>
          </Card>
        ))}
        <Card className="border-border bg-card lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Income goal context</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Target: approximately CAD $10,000/month by around August 2028. Baseline needed before
              showing progress. Currency and definition (revenue, profit, or personal income) must be
              confirmed.
            </p>
            <Button className="mt-4" disabled>
              Confirm baseline
            </Button>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
