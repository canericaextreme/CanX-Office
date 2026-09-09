import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_PROJECTS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/projects")({
  head: () => ({
    meta: [
      { title: "CanX Office — Project Rooms" },
      { name: "description", content: "Separate workstreams for CanX projects." },
      { property: "og:title", content: "CanX Office — Project Rooms" },
      { property: "og:description", content: "Separate workstreams for CanX projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Projects,
});

function Projects() {
  return (
    <RoomShell>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SAMPLE_PROJECTS.map((project) => (
          <Card key={project.id} className="border-border bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{project.name}</CardTitle>
                <StatusBadge tone={project.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{project.healthText}</p>
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">
                  Open: <span className="text-foreground">{project.tasksOpen}</span>
                </span>
                <span className="text-muted-foreground">
                  Done: <span className="text-foreground">{project.tasksDone}</span>
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card className="flex flex-col items-center justify-center border-dashed border-border bg-card/50 p-6 text-center">
          <CardContent>
            <Button disabled>Create project from template</Button>
            <p className="mt-2 text-xs text-muted-foreground">
              New projects use a configurable template. Disabled in Phase 1.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
