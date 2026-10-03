import { OfficeFiles } from "@/components/office/OfficeFiles";
import { createFileRoute } from "@tanstack/react-router";
import { Microscope } from "lucide-react";

export const Route = createFileRoute("/_office/research")({ component: ResearchRoom });

function ResearchRoom() {
  return <main className="min-h-screen bg-background px-4 py-8"><div className="mx-auto max-w-6xl rounded-2xl border border-violet-500/50 bg-card p-6 shadow-xl"><div className="flex items-center gap-3"><Microscope className="h-8 w-8 text-violet-400" /><div><h1 className="text-3xl font-bold text-foreground">Research</h1><p className="text-muted-foreground">Research, options, source checks and recommendations.</p></div></div><OfficeFiles room="research" /><div className="mt-8 rounded-xl border border-border bg-background/60 p-5"><h2 className="font-semibold text-foreground">Room setup stage</h2><p className="mt-2 text-sm text-muted-foreground">The room is now part of the visual office. Its approved skills and live work areas will be installed during the room-by-room skills phase.</p></div></div></main>;
}
