import { useMemo, useState } from "react";
import { useBrainView, type BrainViewState } from "@/lib/use-brain-view";
import {
  STAGE_COLOURS,
  STAGE_DISPLAY_ORDER,
  STAGE_LABELS,
  movesPerDay,
  stageTotals,
} from "@/lib/brain-view";
import { brainRoomLabel as roomLabel } from "@/lib/brain-view-layout";

const MOVE_COLOUR = "#3987e5";
const BOX = "rounded-xl border border-slate-700/70 bg-[#0f161d]/90 p-3";

function StageBars({ totals }: { totals: ReturnType<typeof stageTotals> }) {
  const max = Math.max(1, ...STAGE_DISPLAY_ORDER.map((st) => totals[st]));
  return (
    <ul className="mt-2 space-y-1.5">
      {STAGE_DISPLAY_ORDER.map((st) => (
        <li key={st} className="grid grid-cols-[92px_1fr_32px] items-center gap-2 text-xs">
          <span className="text-slate-300">{STAGE_LABELS[st]}</span>
          <span className="h-2.5 rounded-sm bg-slate-800">
            <span
              className="block h-full rounded-r-[4px]"
              style={{
                width: `${(totals[st] / max) * 100}%`,
                minWidth: totals[st] ? 3 : 0,
                background: STAGE_COLOURS[st],
              }}
            />
          </span>
          <span className="text-right tabular-nums text-slate-200">{totals[st]}</span>
        </li>
      ))}
    </ul>
  );
}

function MovesChart({ days }: { days: Array<{ day: string; moves: number; changes: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.changes));
  const w = 280,
    h = 96,
    gap = 2;
  const bw = (w - gap * (days.length - 1)) / days.length;
  const sel = hover !== null ? days[hover] : null;
  return (
    <div className="relative mt-2">
      <svg
        viewBox={`0 0 ${w} ${h + 14}`}
        className="w-full"
        role="img"
        aria-label={`Changes per day, last ${days.length} days. Total ${days.reduce((a, d) => a + d.changes, 0)} changes, ${days.reduce((a, d) => a + d.moves, 0)} room moves.`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" x2={w} y1={h} y2={h} stroke="#334155" strokeWidth="1" />
        {days.map((d, i) => {
          const x = i * (bw + gap);
          const ch = (d.changes / max) * (h - 6);
          const mv = (d.moves / max) * (h - 6);
          return (
            <g
              key={d.day}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
            >
              <rect x={x} y={0} width={bw} height={h} fill="transparent" />
              {d.changes ? (
                <rect
                  x={x}
                  y={h - ch}
                  width={bw}
                  height={ch}
                  rx="2"
                  fill={MOVE_COLOUR}
                  opacity={0.35}
                />
              ) : null}
              {d.moves ? (
                <rect x={x} y={h - mv} width={bw} height={mv} rx="2" fill={MOVE_COLOUR} />
              ) : null}
              {hover === i ? (
                <rect
                  x={x - 1}
                  y={0}
                  width={bw + 2}
                  height={h}
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="1"
                  rx="2"
                />
              ) : null}
            </g>
          );
        })}
        <text x="0" y={h + 12} fontSize="9" fill="#94a3b8">
          {days[0]?.day.slice(5)}
        </text>
        <text x={w} y={h + 12} fontSize="9" fill="#94a3b8" textAnchor="end">
          today
        </text>
      </svg>
      <p className="mt-1 text-[11px] text-slate-400" aria-live="polite">
        {sel
          ? `${sel.day}: ${sel.changes} change(s), ${sel.moves} room move(s)`
          : "Dark bars: room moves. Light bars: all stage changes. Point at a day for numbers."}
      </p>
    </div>
  );
}

/** Static Analytics charts from the same work logbook the live Brain view uses. */
export function BrainActivityCharts({
  state: injected,
  viewer = false,
}: { state?: BrainViewState; viewer?: boolean } = {}) {
  const own = useBrainView({ live: false });
  const state = injected ?? own;
  const { view, status, message, readAt } = state;
  const totals = useMemo(() => stageTotals(view), [view]);
  const days = useMemo(() => movesPerDay(view, new Date()), [view]);
  const stalledRooms = useMemo(
    () =>
      view.nodes
        .filter((n) => n.byStage.stalled > 0)
        .sort((a, b) => b.byStage.stalled - a.byStage.stalled)
        .slice(0, 6),
    [view],
  );
  const stalledMax = Math.max(1, ...stalledRooms.map((n) => n.byStage.stalled));

  const body = viewer ? (
    <p className="mt-2 text-xs text-slate-400">
      The work logbook is owner-only, so it isn't shown in this read-only view.
    </p>
  ) : status !== "ready" ? (
    <p className="mt-2 text-xs text-slate-400">{message}</p>
  ) : null;

  return (
    <section
      aria-label="Work moving through the Office"
      className="relative mx-auto mt-4 max-w-[1500px]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">
          Work through the Office{" "}
          <span className="font-normal text-slate-400">
            — from the work logbook (same source as the live Brain view)
          </span>
        </h2>
        {readAt && !body ? (
          <span className="text-[11px] text-slate-400">
            Read {new Date(readAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>
      {body ?? (
        <>
          <div className="mt-2 grid gap-2.5 md:grid-cols-3">
            <section className={BOX}>
              <h3 className="text-sm font-semibold text-white">Work by stage now</h3>
              <StageBars totals={totals} />
              <p className="mt-2 text-[11px] text-slate-400">
                {totals.cancelled} cancelled (not counted as completed). Stalled = waiting, or no
                change for 7 days.
              </p>
            </section>
            <section className={BOX}>
              <h3 className="text-sm font-semibold text-white">Changes per day — last 14 days</h3>
              <MovesChart days={days} />
            </section>
            <section className={BOX}>
              <h3 className="text-sm font-semibold text-white">Where work is stalled</h3>
              {stalledRooms.length ? (
                <ul className="mt-2 space-y-1.5">
                  {stalledRooms.map((n) => (
                    <li
                      key={n.room}
                      className="grid grid-cols-[110px_1fr_28px] items-center gap-2 text-xs"
                    >
                      <span className="truncate text-slate-300">{roomLabel(n.room)}</span>
                      <span className="h-2.5 rounded-sm bg-slate-800">
                        <span
                          className="block h-full rounded-r-[4px]"
                          style={{
                            width: `${(n.byStage.stalled / stalledMax) * 100}%`,
                            background: STAGE_COLOURS.stalled,
                          }}
                        />
                      </span>
                      <span className="text-right tabular-nums text-slate-200">
                        {n.byStage.stalled}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Nothing is stalled.</p>
              )}
            </section>
          </div>
          <details className="mt-2 text-xs text-slate-300">
            <summary className="cursor-pointer text-slate-400">
              Show these numbers as a table
            </summary>
            <table className="mt-2 w-full max-w-xl border-collapse text-left">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 pr-3 font-medium">Room</th>
                  {STAGE_DISPLAY_ORDER.map((st) => (
                    <th key={st} className="py-1 pr-3 font-medium">
                      {STAGE_LABELS[st]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.nodes
                  .filter((n) => n.total > 0)
                  .map((n) => (
                    <tr key={n.room} className="border-t border-slate-800">
                      <td className="py-1 pr-3">{roomLabel(n.room)}</td>
                      {STAGE_DISPLAY_ORDER.map((st) => (
                        <td key={st} className="py-1 pr-3 tabular-nums">
                          {n.byStage[st]}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
