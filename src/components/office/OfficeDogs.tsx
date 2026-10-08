"use client";

import { useEffect, useRef, useState } from "react";

type Position = { x: number; y: number };

const dogs = [
  // Preserve the original pit bull and its existing device placement.
  {
    breed: "pit bull",
    image: "/canx-office-pitbull-copper-v2.png",
    storageKey: "canx-office-dog-position-v1",
    position: { x: 54, y: 63 },
  },
  {
    breed: "husky",
    image: "/canx-office-husky.svg",
    storageKey: "canx-office-dog-husky-position-v1",
    position: { x: 46, y: 57 },
  },
  {
    breed: "golden retriever",
    image: "/canx-office-golden-retriever.svg",
    storageKey: "canx-office-dog-golden-retriever-position-v1",
    position: { x: 61, y: 58 },
  },
  {
    breed: "gray pug",
    image: "/canx-office-gray-pug.svg",
    storageKey: "canx-office-dog-gray-pug-position-v1",
    position: { x: 49, y: 66 },
  },
] as const;

function clampPosition({ x, y }: Position): Position {
  return {
    x: Number(Math.min(96, Math.max(4, x)).toFixed(2)),
    y: Number(Math.min(93, Math.max(7, y)).toFixed(2)),
  };
}

function OfficeDog({ dog }: { dog: (typeof dogs)[number] }) {
  const [position, setPosition] = useState<Position>(dog.position);
  const [loaded, setLoaded] = useState(false);
  const dragging = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(dog.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setPosition(clampPosition(parsed));
        }
      }
    } catch {
      // Keep defaults when device storage is unavailable or malformed.
    }
    setLoaded(true);
  }, [dog.storageKey]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(dog.storageKey, JSON.stringify(position));
    } catch {
      // Dogs remain movable when device storage is unavailable.
    }
  }, [dog.storageKey, loaded, position]);

  const moveDog = (clientX: number, clientY: number, container: HTMLElement) => {
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    setPosition(
      clampPosition({
        x: ((clientX - bounds.left) / bounds.width) * 100,
        y: ((clientY - bounds.top) / bounds.height) * 100,
      }),
    );
  };

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`Move the office ${dog.breed}`}
      title={`Drag or use arrow keys to place the ${dog.breed}`}
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200 active:cursor-grabbing"
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      onPointerDown={(event) => {
        event.preventDefault();
        dragging.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId);
        const container = event.currentTarget.parentElement;
        if (container) moveDog(event.clientX, event.clientY, container);
      }}
      onPointerMove={(event) => {
        if (dragging.current !== event.pointerId) return;
        const container = event.currentTarget.parentElement;
        if (container) moveDog(event.clientX, event.clientY, container);
      }}
      onPointerUp={(event) => {
        dragging.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        dragging.current = null;
      }}
      onLostPointerCapture={() => {
        dragging.current = null;
      }}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        setPosition((current) =>
          clampPosition({
            x: current.x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0),
            y: current.y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0),
          }),
        );
      }}
    >
      <img
        src={dog.image}
        alt=""
        draggable={false}
        className="h-8 w-10 select-none object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,.75)] sm:h-10 sm:w-12"
      />
    </span>
  );
}

export function OfficeDogs() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden">
      {dogs.map((dog) => (
        <OfficeDog key={dog.storageKey} dog={dog} />
      ))}
    </div>
  );
}
