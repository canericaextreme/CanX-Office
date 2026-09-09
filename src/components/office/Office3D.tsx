"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ROOMS, type RoomDef } from "@/lib/office-data";
import { SampleBadge } from "./SampleBadge";

/**
 * CanX Office floor — the original isometric spatial layout with two corrections
 * requested by the owner:
 *  1. No near-black expanses: smoky charcoal-to-medium-grey floor with a
 *     translucent glass sheen.
 *  2. Room buttons and their labels are screen-facing overlays — horizontal,
 *     never skewed by the floor perspective — at readable text sizes.
 */

const KX = 44; // isometric horizontal step
const KY = 36; // isometric vertical step
const STAGE_W = 1160;
const STAGE_H = 900;
const CX = STAGE_W / 2;
const CY = STAGE_H / 2;

const X_MIN = -7.5;
const X_MAX = 7.5;
const Z_MIN = -9;
const Z_MAX = 10;

function project(x: number, z: number) {
  return { left: CX + (x - z) * KX, top: CY + (x + z) * KY };
}

function point(x: number, z: number) {
  const p = project(x, z);
  return `${p.left},${p.top}`;
}

function RoomMarker({
  room,
  hovered,
  setHovered,
}: {
  room: RoomDef;
  hovered: string | null;
  setHovered: (id: string | null) => void;
}) {
  const { left, top } = project(room.position.x, room.position.z);
  const isHovered = hovered === room.id;

  return (
    <Link
      to={room.route}
      aria-label={`${room.label} — ${room.purpose}`}
      onMouseEnter={() => setHovered(room.id)}
      onMouseLeave={() => setHovered(null)}
      onFocus={() => setHovered(room.id)}
      onBlur={() => setHovered(null)}
      className="absolute flex w-[124px] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-lg border px-2.5 py-2 text-left backdrop-blur-sm transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        zIndex: isHovered ? 60 : 20 + room.position.z,
        backgroundColor: isHovered ? `${room.color}47` : `${room.color}2b`,
        borderColor: isHovered ? room.color : `${room.color}85`,
        boxShadow: isHovered
          ? `0 12px 24px oklch(0 0 0 / 0.35), 0 0 0 1px ${room.color}`
          : "0 6px 14px oklch(0 0 0 / 0.25)",
      }}
    >
      <span className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${room.color}3d`, color: room.color }}
        >
          <room.icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-[13px] font-semibold leading-tight text-foreground">
          {room.shortLabel}
        </span>
      </span>
      {isHovered && (
        <span className="text-[11px] leading-snug text-foreground/90">{room.purpose}</span>
      )}
    </Link>
  );
}

export function Office3D() {
  const [hovered, setHovered] = useState<string | null>(null);
  const reception = ROOMS.find((room) => room.id === "reception");
  const rooms = ROOMS.filter((room) => room.id !== "reception");

  const floorCorners = [
    point(X_MIN, Z_MIN),
    point(X_MAX, Z_MIN),
    point(X_MAX, Z_MAX),
    point(X_MIN, Z_MAX),
  ].join(" ");

  const gridX = Array.from({ length: 16 }, (_, i) => X_MIN + i);
  const gridZ = Array.from({ length: 20 }, (_, i) => Z_MIN + i);

  const desk = project(0, 0);

  return (
    <section
      aria-labelledby="office-scene-title"
      className="relative w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-canx-panel via-canx-charcoal to-canx-black"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3">
        <h2 id="office-scene-title" className="text-sm font-semibold text-foreground">
          CanX Office floor
        </h2>
        <SampleBadge />
        <span className="text-xs text-muted-foreground">Click any room to enter</span>
      </div>

      <div className="relative h-[400px] overflow-hidden sm:h-[540px] md:h-[660px] lg:h-[780px] xl:h-[900px]">
        <div
          className="absolute left-1/2 top-1/2 [--scene-scale:0.3] sm:[--scene-scale:0.5] md:[--scene-scale:0.72] lg:[--scene-scale:0.86] xl:[--scene-scale:1]"
          style={{
            width: `${STAGE_W}px`,
            height: `${STAGE_H}px`,
            transform: "translate(-50%, -50%) scale(var(--scene-scale))",
          }}
        >
          {/* Isometric floor — smoky charcoal to medium grey, with glass sheen */}
          <svg
            className="absolute inset-0"
            width={STAGE_W}
            height={STAGE_H}
            viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="canx-floor" x1="0" y1="0" x2="0.7" y2="1">
                <stop offset="0%" stopColor="oklch(0.5 0.012 260)" />
                <stop offset="55%" stopColor="oklch(0.4 0.014 260)" />
                <stop offset="100%" stopColor="oklch(0.33 0.014 260)" />
              </linearGradient>
              <linearGradient id="canx-glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="oklch(0.92 0.02 240 / 0.16)" />
                <stop offset="60%" stopColor="oklch(0.8 0.02 240 / 0.04)" />
                <stop offset="100%" stopColor="oklch(0.8 0.02 240 / 0)" />
              </linearGradient>
            </defs>
            <polygon points={floorCorners} fill="url(#canx-floor)" />
            <g stroke="oklch(0.95 0 0 / 0.16)" strokeWidth="1">
              {gridX.map((x) => (
                <line key={`x${x}`} x1={project(x, Z_MIN).left} y1={project(x, Z_MIN).top} x2={project(x, Z_MAX).left} y2={project(x, Z_MAX).top} />
              ))}
              {gridZ.map((z) => (
                <line key={`z${z}`} x1={project(X_MIN, z).left} y1={project(X_MIN, z).top} x2={project(X_MAX, z).left} y2={project(X_MAX, z).top} />
              ))}
            </g>
            <polygon points={floorCorners} fill="url(#canx-glass)" stroke="oklch(0.9 0.01 260 / 0.28)" strokeWidth="2" />
          </svg>

          {/* Reception desk plinth */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-canx-red/70"
            style={{
              left: `${desk.left}px`,
              top: `${desk.top + 26}px`,
              width: "330px",
              height: "150px",
              background:
                "linear-gradient(140deg, oklch(0.56 0.02 260 / 0.75), oklch(0.4 0.02 260 / 0.75))",
              boxShadow: "0 18px 34px oklch(0 0 0 / 0.35)",
              zIndex: 10,
            }}
          />

          {reception && (
            <Link
              to={reception.route}
              aria-label={`${reception.label} — ${reception.purpose}`}
              className="absolute flex w-[210px] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl border-2 border-canx-red bg-canx-charcoal/90 px-4 py-3 text-center backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                left: `${desk.left}px`,
                top: `${desk.top}px`,
                zIndex: 70,
                boxShadow: "0 14px 30px oklch(0 0 0 / 0.4)",
              }}
            >
              <span className="text-2xl font-black tracking-widest text-canx-red">CANX</span>
              <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
                Reception
              </span>
              <span className="mt-1 text-[11px] text-muted-foreground">Text placeholder logo</span>
            </Link>
          )}

          {rooms.map((room) => (
            <RoomMarker key={room.id} room={room} hovered={hovered} setHovered={setHovered} />
          ))}
        </div>
      </div>
    </section>
  );
}
