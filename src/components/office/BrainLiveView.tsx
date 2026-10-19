import { useEffect, useMemo, useRef, useState } from "react";
import { useBrainView, type BrainViewState } from "@/lib/use-brain-view";
import {
  STAGE_COLOURS,
  STAGE_DISPLAY_ORDER,
  STAGE_LABELS,
  recentSparks,
  stageTotals,
  type BrainNode,
} from "@/lib/brain-view";
import { brainRoomLabel, brainViewRooms } from "@/lib/brain-view-layout";
import { sendManagerHandoff } from "@/lib/companion-bridge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BrainLiveScene, SceneHover } from "./BrainLiveScene";

const ROOMS = brainViewRooms();
const roomLabel = brainRoomLabel;

function useReducedMotion(): boolean {
  const [rm, setRm] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setRm(q.matches);
    const on = () => setRm(q.matches);
    q.addEventListener?.("change", on);
    return () => q.removeEventListener?.("change", on);
  }, []);
  return rm;
}

const MODE_TEXT: Record<BrainViewState["mode"], string> = {
  connecting: "Connecting live updates…",
  live: "Live — moves appear the moment they are recorded",
  polling: "Live updates unavailable — checking every minute",
  off: "",
};

function StageLegend() {
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      aria-label="Stage colours"
    >
      {STAGE_DISPLAY_ORDER.map((st) => (
        <li key={st} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: STAGE_COLOURS[st] }}
          />
          {STAGE_LABELS[st]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#5b6270]" />
        No recorded work
      </li>
    </ul>
  );
}

function RoomBubble({ node, at }: { node: BrainNode | undefined; at: SceneHover }) {
  const route = at.route;
  const parts = node
    ? STAGE_DISPLAY_ORDER.filter((st) => node.byStage[st]).map(
        (st) => `${node.byStage[st]} ${STAGE_LABELS[st].toLowerCase()}`,
      )
    : [];
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border border-border bg-card/95 px-2.5 py-1.5 text-xs shadow-lg"
      style={{ left: Math.max(8, at.x + 12), top: Math.max(8, at.y - 12) }}
    >
      <div className="font-semibold text-foreground">{roomLabel(route)}</div>
      <div className="text-muted-foreground">
        {node && node.active ? `${node.active} active` : "Nothing active here"}
        {parts.length ? ` · ${parts.join(", ")}` : ""}
      </div>
    </div>
  );
}

/**
 * The live Brain view: a three.js picture of work moving through the Office,
 * from the append-only work logbook. Sits beside the Brain shelf map.
 */
export function BrainLiveView({ state: injected }: { state?: BrainViewState } = {}) {
  const own = useBrainView({ live: !injected });
  const state = injected ?? own;
  const { view, status, message, mode, arrivals, readAt, capped } = state;
  const reducedMotion = useReducedMotion();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BrainLiveScene | null>(null);
  const [sceneState, setSceneState] = useState<"pending" | "ready" | "no-webgl" | "failed">(
    "pending",
  );
  const [hover, setHover] = useState<SceneHover | null>(null);
  const replayed = useRef(false);
  const animated = useRef(0);

  // Create the 3D scene once (browser only, loaded on demand).
  useEffect(() => {
    let cancelled = false;
    let made: BrainLiveScene | null = null;
    void import("./BrainLiveScene")
      .then((m) => {
        if (cancelled || !host.current) return;
        if (!m.webglAvailable()) {
          setSceneState("no-webgl");
          return;
        }
        made = new m.BrainLiveScene(host.current, ROOMS, { reducedMotion, onHover: setHover });
        scene.current = made;
        setSceneState("ready");
      })
      .catch(() => {
        if (!cancelled) setSceneState("failed");
      });
    return () => {
      cancelled = true;
      made?.dispose();
      scene.current = null;
      replayed.current = false;
      animated.current = 0;
    };
  }, [reducedMotion]);

  // Keep the picture in step with the logbook.
  useEffect(() => {
    if (sceneState !== "ready" || !scene.current) return;
    scene.current.update(view);
    if (!replayed.current && status === "ready") {
      replayed.current = true;
      // On opening, replay the last day's moves once so John sees recent activity.
      recentSparks(view, new Date()).forEach((sp, i) => {
        setTimeout(() => scene.current?.spark(sp.fromRoom, sp.toRoom, sp.toStage), 400 + i * 650);
      });
      animated.current = arrivals.length;
    }
  }, [view, sceneState, status, arrivals.length]);

  // New moves while the room is open.
  useEffect(() => {
    if (sceneState !== "ready" || !scene.current || !replayed.current) return;
    for (const e of arrivals.slice(animated.current))
      scene.current.spark(e.fromRoom, e.toRoom, e.toStage);
    animated.current = arrivals.length;
  }, [arrivals, sceneState]);

  const totals = useMemo(() => stageTotals(view), [view]);
  const busyRooms = useMemo(
    () => view.nodes.filter((n) => n.active > 0).sort((a, b) => b.active - a.active),
    [view],
  );
  const lastMove = view.sparks.at(-1);

  return (
    <Card className="border-border bg-card" id="brain-live-view">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className="text-base">Live Brain view</CardTitle>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {status === "ready" ? MODE_TEXT[mode] : status === "unavailable" ? "Not connected" : ""}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Work moving through the Office. Each spark is a real move from the work logbook. Rooms
          glow while work is active there.
        </p>
        <StageLegend />
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={host}
          className="relative h-[320px] w-full overflow-hidden rounded-lg border border-border bg-[#141821] sm:h-[440px]"
          role="img"
          aria-label={`Live Brain view. ${busyRooms.length ? busyRooms.map((n) => `${roomLabel(n.room)}: ${n.active} active`).join("; ") : "No active work recorded."}`}
        >
          {hover ? (
            <RoomBubble node={view.nodes.find((n) => n.room === hover.route)} at={hover} />
          ) : null}
          {sceneState === "no-webgl" || sceneState === "failed" ? (
            <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
              The 3D picture needs WebGL, which this browser has turned off. The same information is
              listed below.
            </p>
          ) : null}
          {status !== "ready" ? (
            <p className="absolute inset-x-0 bottom-3 text-center text-xs text-[#c3c8d4]">
              {message}
            </p>
          ) : null}
        </div>

        {status === "ready" ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {STAGE_DISPLAY_ORDER.map(
                (st) => `${totals[st]} ${STAGE_LABELS[st].toLowerCase()}`,
              ).join(" · ")}
              {totals.cancelled ? ` · ${totals.cancelled} cancelled` : ""}
              {lastMove
                ? ` · last move ${roomLabel(lastMove.fromRoom)} → ${roomLabel(lastMove.toRoom)}`
                : " · no room moves yet"}
            </p>
            {busyRooms.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="Rooms with active work">
                {busyRooms.map((n) => (
                  <li
                    key={n.room}
                    className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
                  >
                    <span className="font-medium">{roomLabel(n.room)}</span>
                    {STAGE_DISPLAY_ORDER.filter((st) => st !== "completed" && n.byStage[st]).map(
                      (st) => (
                        <span key={st} className="flex items-center gap-1 text-muted-foreground">
                          <span
                            aria-hidden
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: STAGE_COLOURS[st] }}
                          />
                          {n.byStage[st]} {STAGE_LABELS[st].toLowerCase()}
                        </span>
                      ),
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Stalled means waiting, or no change for 7 days.
                {readAt ? ` Read ${new Date(readAt).toLocaleTimeString()}.` : ""}
                {capped ? " Showing the most recent 2,000 lines." : ""}
                {view.invalidEvents ? ` ${view.invalidEvents} unreadable line(s) skipped.` : ""}
              </p>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                onClick={() =>
                  sendManagerHandoff({
                    text: "Explain what's happening in the live Brain view right now: which rooms have active work, what moved recently, and what is stalled. Use only the work logbook.",
                    room: "brain",
                    path: "/brain",
                    source: "room_button",
                  })
                }
              >
                Ask Elsie to explain
              </button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
