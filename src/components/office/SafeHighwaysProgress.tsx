import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { getSafeHighwaysProgress } from "@/lib/safe-highways-progress.functions";
import type { ManagerTask } from "@/lib/manager-work.functions";
import { taskExecutionEvidence } from "@/lib/task-execution-evidence";

type ProgressReply = Awaited<ReturnType<typeof getSafeHighwaysProgress>>;

/** Optional labelled lines remain part of the existing task, never a second progress record. */
function recorded(task: ManagerTask, label: string) {
  for (const text of [task.result, task.evidence, task.detail]) {
    const line = (text || "")
      .split(/\r?\n/)
      .find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    if (line) return line.slice(label.length + 1).trim() || null;
  }
  return null;
}

export function SafeHighwaysProgressDisplay({ task }: { task: ManagerTask }) {
  const receipt = taskExecutionEvidence(task.evidence || "");
  const fields = [
    [
      "Work Board state",
      `${task.status === "in_progress" ? "Assigned — activity unconfirmed" : task.status}${task.worker ? ` · ${task.worker}` : ""}`,
    ],
    [
      "Recorded milestone",
      recorded(task, "Milestone") ||
        "Inventory begun (initial owner-reported state; no later milestone recorded).",
    ],
    [
      "Acceptance tests",
      recorded(task, "Acceptance tests") ||
        "Not performed in the initial owner report; no later test result recorded.",
    ],
    [
      "Last verified time",
      recorded(task, "Last verified") || "Not recorded. Task update time is not verification.",
    ],
    ["Blocker", task.waiting_reason || recorded(task, "Blocker") || "Not recorded."],
    [
      "Next action",
      recorded(task, "Next action") ||
        "Not recorded. Next expected step: finish inventory and record evidence before acceptance testing.",
    ],
  ];
  return (
    <>
      <h3 className="mt-2 font-semibold">{task.title}</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-semibold opacity-75">{label}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm">
        Migration job: none running in the initial owner report. Current runtime is not monitored
        here. Open and assigned tasks do not prove a running job.
      </p>
      {receipt && (
        <p className="mt-2 text-sm">
          Recorded build receipt: {receipt.label}. This is saved evidence, not a live job check.
        </p>
      )}
      <details className="mt-3 text-sm" open>
        <summary className="cursor-pointer font-semibold">
          Supporting evidence and saved report
        </summary>
        <p className="mt-2 whitespace-pre-wrap break-words">
          {task.evidence || "No supporting evidence recorded."}
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words">
          {task.result || "No result recorded."}
        </p>
        {task.detail && <p className="mt-2 whitespace-pre-wrap break-words">{task.detail}</p>}
      </details>
      <p className="mt-3 break-all text-xs opacity-75">Canonical Work Board task: {task.id}</p>
      <a className="mt-2 inline-flex min-h-11 items-center underline" href="/work-board">
        Open Work Board
      </a>
    </>
  );
}

export function SafeHighwaysProgress({ variant = "room" }: { variant?: "room" | "analytics" }) {
  const session = useOwnerSession();
  const load = useServerFn(getSafeHighwaysProgress);
  const [saved, setSaved] = useState<{ token: string; reply: ProgressReply } | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const token = session.state === "owner" && !session.viewer ? session.accessToken : null;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setBusy(true);
    setSaved(null);
    load({ data: { accessToken: token } })
      .then((reply) => {
        if (!cancelled) setSaved({ token, reply });
      })
      .catch(() => {
        if (!cancelled)
          setSaved({
            token,
            reply: {
              ok: false,
              message: "The assignment could not be read. Progress is unavailable.",
            },
          });
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, load, tick]);
  const reply = token && saved?.token === token ? saved.reply : null;
  return (
    <section
      aria-label="Safe Highways assignment progress"
      className={`min-w-0 rounded-xl border p-4 ${variant === "analytics" ? "relative mx-auto mt-4 max-w-[1500px] border-sky-400/40 bg-[#0f161d]/95 text-slate-100" : "border-[#0088E0] bg-[#E8F6FF] text-[#001A33]"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Safe Highways assignment progress</h2>
        {token && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setTick((n) => n + 1)}
            className="min-h-11 rounded-lg border border-current px-3 text-sm disabled:opacity-50"
          >
            Refresh assignment
          </button>
        )}
      </div>
      {!token ? (
        <p className="mt-2 text-sm">Owner two-step sign-in is required to read this assignment.</p>
      ) : !reply ? (
        <p role="status" className="mt-2 text-sm">
          Reading assignment…
        </p>
      ) : !reply.ok ? (
        <p role="status" className="mt-2 text-sm">
          {reply.message}
        </p>
      ) : (
        <SafeHighwaysProgressDisplay task={reply.task} />
      )}
    </section>
  );
}
