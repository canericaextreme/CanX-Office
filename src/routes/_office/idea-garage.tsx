import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IDEA_PROVENANCE_LABELS, ideasForStage, type IdeaCard } from "@/lib/idea-garage";
import { IdeaLab } from "@/components/office/IdeaLab";

function IdeaCardView({ idea }: { idea: IdeaCard }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-background/60 p-4 text-left">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{idea.title}</span>
        <Badge variant="outline" className="text-[11px]">
          {idea.status}
        </Badge>
        <Badge variant="secondary" className="text-[11px]">
          {IDEA_PROVENANCE_LABELS[idea.provenance]}
        </Badge>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Captured {idea.captured} · Requested by {idea.requestedBy}
      </p>
      <p className="mt-2 text-sm text-foreground">{idea.workingSummary}</p>
      {idea.summaryNote && (
        <p className="mt-1 text-[11px] italic text-muted-foreground">{idea.summaryNote}</p>
      )}
      <ul className="mt-3 space-y-1">
        {idea.toExplore.map((f) => (
          <li key={f.label} className="text-xs text-muted-foreground">
            <span className="text-foreground">{f.label}:</span> {f.value}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {idea.notAssessed.join(", ")}: Not assessed
      </p>
      <p className="mt-2 text-xs">
        <span className="font-medium text-foreground">Next step:</span>{" "}
        <span className="text-muted-foreground">{idea.nextStep}</span>
      </p>
    </div>
  );
}

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
      <div className="mb-8">
        <IdeaLab />
      </div>
      <h2 className="mb-3 text-lg font-semibold text-foreground">Decision stages</h2>
      <div className="grid gap-6 lg:grid-cols-3">
        {STAGES.map((stage) => {
          const ideas = ideasForStage(stage.name);
          return (
            <Card key={stage.name} className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-base">{stage.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{stage.desc}</p>
                {ideas.map((idea) => (
                  <IdeaCardView key={idea.id} idea={idea} />
                ))}
                {ideas.length === 0 && (
                  <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    No ideas here yet — demonstration stage
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
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
