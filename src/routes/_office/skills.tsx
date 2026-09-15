import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/skills")({
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
  component: Skills,
});

const SKILLS = [
  { name: "Phase 0 planning", level: "Approved", note: "Completed" },
  { name: "Visual office shell", level: "Approved", note: "In progress" },
  { name: "Backend selection", level: "Not approved", note: "Pending decision" },
  { name: "Stripe integration", level: "Not approved", note: "Phase 4+" },
];

function Skills() {
  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Approved capabilities</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SKILLS.map((skill) => (
            <div key={skill.name} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <div className="font-medium">{skill.name}</div>
                <div className="text-xs text-muted-foreground">{skill.note}</div>
              </div>
              <span className="text-sm text-muted-foreground">{skill.level}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Button className="mt-4" disabled>
        Propose new skill
      </Button>
    </RoomShell>
  );
}
