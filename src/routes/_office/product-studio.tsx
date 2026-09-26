import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { RoomShell } from "@/components/office/RoomShell";
import { CodexBuildPanel } from "@/components/office/CodexBuildPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useManagerMemory } from "@/lib/use-manager-memory";
import { createManagerTask } from "@/lib/manager-work.functions";

export const Route = createFileRoute("/_office/product-studio")({
  head: () => ({ meta: [{ title: "Product Studio | CanX Office" }] }),
  component: ProductStudio,
});

const STATIONS = [
  {
    title: "QA & Testing",
    detail:
      "Check the agreed result, review defects, and record evidence from real use. Keep automated checks and live testing separate.",
    checks: [
      "Acceptance checks and independent review",
      "Real device, voice or offline checks where needed",
      "Unresolved defects and rollback plan",
    ],
  },
  {
    title: "Publishing & Content",
    detail:
      "Develop books, manuscripts, guides and other content from source material through review to release.",
    checks: [
      "Source material, outline and manuscript",
      "Editing, source checks and permissions",
      "Proofread the final layout and export",
    ],
  },
  {
    title: "Launch & Market",
    detail:
      "Prepare a clear offer and a release plan. Record the actual release link and customer feedback after launch.",
    checks: [
      "Audience, offer and price proposal",
      "Release plan, support and handover",
      "Customer feedback and next improvements",
    ],
  },
];

function ProductStudio() {
  const { memory, loading, error, isOwner, accessToken, sessionMessage, refresh } =
    useManagerMemory();
  const createTask = useServerFn(createManagerTask);
  const [project, setProject] = useState("");
  const [kind, setKind] = useState("App");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  async function saveBrief(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current || !accessToken || !isOwner || !project.trim() || !brief.trim()) return;
    saving.current = true;
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      const result = await createTask({
        data: {
          accessToken,
          title: `Product brief: ${project.trim()}`,
          project: project.trim(),
          detail: `Product Studio · ${kind}\nProject: ${project.trim()}\n${brief.trim()}\nPlanning brief only; no build or release started.`,
          risk: "green",
        },
      });
      if ("ok" in result && result.ok === false) {
        setProblem(result.message);
      } else if ("id" in result && result.id) {
        setNotice(
          `Brief saved to the shared Work Board (${result.id}). Data can read it. No build has started.`,
        );
        setBrief("");
        refresh();
        window.dispatchEvent(new Event("canx:workbench-changed"));
      } else {
        setProblem("No saved record was returned. Check the Work Board before trying again.");
      }
    } catch {
      setProblem("The save could not be confirmed. Check the Work Board before trying again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const tasks = memory?.tasks.filter((task) => task.detail?.startsWith("Product Studio ·")) ?? [];

  return (
    <RoomShell showSample={false}>
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-5 space-y-3" aria-label="Product workflow">
          <p className="font-medium">One place to take an idea through to a finished product.</p>
          <p className="text-sm text-muted-foreground">
            Apps and websites: Idea Garage → Product Studio → QA → Launch.
          </p>
          <p className="text-sm text-muted-foreground">
            Books: Idea or manuscript → Publishing → Review → Release.
          </p>
          <nav aria-label="Related workspaces" className="flex flex-wrap gap-4 text-sm underline">
            <Link to="/idea-garage">Idea Garage</Link>
            <Link to="/projects">Project Rooms</Link>
            <Link to="/work-board">Shared Work Board</Link>
            <Link to="/round-table">Boardroom / Round Table</Link>
          </nav>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Start with a product brief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tell Data what you want, or save the brief here. Include who it is for, what it should
              do, what is included, and how we will know it works.
            </p>
            {!isOwner && <p role="status">{sessionMessage}</p>}
            <form onSubmit={saveBrief} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="studio-project">Project name</Label>
                  <Input
                    id="studio-project"
                    maxLength={160}
                    required
                    value={project}
                    onChange={(event) => setProject(event.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studio-kind">Product type</Label>
                  <select
                    id="studio-kind"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={kind}
                    onChange={(event) => setKind(event.target.value)}
                    disabled={busy}
                  >
                    {["App", "Website", "Book", "Other product"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="studio-brief">Brief and acceptance checks</Label>
                <Textarea
                  id="studio-brief"
                  rows={6}
                  required
                  maxLength={1600}
                  value={brief}
                  onChange={(event) => setBrief(event.target.value)}
                  disabled={busy}
                  placeholder="Audience, intended result, scope, source material, and checks for completion…"
                />
              </div>
              <Button type="submit" disabled={!isOwner || busy || !project.trim() || !brief.trim()}>
                {busy ? "Saving…" : "Save brief to Work Board"}
              </Button>
            </form>
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-3" aria-label="Product Studio stations">
          {STATIONS.map((station) => (
            <Card key={station.title}>
              <CardHeader>
                <CardTitle className="text-base">{station.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{station.detail}</p>
                <ul className="list-disc space-y-2 pl-5">
                  {station.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Checklist only — completion needs recorded evidence.
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Saved Studio briefs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p role="status">Loading shared records…</p>}
            {error && <p role="alert">{error}</p>}
            {memory && !tasks.length && <p>No Studio briefs in the loaded Work Board records.</p>}
            {tasks.map((task) => (
              <article key={task.id} className="rounded-lg border p-3 space-y-2">
                <h3 className="font-medium">{task.title}</h3>
                <p className="text-xs text-muted-foreground">
                  Work Board status: {task.status.replaceAll("_", " ")}
                </p>
                <p className="whitespace-pre-wrap text-sm">{task.detail}</p>
                <Link to="/work-board" className="text-sm underline">
                  Manage task and record evidence
                </Link>
              </article>
            ))}
          </CardContent>
        </Card>

        <CodexBuildPanel />
        <p className="text-sm text-muted-foreground">
          Builds use the existing connection and approval controls.{" "}
          <Link to="/build-testing" className="underline">
            Open Build & Testing
          </Link>{" "}
          for the existing build workspace.
        </p>
      </div>
    </RoomShell>
  );
}
