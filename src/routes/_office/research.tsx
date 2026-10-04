import { RoomSkillsLink } from "@/components/office/RoomSkillsLink";
import { OfficeFiles } from "@/components/office/OfficeFiles";
import { createFileRoute } from "@tanstack/react-router";
import { Microscope } from "lucide-react";

export const Route = createFileRoute("/_office/research")({ component: ResearchRoom });

function ResearchRoom() {
  return <main className="min-h-screen bg-background px-4 py-8"><div className="mx-auto max-w-6xl rounded-2xl border border-violet-500/50 bg-card p-6 shadow-xl"><div className="flex items-center gap-3"><Microscope className="h-8 w-8 text-violet-400" /><div><h1 className="text-3xl font-bold text-foreground">Research</h1><p className="text-muted-foreground">Research, options, source checks and recommendations.</p></div></div><OfficeFiles room="research" /><RoomSkillsLink route="/research" /><div className="mt-8 rounded-xl border border-border bg-background/60 p-5"><h2 className="font-semibold text-foreground">Room setup stage</h2><p className="mt-2 text-sm text-muted-foreground">Research instructions are installed. Source checks work only on sources John supplies or saved records; there is no live web or standards search connected.</p></div></div></main>;
}
