import { RoomSkillsLink } from "@/components/office/RoomSkillsLink";
import { OfficeFiles } from "@/components/office/OfficeFiles";
import { createFileRoute } from "@tanstack/react-router";
import { Microscope } from "lucide-react";
import { RoomColourBanner, RoomColourScope } from "@/components/office/RoomColour";
import { ROOM_COLOURS } from "@/lib/office-room-colours";
import { roomIdentityForRoute } from "@/lib/office-room-identity";

const COLOUR = ROOM_COLOURS["/research"]!;
const NUMBER = roomIdentityForRoute("/research")?.number ?? null;

export const Route = createFileRoute("/_office/research")({ component: ResearchRoom });

function ResearchRoom() {
  return <main className="min-h-screen bg-background px-4 py-8"><div className="mx-auto max-w-6xl"><RoomColourBanner colour={COLOUR} number={NUMBER} title="Research" purpose="Research, options, source checks and recommendations." icon={Microscope} /><RoomColourScope colour={COLOUR}><OfficeFiles room="research" /><RoomSkillsLink route="/research" /><div className="mt-8 rounded-xl border border-border bg-card p-5"><h2 className="font-semibold text-foreground">Room setup stage</h2><p className="mt-2 text-sm text-muted-foreground">Research instructions are installed. Source checks work only on sources John supplies or saved records; there is no live web or standards search connected.</p></div></RoomColourScope></div></main>;
}
