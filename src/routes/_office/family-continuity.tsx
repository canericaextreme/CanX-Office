import { OfficeFiles } from "@/components/office/OfficeFiles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoomSkillsLink } from "@/components/office/RoomSkillsLink";
import { OFFICE_SKILLS } from "@/lib/office-skills";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_office/family-continuity")({ component: FamilyContinuityRoom });

function FamilyContinuityRoom() {
  return <main className="min-h-screen bg-background px-4 py-8"><div className="mx-auto max-w-6xl rounded-2xl border border-violet-500/50 bg-card p-6 shadow-xl"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-violet-400" /><div><h1 className="text-3xl font-bold text-foreground">Family Continuity, Skills &amp; Training</h1><p className="text-muted-foreground">Knowledge kept understandable and usable by the family.</p></div></div><OfficeFiles room="family-continuity" /><section aria-labelledby="office-skills-h" className="mt-6 rounded-xl border border-primary/40 bg-background/60 p-5"><h2 id="office-skills-h" className="font-semibold text-foreground">Office Skills</h2><p className="mt-1 text-sm text-muted-foreground">The CanX-owned master registry currently has {OFFICE_SKILLS.filter(s=>s.instructionReady).length} installed instructions across the office. Each one shows whether it is executable by Elsie, connected for advice, or blocked by a missing connection.</p><Link to="/skills" className="mt-3 inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Open Office Skills</Link></section><RoomSkillsLink route="/family-continuity" /><div className="mt-8 rounded-xl border border-border bg-background/60 p-5"><h2 className="font-semibold text-foreground">Room setup stage</h2><p className="mt-2 text-sm text-muted-foreground">Training instructions are installed. Family-continuity instructions (for example handover or family access) have no approved definition yet and are shown as a gap.</p></div></div></main>;
}
