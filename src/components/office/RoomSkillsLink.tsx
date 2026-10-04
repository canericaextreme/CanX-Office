import { Link } from "@tanstack/react-router";
import { BookOpenCheck } from "lucide-react";
import { skillsForRoute, ROOM_SKILL_MAP, type OfficeSkill } from "@/lib/office-skills";

export function skillStatusLabel(s: OfficeSkill): string {
  if (s.instructionReady) return s.toolConnected ? "Installed instructions · inputs connected · awaiting live test" : "Installed instructions · partial connection · awaiting live test";
  if (s.kind === "reserved") return "Reserved";
  if (s.kind === "legacy") return "Legacy entry";
  return "Parked · instructions not installed";
}

/** Read-only list of skills linked to this room. Instructions live only on the Office Skills page. */
export function RoomSkillsLink({ route }: { route: string }) {
  const skills = skillsForRoute(route);
  const map = ROOM_SKILL_MAP[route];
  if (!skills.length && !map) return null;
  return (
    <section aria-label="Room skills" className="my-4 rounded-lg border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpenCheck className="h-4 w-4" aria-hidden /> Room skills ({skills.length})
        </h2>
        <Link to="/skills" className="text-xs font-medium text-primary underline-offset-2 hover:underline">Open Office Skills</Link>
      </div>
      {map?.coverage === "draft-gap" && <p className="mt-1 text-xs text-muted-foreground">This room's proposed instruction remains parked until John authorises work here.</p>}
      {map?.coverage === "reserved" && <p className="mt-1 text-xs text-muted-foreground">Reserved room — no worker or skill is installed.</p>}
      {skills.length > 0 && (
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {skills.map((s) => (
            <li key={s.id} className="text-xs">
              <Link to="/skills" hash={s.id} className="font-medium text-foreground hover:underline">{s.name}</Link>
              <span className="text-muted-foreground"> — {skillStatusLabel(s)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
