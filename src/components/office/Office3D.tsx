"use client";

import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ROOMS } from "@/lib/office-data";
import { SampleBadge } from "./SampleBadge";

export function Office3D() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="relative min-h-[70vh] w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#1c1c24] to-[#0f0f14] p-4">
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
        <SampleBadge />
        <span className="text-xs text-muted-foreground">Click any room to enter</span>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          perspective: "1200px",
        }}
      >
        <div
          className="relative"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateX(55deg) rotateZ(-25deg) scale(0.9)",
          }}
        >
          {/* Floor */}
          <div
            className="absolute rounded-xl bg-[#23232b] shadow-2xl"
            style={{
              width: "900px",
              height: "700px",
              transform: "translate(-50%, -50%) translateZ(-40px)",
              left: "50%",
              top: "50%",
              boxShadow: "inset 0 0 80px rgba(0,0,0,0.5), 0 0 60px rgba(239,68,68,0.08)",
            }}
          />

          {/* Grid lines */}
          <svg
            className="pointer-events-none absolute opacity-10"
            style={{
              width: "900px",
              height: "700px",
              transform: "translate(-50%, -50%) translateZ(-38px)",
              left: "50%",
              top: "50%",
            }}
          >
            {[...Array(10)].map((_, i) => (
              <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="700" stroke="#fff" strokeWidth="1" />
            ))}
            {[...Array(8)].map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 100} x2="900" y2={i * 100} stroke="#fff" strokeWidth="1" />
            ))}
          </svg>

          {ROOMS.map((room) => {
            const isHovered = hovered === room.id;
            const x = 400 + room.position.x * 80;
            const y = 320 + room.position.z * 60;

            return (
              <Link
                key={room.id}
                to={room.route}
                className="absolute flex flex-col items-center justify-center rounded-lg border text-center transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  width: "110px",
                  height: "80px",
                  transform: `translate(-50%, -50%) translateZ(${isHovered ? 16 : 8}px)`,
                  transformStyle: "preserve-3d",
                  backgroundColor: isHovered ? `${room.color}30` : `${room.color}18`,
                  borderColor: isHovered ? room.color : `${room.color}50`,
                  boxShadow: isHovered
                    ? `0 0 24px ${room.color}60, 0 8px 16px rgba(0,0,0,0.4)`
                    : `0 4px 8px rgba(0,0,0,0.3)`,
                }}
                onMouseEnter={() => setHovered(room.id)}
                onMouseLeave={() => setHovered(null)}
                aria-label={room.label}
              >
                <room.icon
                  className="h-6 w-6"
                  style={{ color: room.color }}
                  aria-hidden="true"
                />
                <span className="mt-1 px-1 text-[10px] font-semibold leading-tight text-foreground">
                  {room.shortLabel}
                </span>
                {isHovered && (
                  <span className="absolute -bottom-10 left-1/2 z-20 w-40 -translate-x-1/2 rounded bg-background/95 px-2 py-1 text-[10px] text-foreground shadow-lg">
                    {room.purpose}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Reception desk / logo area */}
          <div
            className="absolute flex items-center justify-center rounded-lg border-2 border-canx-red/40 bg-canx-black"
            style={{
              left: "50%",
              top: "55%",
              width: "160px",
              height: "80px",
              transform: "translate(-50%, -50%) translateZ(20px)",
              boxShadow: "0 0 32px rgba(239,68,68,0.2)",
            }}
          >
            <div className="text-center">
              <div className="text-lg font-black tracking-widest text-canx-red">CANX</div>
              <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Text placeholder logo
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
