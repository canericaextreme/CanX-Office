import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_office/family-continuity")({ component: FamilyContinuityRoom });

function FamilyContinuityRoom() {
  return <main className="min-h-screen bg-background px-4 py-8"><div className="mx-auto max-w-6xl rounded-2xl border border-violet-500/50 bg-card p-6 shadow-xl"><div className="flex items-center gap-3"><Users className="h-8 w-8 text-violet-400" /><div><h1 className="text-3xl font-bold text-foreground">Family Continuity</h1><p className="text-muted-foreground">Knowledge kept understandable and usable by the family.</p></div></div><div className="mt-8 rounded-xl border border-border bg-background/60 p-5"><h2 className="font-semibold text-foreground">Room setup stage</h2><p className="mt-2 text-sm text-muted-foreground">The visual room is in place. Access rules, approved records and continuity skills will be added only after John reviews the room.</p></div></div></main>;
}
