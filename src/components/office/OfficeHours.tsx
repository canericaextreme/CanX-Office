import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { syncOfficeHours } from "@/lib/office-hours.functions";
import {
  OFFICE_HOURS_VOICE,
  dayKey,
  elapsed,
  HEARTBEAT,
  settings,
  summarize,
  type HoursRecord,
} from "@/lib/office-hours";

export { OFFICE_HOURS_VOICE } from "@/lib/office-hours";
type HoursState = {
  loaded: boolean;
  records: HoursRecord[];
  message: string;
  pending: number;
  add: (record: HoursRecord) => void;
};
const Context = createContext<HoursState>({
  loaded: false,
  records: [],
  message: "Tracker unavailable in this view.",
  pending: 0,
  add: () => undefined,
});

/** One recorder per mounted Office, independent of the current room. No idle/voice content is stored. */
export function OfficeHoursProvider({ children }: { children: ReactNode }) {
  const session = useOwnerSession();
  const sync = useServerFn(syncOfficeHours);
  const [state, setState] = useState<Omit<HoursState, "add">>({
    loaded: false,
    records: [],
    message: "Not recording — owner two-step sign-in required.",
    pending: 0,
  });
  const addRef = useRef<(record: HoursRecord) => void>(() => undefined);
  useEffect(() => {
    setState({
      loaded: false,
      records: [],
      message: "Not recording — owner two-step sign-in required.",
      pending: 0,
    });
    addRef.current = () => undefined;
    if (!session.stepUpComplete || session.viewer || !session.ownerId || !session.accessToken)
      return;
    setState({
      loaded: false,
      records: [],
      pending: 0,
      message: "Reading shared history; recording starts after confirmation.",
    });
    const prefix = `canx-office-hours-v1:${session.ownerId}:`;
    let records: HoursRecord[] = [],
      stopped = false,
      busy = false,
      ready = false;
    let cursor: string | undefined;
    let last = Date.now(),
      lastActivity = last,
      voice = false;
    const pending = () => {
      const rows: HoursRecord[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix)) {
          const parsed = JSON.parse(localStorage.getItem(k) ?? "null") as HoursRecord;
          if (!parsed?.id || k !== prefix + parsed.id)
            throw new Error("Pending Office Hours data needs review.");
          rows.push(parsed);
        }
      }
      return [...new Map(rows.map((r) => [r.id, r])).values()];
    };
    const publish = (message: string) => {
      if (!stopped) {
        const queue = pending();
        setState({
          loaded: ready,
          records: [...records, ...queue],
          pending: queue.length,
          message,
        });
      }
    };
    const add = (r: HoursRecord) => {
      try {
        localStorage.setItem(prefix + r.id, JSON.stringify(r));
        publish("Recording on this device; shared save pending.");
      } catch {
        ready = false;
        setState((s) => ({
          ...s,
          message:
            "Recording stopped: device storage unavailable. Previously saved records remain.",
        }));
      }
    };
    addRef.current = add;
    const flush = async () => {
      if (busy || stopped) return;
      busy = true;
      try {
        const batch = pending().slice(0, 100);
        const reply = await sync({
          data: { accessToken: session.accessToken!, records: batch, since: cursor },
        });
        if (stopped) return;
        if (!reply.ok) {
          publish(reply.message);
          return;
        }
        const confirmed = new Set(batch.map((r) => r.id));
        // Immutable per-record keys: another tab can append safely during readback/pruning.
        for (const id of confirmed) localStorage.removeItem(prefix + id);
        records = [...new Map([...records, ...reply.records].map((r) => [r.id, r])).values()];
        cursor = reply.cursor;
        if (!ready) {
          last = Date.now();
          lastActivity = last;
          ready = true;
        }
        publish(
          settings(records).paused
            ? "Paused — shared records confirmed."
            : "Recording — shared records confirmed; sync every 60 seconds.",
        );
      } catch {
        try {
          publish(
            "Shared sync unavailable. Device records are pending; no disconnect gap is backfilled.",
          );
        } catch {
          ready = false;
          setState((s) => ({ ...s, message: "Recording stopped: device storage unavailable." }));
        }
      } finally {
        busy = false;
      }
    };
    const activity = () => {
      lastActivity = Date.now();
    };
    const onVoice = (e: Event) => {
      voice = (e as CustomEvent<boolean>).detail === true;
    };
    const tick = () => {
      const now = Date.now();
      if (ready) {
        try {
          const cfg = settings([...records, ...pending()]);
          const r = !cfg.paused ? elapsed(last, now, lastActivity, cfg.idleMinutes, voice) : null;
          if (r) add({ id: crypto.randomUUID(), ...r });
        } catch {
          ready = false;
          setState((s) => ({ ...s, message: "Recording stopped: device storage unavailable." }));
        }
      }
      last = now;
    };
    const onPageHide = () => tick();
    for (const name of ["pointerdown", "keydown", "scroll", "touchstart"])
      window.addEventListener(name, activity, { passive: true });
    window.addEventListener(OFFICE_HOURS_VOICE, onVoice);
    window.addEventListener("pagehide", onPageHide);
    const timer = setInterval(tick, HEARTBEAT),
      syncTimer = setInterval(() => void flush(), 60_000);
    void flush();
    return () => {
      tick();
      stopped = true;
      addRef.current = () => undefined;
      clearInterval(timer);
      clearInterval(syncTimer);
      for (const name of ["pointerdown", "keydown", "scroll", "touchstart"])
        window.removeEventListener(name, activity);
      window.removeEventListener(OFFICE_HOURS_VOICE, onVoice);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [session.ownerId, session.accessToken, session.stepUpComplete, session.viewer, sync]);
  return (
    <Context.Provider value={{ ...state, add: (r) => addRef.current(r) }}>
      {children}
    </Context.Provider>
  );
}

export function OfficeHoursPanel() {
  const session = useOwnerSession();
  const state = useContext(Context);
  const [period, setPeriod] = useState<"day" | "week" | "month">("day");
  const [error, setError] = useState("");
  if (!session.stepUpComplete || session.viewer)
    return (
      <section className="relative mx-auto mt-4 max-w-[1500px] rounded-xl border p-4">
        <h2>Office Hours</h2>
        <p>Owner two-step sign-in required. No hours recorded in this view.</p>
      </section>
    );
  if (!state.loaded)
    return (
      <section
        aria-label="Office Hours"
        className="relative mx-auto mt-4 max-w-[1500px] rounded-xl border p-4"
      >
        <h2>Office Hours</h2>
        <p role="status">{state.message}</p>
        <p>
          Totals unavailable until shared history is read. Requested start: October 24, 2026 ·
          America/Dawson_Creek. No earlier hours are invented.
        </p>
      </section>
    );
  return (
    <OfficeHoursView
      {...state}
      period={period}
      setPeriod={setPeriod}
      error={error}
      setError={setError}
    />
  );
}

export function OfficeHoursView({
  records,
  message,
  pending,
  add,
  period,
  setPeriod,
  error,
  setError,
}: HoursState & {
  period: "day" | "week" | "month";
  setPeriod: (v: "day" | "week" | "month") => void;
  error: string;
  setError: (v: string) => void;
}) {
  const cfg = settings(records),
    buckets = summarize(records, period),
    total = buckets.at(-1);
  const first = records
    .filter((r) => r.type === "elapsed")
    .map((r) => r.start)
    .sort((a, b) => a - b)[0];
  const max = Math.max(1, ...buckets.map((b) => b.open));
  const measuredOpen = buckets.reduce((n, b) => n + b.open, 0),
    measuredActive = buckets.reduce((n, b) => n + b.active, 0);
  const control = (paused: boolean, idleMinutes: number) =>
    add({
      id: crypto.randomUUID(),
      type: "control",
      at: Math.max(Date.now(), ...records.filter((r) => r.type === "control").map((r) => r.at + 1)),
      paused,
      idleMinutes,
    });
  return (
    <section
      aria-label="Office Hours"
      className="relative mx-auto mt-4 max-w-[1500px] space-y-3 rounded-xl border border-sky-400/40 bg-slate-950 p-4 text-white"
    >
      <h2 className="text-xl font-bold">Office Hours</h2>
      <p role="status">
        {message} {pending > 0 && `${pending} records pending shared confirmation.`}
      </p>
      <p className="text-sm text-slate-300">
        Requested start: October 24, 2026 · America/Dawson_Creek. Actual activation:{" "}
        {first
          ? new Date(first).toLocaleString("en-CA", { timeZone: "America/Dawson_Creek" })
          : "not yet recorded"}
        . No earlier hours are invented.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <p>
          <span>Measured Office-open time</span>
          <br />
          <strong>{measuredOpen.toFixed(2)} hours</strong>
          <br />
          With manual adjustments: {(total?.runningOpen ?? 0).toFixed(2)} hours
        </p>
        <p>
          <span>Estimated active working time</span>
          <br />
          <strong>{measuredActive.toFixed(2)} hours</strong>
          <br />
          With manual adjustments: {(total?.runningActive ?? 0).toFixed(2)} hours
        </p>
      </div>
      <p className="text-sm text-slate-300">
        Open time counts observed browser elapsed intervals, including idle time. Active time
        estimates input or an ongoing Office voice session; voice connection is evidence of possible
        work, not proof. Overlapping tabs and devices count once. Sleeping or suspended browser gaps
        over 30 seconds are excluded. Shared controls sync within 60 seconds while connected; pause
        intervals are reconciled in totals. Pending device records are provisional.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded border px-3 py-2"
          onClick={() => control(!cfg.paused, cfg.idleMinutes)}
        >
          {cfg.paused ? "Resume tracking" : "Pause tracking"}
        </button>
        <label>
          Idle threshold (minutes){" "}
          <select
            className="rounded border bg-slate-900 p-2"
            value={cfg.idleMinutes}
            onChange={(e) => control(cfg.paused, Number(e.target.value))}
          >
            {[...new Set([1, 2, 5, 10, 15, 30, 60, cfg.idleMinutes])]
              .sort((a, b) => a - b)
              .map((n) => (
                <option key={n}>{n}</option>
              ))}
          </select>
        </label>
        <label>
          Chart period{" "}
          <select
            className="rounded border bg-slate-900 p-2"
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
          >
            <option value="day">Daily</option>
            <option value="week">Weekly (Monday)</option>
            <option value="month">Monthly</option>
          </select>
        </label>
      </div>
      {!buckets.length ? (
        <p>No elapsed sessions recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption>
              Hours by {period} · blue: measured open · lime: estimated active; corrections included
              in running totals
            </caption>
            <thead>
              <tr>
                <th>Period</th>
                <th>Open / active estimate</th>
                <th>Corrections open / active</th>
                <th>Running totals</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.label}>
                  <th className="p-2">
                    {b.label}
                    <span
                      aria-hidden
                      className="block h-2 bg-sky-400"
                      style={{ width: `${(100 * b.open) / max}%` }}
                    />
                    <span
                      aria-hidden
                      className="mt-1 block h-2 bg-lime-400"
                      style={{ width: `${(100 * b.active) / max}%` }}
                    />
                  </th>
                  <td className="p-2">
                    {b.open.toFixed(2)} / {b.active.toFixed(2)}
                  </td>
                  <td className="p-2">
                    {b.correctionOpen.toFixed(2)} / {b.correctionActive.toFixed(2)}
                  </td>
                  <td className="p-2">
                    {b.runningOpen.toFixed(2)} / {b.runningActive.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          const day = String(data.get("day"));
          const openMinutes = Number(data.get("open"));
          const activeMinutes = Number(data.get("active"));
          const reason = String(data.get("reason")).trim();
          if (
            !first ||
            day < dayKey(first) ||
            day > dayKey(Date.now()) ||
            !reason ||
            !Number.isFinite(openMinutes) ||
            !Number.isFinite(activeMinutes) ||
            Math.abs(openMinutes) > 1440 ||
            Math.abs(activeMinutes) > 1440
          ) {
            setError(
              "Choose a date since actual activation, a reason and corrections within ±1440 minutes.",
            );
            return;
          }
          add({
            id: crypto.randomUUID(),
            type: "correction",
            at: Date.now(),
            day,
            openMinutes,
            activeMinutes,
            reason,
          });
          setError("");
          form.reset();
        }}
      >
        <label>
          Date
          <input
            className="block min-h-10 max-w-full rounded border bg-slate-900 p-2"
            type="date"
            name="day"
            required
            min={first ? dayKey(first) : dayKey(Date.now())}
            max={dayKey(Date.now())}
          />
        </label>
        <label>
          Open adjustment (minutes)
          <input
            className="block w-36 rounded border bg-slate-900 p-2"
            type="number"
            step="any"
            min="-1440"
            max="1440"
            name="open"
            defaultValue="0"
            required
          />
        </label>
        <label>
          Active adjustment (minutes)
          <input
            className="block w-36 rounded border bg-slate-900 p-2"
            type="number"
            step="any"
            min="-1440"
            max="1440"
            name="active"
            defaultValue="0"
            required
          />
        </label>
        <label>
          Correction reason
          <input
            className="block w-48 max-w-full rounded border bg-slate-900 p-2"
            name="reason"
            maxLength={240}
            required
          />
        </label>
        <button className="rounded border px-3 py-2" disabled={!first}>
          Save correction
        </button>
      </form>
      {records.some((r) => r.type === "correction") && (
        <details>
          <summary>Correction history (preserved)</summary>
          <ul className="space-y-2 text-sm">
            {records
              .filter(
                (r): r is Extract<HoursRecord, { type: "correction" }> => r.type === "correction",
              )
              .map((r) => (
                <li key={r.id}>
                  {r.day}: open {r.openMinutes} min; active {r.activeMinutes} min — {r.reason}
                </li>
              ))}
          </ul>
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <p className="text-xs text-slate-400">
        Manual adjustments remain separate from measured sessions and are never represented as
        observed earlier work. Tracking requires owner MFA and working device storage. Native
        external ChatGPT/Claude voice and unobserved offline time cannot be detected.
      </p>
    </section>
  );
}
