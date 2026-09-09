"use client";

import { Link } from "@tanstack/react-router";
import { Armchair, DoorOpen, LampDesk, Monitor, Trees } from "lucide-react";
import { ROOMS, type RoomDef } from "@/lib/office-data";
import { SampleBadge } from "./SampleBadge";

const departments = [
  { label: "Leadership & planning", rooms: ROOMS.slice(1, 6) },
  { label: "Operations", rooms: ROOMS.slice(6, 11) },
  { label: "Records & support", rooms: ROOMS.slice(11, 16) },
  { label: "Systems & assurance", rooms: ROOMS.slice(16, 20) },
];

function OfficeRoom({ room }: { room: RoomDef }) {
  return (
    <Link
      to={room.route}
      aria-label={`Enter ${room.label}`}
      className="group relative flex min-h-24 flex-col justify-between overflow-hidden border-2 border-reception-charcoal bg-reception-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-reception-red hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-28"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-reception-red opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-reception-charcoal">
          <room.icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" /> Door
        </span>
      </div>
      <div>
        <span className="block text-sm font-bold leading-tight text-foreground">{room.shortLabel}</span>
        <span className="mt-2 flex items-center gap-2 text-muted-foreground" aria-hidden="true">
          <Monitor className="h-3.5 w-3.5" />
          <span className="h-px flex-1 bg-border" />
          <Armchair className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}

export function Office3D() {
  return (
    <section className="overflow-hidden rounded-lg border border-reception-charcoal/30 bg-reception-white font-reception-body shadow-md" aria-labelledby="office-scene-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-reception-charcoal bg-reception-white px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="office-scene-title" className="font-reception-heading text-lg font-bold text-reception-charcoal">CanX Office floor</h2>
            <SampleBadge />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Choose any signed room to open its work screen.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Trees className="h-4 w-4 text-canx-green" aria-hidden="true" /> Daylight workspace
        </div>
      </div>

      <div className="relative bg-office-floor p-3 sm:p-5 lg:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-office-glass opacity-70" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-2">
              {departments.slice(0, 2).map((department) => (
                <div key={department.label} className="border-4 border-reception-charcoal bg-office-glass p-2 shadow-md">
                  <div className="mb-2 flex items-center justify-between border-b-2 border-reception-charcoal bg-reception-white px-3 py-2">
                    <span className="font-reception-heading text-xs font-bold uppercase text-reception-charcoal">{department.label}</span>
                    <span className="text-xs text-muted-foreground">Glass wing</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {department.rooms.map((room) => <OfficeRoom key={room.id} room={room} />)}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid min-h-64 items-stretch overflow-hidden border-4 border-reception-charcoal bg-reception-red shadow-lg lg:grid-cols-[1fr_1.5fr_1fr]">
              <div className="hidden items-end justify-center bg-reception-charcoal/10 p-6 text-center lg:flex">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-foreground"><LampDesk className="h-4 w-4" /> Shared workstations</div>
              </div>
              <Link to="/" className="relative flex flex-col items-center justify-center px-5 py-8 text-center text-primary-foreground transition hover:bg-reception-charcoal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground" aria-label="Reception / Office Manager">
                <span className="font-reception-heading text-4xl font-extrabold sm:text-5xl">CANX</span>
                <span className="font-reception-heading text-lg font-semibold">OFFICE</span>
                <span className="mt-2 text-sm font-medium text-primary-foreground/85">John’s visual command centre</span>
                <span className="mt-7 flex min-h-16 w-full max-w-sm items-center justify-center border-b-8 border-reception-charcoal bg-reception-wood px-8 py-4 font-reception-heading text-base font-bold text-reception-charcoal shadow-lg">WELCOME DESK</span>
                <span className="mt-3 text-xs text-primary-foreground/85">Text placeholder logo · Sample reception</span>
              </Link>
              <div className="hidden items-end justify-center bg-reception-charcoal/10 p-6 text-center lg:flex">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary-foreground"><Armchair className="h-4 w-4" /> Visitor seating</div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {departments.slice(2).map((department) => (
                <div key={department.label} className="border-4 border-reception-charcoal bg-office-glass p-2 shadow-md">
                  <div className="mb-2 flex items-center justify-between border-b-2 border-reception-charcoal bg-reception-white px-3 py-2">
                    <span className="font-reception-heading text-xs font-bold uppercase text-reception-charcoal">{department.label}</span>
                    <span className="text-xs text-muted-foreground">Glass wing</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {department.rooms.map((room) => <OfficeRoom key={room.id} room={room} />)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}