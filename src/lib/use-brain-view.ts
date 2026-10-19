import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getBrainView, toBrainEventRow, type BrainEventRow } from "./brain-view.functions";
import { buildBrainView, parseBrainEvent, type BrainEvent, type BrainView } from "./brain-view";
import { BRAIN_VIEW_ROUTES } from "./brain-view-layout";
import { useOwnerSession } from "./owner-session";

export type BrainLiveMode = "connecting" | "live" | "polling" | "off";

export interface BrainViewState {
  status: "signed-out" | "loading" | "ready" | "unavailable";
  message: string;
  view: BrainView;
  readAt: string | null;
  capped: boolean;
  /** How new lines arrive: instant live updates, a check every minute, or not at all. */
  mode: BrainLiveMode;
  /** Lines that arrived after the first read, oldest first — the view animates these. */
  arrivals: BrainEvent[];
}

const POLL_MS = 60_000;

/**
 * The live Brain view's data: one owner read of the work logbook, then instant
 * updates over Supabase realtime (John's own sign-in, row security applies).
 * If live updates can't connect, it checks again every minute instead and says so.
 */
export function useBrainView(opts: { live?: boolean } = {}): BrainViewState {
  const wantLive = opts.live ?? true;
  const session = useOwnerSession();
  const read = useServerFn(getBrainView);
  const [rows, setRows] = useState<BrainEventRow[]>([]);
  const [status, setStatus] = useState<BrainViewState["status"]>("signed-out");
  const [message, setMessage] = useState("Sign in to see work moving through the Office.");
  const [readAt, setReadAt] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [mode, setMode] = useState<BrainLiveMode>("off");
  const [arrivals, setArrivals] = useState<BrainEvent[]>([]);
  const [tick, setTick] = useState(0);
  const seen = useRef(new Set<string>());
  const first = useRef(true);

  const token = session.accessToken;
  useEffect(() => {
    if (!token) {
      setStatus("signed-out");
      setMessage("Sign in to see work moving through the Office.");
      setMode("off");
      return;
    }
    let active = true;
    let channel: { unsubscribe: () => unknown } | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    seen.current = new Set();
    first.current = true;

    const load = async (initial: boolean) => {
      const r = await read({ data: { accessToken: token } }).catch(() => null);
      if (!active) return null;
      if (!r || !r.ok) {
        if (initial) {
          setStatus("unavailable");
          setMessage(r && !r.ok ? r.message : "The work logbook could not be read just now.");
        }
        return null;
      }
      const fresh: BrainEvent[] = [];
      for (const row of r.rows) {
        const id = String(row["id"] ?? "");
        if (!id || seen.current.has(id)) continue;
        seen.current.add(id);
        if (!initial) {
          const e = parseBrainEvent(row);
          if (e) fresh.push(e);
        }
      }
      setRows(r.rows);
      setReadAt(r.readAt);
      setCapped(r.capped);
      setStatus("ready");
      setMessage(
        r.rows.length
          ? ""
          : "No work has been recorded yet. It appears here as soon as a task or project moves.",
      );
      if (fresh.length)
        setArrivals((a) =>
          [...a, ...fresh.sort((x, y) => Date.parse(x.at) - Date.parse(y.at))].slice(-50),
        );
      return r;
    };

    const startPolling = () => {
      if (poll || !active) return;
      setMode("polling");
      poll = setInterval(() => {
        void load(false);
      }, POLL_MS);
    };

    void (async () => {
      setStatus("loading");
      setMessage("Reading the work logbook…");
      const r = await load(true);
      if (!r || !active) return;
      if (!wantLive) {
        setMode("off");
        return;
      }
      setMode("connecting");
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const db = createClient(r.live.url, r.live.key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
        await db.realtime.setAuth(token);
        const ch = db
          .channel(`brain-view-${Math.random().toString(36).slice(2, 10)}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "office_work_events" },
            (payload: { new?: Record<string, unknown> }) => {
              if (!active || !payload.new) return;
              const row = toBrainEventRow(payload.new);
              if (!row.id || seen.current.has(row.id)) return;
              const e = parseBrainEvent(row);
              if (!e) return;
              seen.current.add(row.id);
              setRows((prev) => [row, ...prev]);
              setArrivals((a) => [...a, e].slice(-50));
              setReadAt(new Date().toISOString());
            },
          )
          .subscribe((s: string) => {
            if (!active) return;
            if (s === "SUBSCRIBED") setMode("live");
            else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") startPolling();
          });
        channel = ch;
      } catch {
        startPolling();
      }
    })();

    const reload = () => {
      void load(false);
    };
    window.addEventListener("canx:workbench-changed", reload);
    const stalledClock = setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => {
      active = false;
      window.removeEventListener("canx:workbench-changed", reload);
      clearInterval(stalledClock);
      if (poll) clearInterval(poll);
      try {
        channel?.unsubscribe();
      } catch {
        /* already closed */
      }
    };
  }, [token, read, wantLive]);

  const view = useMemo(
    () =>
      buildBrainView(
        rows,
        BRAIN_VIEW_ROUTES,
        new Date(),
        status === "ready" ? "live" : "unavailable",
      ),
    // tick re-folds once a minute so the 7-day stalled rule stays current without a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, status, tick],
  );
  return { status, message, view, readAt, capped, mode, arrivals };
}
