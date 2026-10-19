import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { getRoomSnapshot } from "@/lib/room-snapshot.functions";
import { ROOM_TARGETS, type RoomSnapshot } from "@/lib/room-snapshot";
import { collectDeviceSnapshot } from "@/lib/room-device-snapshot";
import { currentBuildVersion } from "@/lib/office-health";

/** Saved records describe availability, never running work or verified release health. */
function boardRoomSummary(snapshot?: RoomSnapshot) {
  if (!snapshot) return "demo data · placeholder activity";
  const sources = snapshot.sources.filter((s) => s.kind !== "static");
  const read = sources.filter((s) => s.status === "read");
  return `${read.length}/${sources.length} data sources read · ${snapshot.overall}`;
}

export function BrainBoardPreview() {
  const { accessToken } = useOwnerSession();
  const fetchSnapshot = useServerFn(getRoomSnapshot);
  const [selected, setSelected] = useState(ROOM_TARGETS[0]!);
  // Token-scoped state prevents a previous session's private counts being displayed.
  const [result, setResult] = useState<{ token: string; snapshots: Record<string, RoomSnapshot> }>({
    token: "",
    snapshots: {},
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const snapshots = result.token === accessToken ? result.snapshots : {};
  const snapshot = snapshots[selected.route];
  const realCount = Object.values(snapshots).filter((s) =>
    s.sources.some((source) => source.kind !== "static" && source.status === "read"),
  ).length;

  async function readSelected() {
    if (!accessToken || busy) return;
    const mine = ++sequence.current;
    const route = selected.route;
    setBusy(true);
    setError("");
    try {
      const reply = await fetchSnapshot({
        data: {
          accessToken,
          route,
          buildId: currentBuildVersion(),
          device: collectDeviceSnapshot(route),
        },
      });
      if (mine !== sequence.current) return;
      if (!reply.ok) {
        setError(reply.message);
        setResult((old) => ({
          token: accessToken,
          snapshots: Object.fromEntries(
            Object.entries(old.token === accessToken ? old.snapshots : {}).filter(
              ([key]) => key !== route,
            ),
          ),
        }));
        return;
      }
      setResult((old) => ({
        token: accessToken,
        snapshots: { ...(old.token === accessToken ? old.snapshots : {}), [route]: reply.snapshot },
      }));
    } catch {
      setError("Room read failed. No new Office data is available.");
      setResult((old) => ({
        token: accessToken,
        snapshots: Object.fromEntries(
          Object.entries(old.token === accessToken ? old.snapshots : {}).filter(
            ([key]) => key !== route,
          ),
        ),
      }));
    } finally {
      if (mine === sequence.current) setBusy(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card p-4"
      aria-label="Brain board draft preview"
    >
      <a className="text-sm underline" href="/brain">
        Back to Brain
      </a>
      <h1 className="text-2xl font-bold">Live brain board · draft preview</h1>
      <p className="text-sm text-muted-foreground">
        Draft #168 source and three.js are unavailable in this checkout. This SVG layout is a
        fallback preview; the three.js board is still pending.
      </p>
      <p role="status" className="rounded border border-border p-3 text-sm">
        Data source:{" "}
        {realCount
          ? `Office room snapshots (${realCount} rooms with data read), plus demo data for missing activity.`
          : "demo data · placeholder activity. No Office room data has been read successfully."}{" "}
        Select a room and press Read selected room to use its existing Office reader. Reads are
        manual; saved records do not prove running work or release health.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <svg
          viewBox="0 0 640 540"
          role="img"
          aria-label="Brain board room connections; use the room buttons below to inspect"
          className="w-full rounded-xl bg-slate-950"
        >
          <ellipse cx="320" cy="270" rx="235" ry="200" fill="#172036" stroke="#526489" />
          {ROOM_TARGETS.map((room, i) => {
            const angle = (i * Math.PI * 2) / ROOM_TARGETS.length;
            const x = 320 + Math.cos(angle) * 210;
            const y = 270 + Math.sin(angle) * 180;
            const read = snapshots[room.route]?.sources.some(
              (s) => s.kind !== "static" && s.status === "read",
            );
            return (
              <g key={room.route}>
                <line x1="320" y1="270" x2={x} y2={y} stroke="#475569" />
                <circle
                  cx={x}
                  cy={y}
                  r={selected.route === room.route ? 13 : 8}
                  fill={read ? "#38bdf8" : "#fbbf24"}
                />
                <text x={x} y={y - 18} textAnchor="middle" fill="white" fontSize="12">
                  {i + 1}
                </text>
              </g>
            );
          })}
          <circle cx="320" cy="270" r="46" fill="#1e293b" stroke="#93c5fd" />
          <text x="320" y="266" textAnchor="middle" fill="white" fontSize="16">
            BRAIN
          </text>
          <text x="320" y="287" textAnchor="middle" fill="#fbbf24" fontSize="12">
            draft
          </text>
          <text x="320" y="512" textAnchor="middle" fill="white" fontSize="12">
            Blue: sources read · Amber: demo data / unavailable
          </text>
        </svg>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{selected.label}</h2>
          <p>{boardRoomSummary(snapshot)}</p>
          <p className="text-sm text-muted-foreground">
            Activity: demo data · illustrative signal between this room and Brain. No running-work
            feed is connected.
          </p>
          <button
            type="button"
            className="min-h-11 rounded border border-border px-4 disabled:opacity-50"
            disabled={!accessToken || busy}
            onClick={() => void readSelected()}
          >
            {busy ? "Reading…" : "Read selected room"}
          </button>
          {!accessToken && (
            <p className="text-sm">
              Sign in through the existing Office sign-in to read room data.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          {snapshot && (
            <>
              <p className="text-xs">
                Snapshot checked {snapshot.checkedAt} · build {snapshot.buildId}. This is the last
                manual read.
              </p>
              <ul className="space-y-2 text-sm">
                {snapshot.sources.map((s) => (
                  <li key={s.key}>
                    {s.label}:{" "}
                    {s.kind === "static"
                      ? "app configuration (not room activity)"
                      : `${s.kind === "device" ? "device-reported" : "Office"} · ${s.status}${s.status === "read" && s.count !== null ? ` · ${s.capped ? "up to " : ""}${s.count} records` : ""}`}
                    {s.partial ? " · partial" : ""}
                    {s.kind !== "static" && s.status !== "read"
                      ? " · unavailable; activity remains demo data"
                      : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Select a board room">
        {ROOM_TARGETS.map((room, i) => (
          <button
            type="button"
            key={room.route}
            aria-pressed={selected.route === room.route}
            onClick={() => {
              setSelected(room);
              setError("");
            }}
            className="min-h-11 rounded border border-border p-3 text-left aria-pressed:bg-secondary"
          >
            <span className="font-semibold">
              {i + 1}. {room.label}
            </span>
            <span className="block text-xs">{boardRoomSummary(snapshots[room.route])}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
