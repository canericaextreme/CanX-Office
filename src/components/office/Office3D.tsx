"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ROOMS, type RoomDef } from "@/lib/office-data";
import { SampleBadge } from "./SampleBadge";

/**
 * CanX Office floor — original isometric spatial layout with two corrections:
 *  1. Smoky charcoal-to-grey surfaces instead of near-black expanses.
 *  2. Room buttons and labels are counter-rotated so they stay horizontal,
 *     front-facing and readable, while the floor keeps its perspective.
 */

const FLOOR_TILT = "rotateX(55deg) rotateZ(-25deg)";
// Exact inverse of FLOOR_TILT, applied to each screen-facing overlay.
const FACE_VIEWER = "rotateZ(25deg) rotateX(-55deg)";

const X_STEP = 96;
const Z_STEP = 104;

function floorPoint(room: RoomDef) {
  return { x: room.position.x * X_STEP, y: room.position.z * Z_STEP };
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
  const { x, y } = floorPoint(room);
  const isHovered = hovered === room.id;

  return (
    <div
      className="absolute h-0 w-0"
      style={{
        left: `calc(50% + ${x}px)`,
        top: `calc(50% + ${y}px)`,
        transformStyle: "preserve-3d",
        transform: `translateZ(${isHovered ? 26 : 14}px) ${FACE_VIEWER}`,
        zIndex: 100 + room.position.z,
      }}
    >
      <Link
        to={room.route}
        aria-label={`${room.label} — ${room.purpose}`}
        onMouseEnter={() => setHovered(room.id)}
        onMouseLeave={() => setHovered(null)}
        onFocus={() => setHovered(room.id)}
        onBlur={() => setHovered(null)}
        className="absolute flex w-[132px] -translate-x-1/2 -translate-y-1/2 flex-col gap-1 rounded-lg border px-2.5 py-2 text-left backdrop-blur-sm transition-[transform,box-shadow] hover:-translate-y-[calc(50%+3px)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{
          backgroundColor: isHovered ? `${room.color}3d` : `${room.color}26`,
          borderColor: isHovered ? room.color : `${room.color}80`,
          boxShadow: isHovered
            ? `0 10px 22px oklch(0 0 0 / 0.35), 0 0 0 1px ${room.color}66`
            : "0 6px 14px oklch(0 0 0 / 0.25)",
        }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ backgroundColor: `${room.color}33`, color: room.color }}
          >
            <room.icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-[13px] font-semibold leading-tight text-foreground">
            {room.shortLabel}
          </span>
        </span>
        {isHovered && (
          <span className="text-[11px] leading-snug text-muted-foreground">{room.purpose}</span>
        )}
      </Link>
    </div>
  );
}

export function Office3D() {
  const [hovered, setHovered] = useState<string | null>(null);
  const rooms = ROOMS.filter((room) => room.id !== "reception");
  const reception = ROOMS[0];

  return (
    <section
      aria-labelledby="office-scene-title"
      className="relative min-h-[74vh] w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-canx-panel via-canx-charcoal to-canx-black p-4"
    >
      <div className="absolute left-4 top-4 z-20 flex flex-wrap items-center gap-2">
        <h2 id="office-scene-title" className="text-sm font-semibold text-foreground">
          CanX Office floor
        </h2>
        <SampleBadge />
        <span className="text-xs text-muted-foreground">Click any room to enter</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: "1400px" }}>
        <div
          className="relative [--scene-scale:0.42] sm:[--scene-scale:0.58] lg:[--scene-scale:0.74] xl:[--scene-scale:0.86]"
          style={{
            transformStyle: "preserve-3d",
            transform: `${FLOOR_TILT} scale(var(--scene-scale))`,
          }}
        >
          {/* Floor slab — smoky charcoal to medium grey */}
          <div
            className="absolute rounded-2xl"
            style={{
              width: "1320px",
              height: "1240px",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%) translateZ(-40px)",
              background:
                "linear-gradient(150deg, oklch(0.46 0.012 260) 0%, oklch(0.36 0.014 260) 45%, oklch(0.3 0.014 260) 100%)",
              boxShadow: "inset 0 0 120px oklch(0 0 0 / 0.28), 0 30px 60px oklch(0 0 0 / 0.35)",
            }}
          />

          {/* Translucent glass panel over the floor */}
          <div
            className="pointer-events-none absolute rounded-2xl"
            style={{
              width: "1320px",
              height: "1240px",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%) translateZ(-36px)",
              background:
                "linear-gradient(120deg, oklch(0.85 0.02 240 / 0.12), oklch(0.7 0.02 240 / 0.03) 60%, transparent)",
              border: "1px solid oklch(0.8 0.01 260 / 0.18)",
            }}
          />

          {/* Grid lines */}
          <svg
            className="pointer-events-none absolute opacity-25"
            style={{
              width: "1320px",
              height: "1240px",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%) translateZ(-34px)",
            }}
            aria-hidden="true"
          >
            {Array.from({ length: 14 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="1240" stroke="oklch(0.9 0 0 / 0.25)" strokeWidth="1" />
            ))}
            {Array.from({ length: 13 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 100} x2="1320" y2={i * 100} stroke="oklch(0.9 0 0 / 0.25)" strokeWidth="1" />
            ))}
          </svg>

          {/* Central reception desk */}
          <div
            className="absolute rounded-xl"
            style={{
              width: "300px",
              height: "170px",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%) translateZ(6px)",
              background:
                "linear-gradient(140deg, oklch(0.52 0.02 260 / 0.85), oklch(0.38 0.02 260 / 0.85))",
              border: "2px solid var(--canx-red)",
              boxShadow: "0 14px 30px oklch(0 0 0 / 0.35)",
            }}
          />

          {reception && (
            <div
              className="absolute h-0 w-0"
              style={{
                left: "50%",
                top: "50%",
                transformStyle: "preserve-3d",
                transform: `translateZ(34px) ${FACE_VIEWER}`,
                zIndex: 200,
              }}
            >
              <Link
                to={reception.route}
                aria-label={`${reception.label} — ${reception.purpose}`}
                className="absolute flex w-[190px] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl border-2 border-canx-red/70 bg-canx-charcoal/85 px-4 py-3 text-center backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ boxShadow: "0 12px 28px oklch(0 0 0 / 0.4)" }}
              >
                <span className="text-2xl font-black tracking-widest text-canx-red">CANX</span>
                <span className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Reception
                </span>
                <span className="mt-1 text-[11px] text-muted-foreground">Text placeholder logo</span>
              </Link>
            </div>
          )}

          {rooms.map((room) => (
            <RoomMarker key={room.id} room={room} hovered={hovered} setHovered={setHovered} />
          ))}
        </div>
      </div>
    </section>
  );
}
