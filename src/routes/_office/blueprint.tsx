import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_office/blueprint")({
  head: () => ({
    meta: [
      { title: "CanX Office — Blueprint Room" },
      { name: "description", content: "Architecture, plans, and decisions in CanX Office." },
      { property: "og:title", content: "CanX Office — Blueprint Room" },
      { property: "og:description", content: "Architecture, plans, and decisions in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Blueprint,
});

const DECISIONS = [
  { topic: "Backend provider", decision: "Open — compare Lovable Cloud vs CanX Supabase" },
  { topic: "3D office", decision: "CSS 3D transforms for Phase 1; WebGL optional later" },
  { topic: "AI workers", decision: "Not enabled until approval integrity and cost limits exist" },
  { topic: "Stripe", decision: "Phase 4+ after legal and finance review" },
];

function Blueprint() {
  return (
    <RoomShell>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Architecture principles</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Configuration-driven Canadian platform</li>
              <li>Provincial configurations, national core</li>
              <li>Evidence-led status history</li>
              <li>Human authority over safety-critical AI</li>
              <li>Portable, independently rebuildable</li>
            </ul>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Key decisions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DECISIONS.map((d) => (
              <div key={d.topic} className="rounded-lg border border-border/50 p-3">
                <div className="font-medium">{d.topic}</div>
                <div className="text-sm text-muted-foreground">{d.decision}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
