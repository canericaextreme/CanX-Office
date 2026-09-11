import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/office/StatusBadge";
import { ROOMS, SAMPLE_WORKERS } from "@/lib/office-data";
import {
  DEFAULT_TEAM,
  MAX_TEAM_MEMBERS,
  loadTeam,
  newMemberId,
  roomLabel,
  saveTeam,
  type TeamMember,
} from "@/lib/office-team";

export const Route = createFileRoute("/_office/office-team")({
  head: () => ({
    meta: [
      { title: "CanX Office — Office Team" },
      { name: "description", content: "Team members, their rooms and their roles in CanX Office." },
      { property: "og:title", content: "CanX Office — Office Team" },
      { property: "og:description", content: "Team members, their rooms and their roles in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfficeTeam,
});

const emptyDraft = { name: "", role: "", roomId: ROOMS[0]?.id ?? "reception", focus: "" };

function OfficeTeam() {
  const [team, setTeam] = useState<TeamMember[]>(DEFAULT_TEAM);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<TeamMember, "id">>(emptyDraft as Omit<TeamMember, "id">);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setTeam(loadTeam());
  }, []);

  function commit(next: TeamMember[]) {
    setTeam(saveTeam(next));
    window.dispatchEvent(new CustomEvent("canx:team-changed"));
  }

  function startEdit(member: TeamMember) {
    setAdding(false);
    setEditing(member.id);
    setDraft({ name: member.name, role: member.role, roomId: member.roomId, focus: member.focus });
  }

  function saveDraft() {
    if (!draft.name.trim()) return;
    if (adding) {
      commit([...team, { ...draft, id: newMemberId() }]);
      setAdding(false);
    } else if (editing) {
      commit(team.map((m) => (m.id === editing ? { ...m, ...draft } : m)));
      setEditing(null);
    }
    setDraft(emptyDraft as Omit<TeamMember, "id">);
  }

  const form = (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div>
        <Label className="text-xs" htmlFor="tm-name">
          Name
        </Label>
        <Input
          id="tm-name"
          className="h-11"
          value={draft.name}
          placeholder="Finance Officer"
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </div>
      <div>
        <Label className="text-xs" htmlFor="tm-role">
          Role
        </Label>
        <Input
          id="tm-role"
          className="h-11"
          value={draft.role}
          placeholder="Receipts, costs and budget watch"
          onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
        />
      </div>
      <div>
        <Label className="text-xs" htmlFor="tm-room">
          Room
        </Label>
        <select
          id="tm-room"
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={draft.roomId}
          onChange={(e) => setDraft((d) => ({ ...d, roomId: e.target.value as TeamMember["roomId"] }))}
        >
          {ROOMS.map((room) => (
            <option key={room.id} value={room.id}>
              {room.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label className="text-xs" htmlFor="tm-focus">
          What they cover
        </Label>
        <Input
          id="tm-focus"
          className="h-11"
          value={draft.focus}
          placeholder="Receipt review and monthly costs"
          onChange={(e) => setDraft((d) => ({ ...d, focus: e.target.value }))}
        />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button className="h-11" onClick={saveDraft} disabled={!draft.name.trim()}>
          Save
        </Button>
        <Button
          className="h-11"
          variant="outline"
          onClick={() => {
            setAdding(false);
            setEditing(null);
            setDraft(emptyDraft as Omit<TeamMember, "id">);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Team members</CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge tone="grey" label="Grey — device-only" />
            <Button
              className="h-11"
              disabled={adding || team.length >= MAX_TEAM_MEMBERS}
              onClick={() => {
                setEditing(null);
                setAdding(true);
                setDraft(emptyDraft as Omit<TeamMember, "id">);
              }}
            >
              Add team member
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            These are your real office roles. The Office Manager reads this list, so you can say “assign the Finance
            Officer” in Voice Mode and the task goes to that person. This list is saved on this device only — it is not
            shared between devices yet.
          </p>

          {adding && form}

          <ul className="grid gap-3 sm:grid-cols-2">
            {team.map((member) => (
              <li key={member.id} className="rounded-lg border border-border p-3">
                {editing === member.id ? (
                  form
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{member.name}</span>
                      <span className="text-xs text-muted-foreground">{roomLabel(member.roomId)}</span>
                    </div>
                    <p className="mt-1 text-sm">{member.role || "Role not recorded"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{member.focus || "Not recorded"}</p>
                    <div className="mt-3 flex gap-2">
                      <Button className="h-11" variant="outline" onClick={() => startEdit(member)}>
                        Edit
                      </Button>
                      <Button
                        className="h-11"
                        variant="outline"
                        onClick={() => commit(team.filter((m) => m.id !== member.id))}
                      >
                        Remove
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          {team.length === 0 && <p className="text-muted-foreground">No team members recorded on this device.</p>}
        </CardContent>
      </Card>

      <Card className="mt-4 border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Planned AI helpers</CardTitle>
          <StatusBadge tone="grey" label="Grey — planned" />
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Planned helper roles. These are not connected and do no work yet.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLE_WORKERS.map((worker) => (
              <Card key={worker.id} className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-base">{worker.role}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span>{worker.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current job</span>
                    <span>{worker.currentJob}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last result</span>
                    <span>{worker.lastResult}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewer</span>
                    <StatusBadge tone={worker.reviewer === "None" ? "grey" : "yellow"} label={worker.reviewer} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </RoomShell>
  );
}
