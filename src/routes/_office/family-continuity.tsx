import { OfficeFiles } from "@/components/office/OfficeFiles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoomSkillsLink } from "@/components/office/RoomSkillsLink";
import { OFFICE_SKILLS } from "@/lib/office-skills";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_office/family-continuity")({ component: FamilyContinuityRoom });

function FamilyContinuityRoom() {
  return <main className="min-h-screen bg-background px-4 py-8"><div className="mx-auto max-w-6xl rounded-2xl border border-violet-500/50 bg-card p-6 shadow-xl"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-violet-400" /><div><h1 className="text-3xl font-bold text-foreground">Family Continuity, Skills &amp; Training</h1><p className="text-muted-foreground">Knowledge kept understandable and usable by the family.</p></div></div><OfficeFiles room="family-continuity" /><section aria-labelledby="office-skills-h" className="mt-6 rounded-xl border border-primary/40 bg-background/60 p-5"><h2 id="office-skills-h" className="font-semibold text-foreground">Office Skills</h2><p className="mt-1 text-sm text-muted-foreground">The CanX-owned master copy of how each room's work is done: {OFFICE_SKILLS.filter(s=>s.kind==="core").length} installed core skills and {OFFICE_SKILLS.filter(s=>s.kind==="outline").length} named outlines. Skills are kept separate from family and private records.</p><Link to="/skills" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Open Office Skills</Link></section><RoomSkillsLink route="/family-continuity" /><div className="mt-8 rounded-xl border border-border bg-background/60 p-5"><h2 className="font-semibold text-foreground">Room setup stage</h2><p className="mt-2 text-sm text-muted-foreground">The visual room is in place. Access rules, approved records and continuity skills will be added only after John reviews the room.</p></div></div></main>;
}
