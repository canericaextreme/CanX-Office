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
      className="group relative flex min-h-28 flex-col justify-between overflow-hidden border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-canx-red opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-canx-charcoal">
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
    <section className="overflow-hidden rounded-lg border border-border bg-office-wall shadow-sm" aria-labelledby="office-scene-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="office-scene-title" className="text-base font-bold text-foreground">CanX Office floor</h2>
            <SampleBadge />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Choose any signed room to open its work screen.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Trees className="h-4 w-4 text-canx-green" aria-hidden="true" /> Daylight workspace
        </div>
      </div>

      <div className="relative bg-office-floor p-3 sm:p-5 lg:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-office-glass opacity-50" />
        <div className="relative mx-auto max-w-5xl lg:[perspective:1400px]">
          <div className="grid gap-3 lg:[transform:rotateX(3deg)]">
            <div className="grid gap-3 lg:grid-cols-2">
              {departments.slice(0, 2).map((department) => (
                <div key={department.label} className="border border-border bg-office-glass p-2 shadow-sm">
                  <div className="mb-2 flex items-center justify-between border-b border-border bg-card/90 px-3 py-2">
                    <span className="text-xs font-bold uppercase text-canx-charcoal">{department.label}</span>
                    <span className="text-xs text-muted-foreground">Glass wing</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {department.rooms.map((room) => <OfficeRoom key={room.id} room={room} />)}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid min-h-36 items-stretch gap-3 lg:grid-cols-[1fr_1.15fr_1fr]">
              <div className="hidden items-center justify-center border-y border-border bg-office-glass text-center lg:flex">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><LampDesk className="h-4 w-4" /> Shared workstations</div>
              </div>
              <Link to="/" className="flex flex-col items-center justify-center border-2 border-canx-red bg-card px-5 py-5 text-center shadow-md transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Reception / Office Manager">
                <span className="text-2xl font-extrabold text-canx-red">CANX</span>
                <span className="text-sm font-bold text-canx-black">Reception</span>
                <span className="mt-2 rounded-sm bg-office-wood px-5 py-1 text-xs font-semibold text-foreground">Welcome desk</span>
                <span className="mt-2 text-xs text-muted-foreground">Text placeholder logo</span>
              </Link>
              <div className="hidden items-center justify-center border-y border-border bg-office-glass text-center lg:flex">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Armchair className="h-4 w-4" /> Visitor seating</div>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {departments.slice(2).map((department) => (
                <div key={department.label} className="border border-border bg-office-glass p-2 shadow-sm">
                  <div className="mb-2 flex items-center justify-between border-b border-border bg-card/90 px-3 py-2">
                    <span className="text-xs font-bold uppercase text-canx-charcoal">{department.label}</span>
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