"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { loadSharedRoundTable, saveSharedRoundTable } from "@/lib/records.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TIMEZONE_OPTIONS,
  loadRoundTable,
  newId,
  saveRoundTable,
  seedRoundTable,
  validateRoundTable,
  type RoundTableDoc,
} from "@/lib/round-table";

export const Route = createFileRoute("/_office/round-table")({
  head: () => ({
    meta: [
      { title: "Monday round table draft — CanX Office" },
      {
        name: "description",
        content:
          "Draft agenda, roles, notes, decisions, and actions for the CanX Office round table on Monday 14 September 2026.",
      },
      { property: "og:title", content: "Monday round table draft — CanX Office" },
      {
        property: "og:description",
        content: "Editable draft agenda and decision log for the CanX Office Monday round table.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoundTablePage,
});

function RoundTablePage() {
  const [doc, setDoc] = useState<RoundTableDoc>(() => seedRoundTable());
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const session = useOwnerSession();
  const shared = session.shared;
  const token = session.accessToken ?? "";
  const loadShared = useServerFn(loadSharedRoundTable);
  const pushShared = useServerFn(saveSharedRoundTable);

  useEffect(() => {
    setDoc(loadRoundTable());
    setLoaded(true);
  }, []);

  const update = (patch: Partial<RoundTableDoc>) => setDoc((current) => ({ ...current, ...patch }));

  const save = () => {
    const saved = saveRoundTable(doc);
    setDoc(saved);
    if (!shared) {
      setMessage("Saved on this device.");
      return;
    }
    void pushShared({ data: { accessToken: token, doc: JSON.stringify(saved) } })
      .then((result) =>
        setMessage(
          result.ok
            ? "Saved to your CanX account, so it is available on any device you sign in on."
            : "Saved on this device. The CanX account save did not go through.",
        ),
      )
      .catch(() => setMessage("Saved on this device. The CanX account save did not go through."));
  };

  const reload = () => {
    if (!shared) {
      setDoc(loadRoundTable());
      setMessage("Reloaded the last saved version from this device.");
      return;
    }
    void loadShared({ data: { accessToken: token } })
      .then((result) => {
        if (result.ok && result.data) {
          const { doc: parsed } = validateRoundTable(JSON.parse(result.data) as unknown);
          if (parsed) {
            setDoc(parsed);
            setMessage("Reloaded the version saved in your CanX account.");
            return;
          }
        }
        setDoc(loadRoundTable());
        setMessage("Reloaded the last saved version from this device.");
      })
      .catch(() => {
        setDoc(loadRoundTable());
        setMessage("Reloaded the last saved version from this device.");
      });
  };

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `canx-round-table-${doc.date}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Exported a copy to your downloads.");
  };

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const { doc: imported, error } = validateRoundTable(JSON.parse(text) as unknown);
      if (!imported) {
        setMessage(error ?? "That file could not be read.");
        return;
      }
      setDoc(imported);
      setMessage("Imported. Nothing in the file was run — only text fields were read. Save to keep it.");
    } catch {
      setMessage("That file could not be read as a round table record.");
    }
  };

  const totalMinutes = doc.agenda.reduce((sum, item) => sum + item.minutes, 0);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6 border-b border-border pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-foreground">Monday round table — draft</h1>
            <span className="rounded-full border border-canx-yellow/60 bg-canx-yellow/15 px-2 py-0.5 text-xs font-semibold text-canx-yellow">
              Not scheduled
            </span>
            <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {shared ? "Saved to your CanX account" : "Saved on this device only"}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            A working paper for Monday 14 September 2026. No invitations are sent, no calendar entry exists, and nothing
            runs on its own. Everything on this page can be edited, saved, exported, and brought back later. Reach it any
            time from <Link to="/owner-desk" className="text-primary underline">Owner's Desk</Link> or{" "}
            <Link to="/office-team" className="text-primary underline">Office Team</Link>.
          </p>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          <Button onClick={save}><Save className="mr-1.5 h-4 w-4" /> Save</Button>
          <Button variant="outline" onClick={reload}><RotateCcw className="mr-1.5 h-4 w-4" /> Reload saved</Button>
          <Button variant="outline" onClick={exportFile}><Download className="mr-1.5 h-4 w-4" /> Export</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" /> Import</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="sr-only"
            aria-label="Import a round table file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = "";
            }}
          />
        </div>

        {message && (
          <p role="status" className="mb-5 rounded-md border border-border bg-secondary px-3 py-2 text-sm text-foreground">
            {message}
          </p>
        )}
        {loaded && (
          <p className="mb-5 text-xs text-muted-foreground">Last saved: {new Date(doc.updatedAt).toLocaleString()}</p>
        )}

        <Card className="mb-5">
          <CardHeader><CardTitle className="text-base">Before Monday — readiness</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              These are checked live. Anything not ready simply means the meeting runs manually for that part.
            </p>
            <ReadyRow
              label="Sign in works (owner account with two-step verification)"
              ready={session.state === "owner"}
              note={session.state === "owner" ? `Signed in as ${session.email}.` : session.message}
            />
            <ReadyRow
              label="Notes and this agenda save to the CanX account, not just this device"
              ready={shared}
              note={shared ? "Shared saving is on." : "Device-only until sign-in works."}
            />
            <ReadyRow
              label="Office Manager can answer"
              ready={false}
              note="Not connected. Check the Systems room for the exact blocker."
            />
            <ReadyRow label="Independent review (Claude)" ready={false} note="Planned only. Not connected, and never spoken for." />
            <ReadyRow
              label="Meeting notes, decisions and actions are ready to fill in"
              ready
              note="Editable below, with export and import as a backup."
            />
          </CardContent>
        </Card>

        <Card className="mb-5">
          <CardHeader><CardTitle className="text-base">Meeting</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">
              <Input type="date" value={doc.date} onChange={(e) => update({ date: e.target.value })} />
            </Field>
            <Field label="Start time (unset until you choose)">
              <Input type="time" value={doc.time} onChange={(e) => update({ time: e.target.value })} />
            </Field>
            <Field label="Timezone (proposed, editable)">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={doc.timezone}
                onChange={(e) => update({ timezone: e.target.value })}
              >
                {TIMEZONE_OPTIONS.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
              </select>
            </Field>
            <Field label="Chair">
              <Input value={doc.chair} onChange={(e) => update({ chair: e.target.value })} />
            </Field>
            <Field label="Coordinator">
              <Input value={doc.coordinator} onChange={(e) => update({ coordinator: e.target.value })} />
            </Field>
          </CardContent>
        </Card>

        <Card className="mb-5">
          <CardHeader>
            <CardTitle className="text-base">Agenda — {totalMinutes} minutes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {doc.agenda.map((item, index) => (
              <div key={item.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-[200px] flex-1"
                    value={item.title}
                    aria-label={`Agenda item ${index + 1} title`}
                    onChange={(e) =>
                      update({ agenda: doc.agenda.map((row) => (row.id === item.id ? { ...row, title: e.target.value } : row)) })
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    max={600}
                    className="w-24"
                    value={item.minutes}
                    aria-label={`Agenda item ${index + 1} minutes`}
                    onChange={(e) =>
                      update({
                        agenda: doc.agenda.map((row) =>
                          row.id === item.id ? { ...row, minutes: Number(e.target.value) || 0 } : row,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove agenda item ${index + 1}`}
                    onClick={() => update({ agenda: doc.agenda.filter((row) => row.id !== item.id) })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  className="mt-2"
                  rows={2}
                  placeholder="Notes for this item…"
                  value={item.notes}
                  aria-label={`Agenda item ${index + 1} notes`}
                  onChange={(e) =>
                    update({ agenda: doc.agenda.map((row) => (row.id === item.id ? { ...row, notes: e.target.value } : row)) })
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => update({ agenda: [...doc.agenda, { id: newId("ag"), title: "New item", minutes: 5, notes: "" }] })}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add agenda item
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-5">
          <CardHeader><CardTitle className="text-base">Seats at the table</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Every seat below is planned. None is connected, and the office never speaks on behalf of a person or a
              reviewer it has not verified.
            </p>
            {doc.roles.map((role) => (
              <div key={role.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
                <span className="min-w-[190px] flex-1 text-sm font-semibold text-foreground">{role.name}</span>
                <Input
                  className="min-w-[160px] flex-1"
                  placeholder="Who covers this seat?"
                  value={role.assignedTo}
                  aria-label={`Who covers ${role.name}`}
                  onChange={(e) =>
                    update({ roles: doc.roles.map((row) => (row.id === role.id ? { ...row, assignedTo: e.target.value } : row)) })
                  }
                />
                <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                  {role.connected ? "Connected" : "Not connected"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="mb-5">
          <CardHeader><CardTitle className="text-base">Meeting notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea rows={7} value={doc.notes} aria-label="Meeting notes" onChange={(e) => update({ notes: e.target.value })} />
          </CardContent>
        </Card>

        <Card className="mb-5">
          <CardHeader><CardTitle className="text-base">Decision log</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {doc.decisions.map((row, index) => (
              <div key={row.id} className="flex flex-wrap gap-2">
                <Input
                  className="min-w-[200px] flex-1"
                  placeholder="Decision"
                  value={row.text}
                  aria-label={`Decision ${index + 1}`}
                  onChange={(e) =>
                    update({ decisions: doc.decisions.map((d) => (d.id === row.id ? { ...d, text: e.target.value } : d)) })
                  }
                />
                <Input
                  className="w-40"
                  placeholder="Owner"
                  value={row.owner}
                  aria-label={`Decision ${index + 1} owner`}
                  onChange={(e) =>
                    update({ decisions: doc.decisions.map((d) => (d.id === row.id ? { ...d, owner: e.target.value } : d)) })
                  }
                />
                <Input
                  type="date"
                  className="w-44"
                  value={row.due}
                  aria-label={`Decision ${index + 1} date`}
                  onChange={(e) =>
                    update({ decisions: doc.decisions.map((d) => (d.id === row.id ? { ...d, due: e.target.value } : d)) })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove decision ${index + 1}`}
                  onClick={() => update({ decisions: doc.decisions.filter((d) => d.id !== row.id) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => update({ decisions: [...doc.decisions, { id: newId("d"), text: "", owner: "", due: "", provenance: "john" as const }] })}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add decision
            </Button>
          </CardContent>
        </Card>

        <Card className="mb-10">
          <CardHeader><CardTitle className="text-base">Actions — owner and due date</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {doc.actions.map((row, index) => (
              <div key={row.id} className="flex flex-wrap items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={row.done}
                  aria-label={`Action ${index + 1} done`}
                  onChange={(e) =>
                    update({ actions: doc.actions.map((a) => (a.id === row.id ? { ...a, done: e.target.checked } : a)) })
                  }
                />
                <Input
                  className="min-w-[200px] flex-1"
                  placeholder="Action"
                  value={row.text}
                  aria-label={`Action ${index + 1}`}
                  onChange={(e) =>
                    update({ actions: doc.actions.map((a) => (a.id === row.id ? { ...a, text: e.target.value } : a)) })
                  }
                />
                <Input
                  className="w-40"
                  placeholder="Owner"
                  value={row.owner}
                  aria-label={`Action ${index + 1} owner`}
                  onChange={(e) =>
                    update({ actions: doc.actions.map((a) => (a.id === row.id ? { ...a, owner: e.target.value } : a)) })
                  }
                />
                <Input
                  type="date"
                  className="w-44"
                  value={row.due}
                  aria-label={`Action ${index + 1} due date`}
                  onChange={(e) =>
                    update({ actions: doc.actions.map((a) => (a.id === row.id ? { ...a, due: e.target.value } : a)) })
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() => update({ actions: doc.actions.filter((a) => a.id !== row.id) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                update({ actions: [...doc.actions, { id: newId("a"), text: "", owner: "", due: "", done: false, provenance: "john" as const }] })
              }
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add action
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ReadyRow({ label, ready, note }: { label: string; ready: boolean; note: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 p-3">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      <span
        className={
          ready
            ? "shrink-0 rounded-full border border-canx-green/50 bg-canx-green/15 px-2 py-0.5 text-xs font-semibold text-canx-green"
            : "shrink-0 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground"
        }
      >
        {ready ? "Ready" : "Not ready"}
      </span>
    </div>
  );
}
