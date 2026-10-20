import type { AdviceResult } from "@/lib/brain-advice.functions";
import type { FactSheet } from "@/lib/brain-advice";
import { sendManagerHandoff } from "@/lib/companion-bridge";

const VERDICT: Record<"approve" | "archive" | "unsure", { label: string; tone: string }> = {
  approve: { label: "Elsie suggests: Approve", tone: "border-[#199e70] text-[#7fd1ad]" },
  archive: { label: "Elsie suggests: Archive", tone: "border-slate-400 text-slate-200" },
  unsure: { label: "Elsie isn't sure", tone: "border-[#c98500] text-[#f2c66b]" },
};

function Facts({ f }: { f: FactSheet }) {
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Facts Elsie used</summary>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>
          Status {f.status}
          {f.worker ? `, assigned to ${f.worker}` : ""}, last change{" "}
          {f.ageDays != null ? `${f.ageDays} day${f.ageDays === 1 ? "" : "s"} ago` : "unknown"}.
        </li>
        {f.waitingReason ? <li>On hold because: {f.waitingReason}</li> : null}
        {f.github.map((g) => (
          <li key={g.ref}>
            {g.kind === "change" ? `Draft change ${g.ref}` : `Build ${g.ref.replace("run ", "")}`}:{" "}
            {g.state} (checked on GitHub just now)
          </li>
        ))}
        <li>
          {f.approvals.length
            ? `Approval box: ${f.approvals.map((a) => `${a.status}${a.decidedAt ? ` on ${a.decidedAt.slice(0, 10)}` : ""}`).join(", ")}`
            : "Approval box: no record for this item."}
        </li>
        <li>
          {f.history.length
            ? `${f.history.length} move(s) in the work logbook.`
            : "No moves in the work logbook yet."}
        </li>
        {f.result ? <li>Result so far: {f.result.slice(0, 200)}</li> : null}
        {f.unread.length ? (
          <li className="text-[#f0a37f]">Couldn't read: {f.unread.join(", ")}.</li>
        ) : null}
      </ul>
    </details>
  );
}

/** Elsie's advice on one item, shown right under it. Advice only — the buttons stay John's. */
export function BrainAdvice({ state, title }: { state: "loading" | AdviceResult; title: string }) {
  if (state === "loading") {
    return (
      <p role="status" className="mt-1 text-xs text-muted-foreground">
        Elsie is reading the facts for this item…
      </p>
    );
  }
  if (!state.ok) {
    return (
      <div role="status" className="mt-1 space-y-1 rounded-md border border-border p-2">
        <p className="text-xs text-[#f0a37f]">{state.message}</p>
        {state.facts ? <Facts f={state.facts} /> : null}
      </div>
    );
  }
  const v = VERDICT[state.advice.verdict];
  return (
    <div
      role="status"
      aria-label={`Elsie's advice on ${title}`}
      className="mt-1 space-y-1.5 rounded-md border border-border bg-muted/30 p-2.5"
    >
      <span
        className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold ${v.tone}`}
      >
        {v.label}
      </span>
      <p className="text-sm text-foreground">{state.advice.summary}</p>
      <ul className="list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
        {state.advice.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {state.advice.missing.length ? (
        <p className="text-xs text-muted-foreground">
          To be sure, Elsie would need: {state.advice.missing.join("; ")}
        </p>
      ) : null}
      <Facts f={state.facts} />
      <div className="flex flex-wrap items-center gap-3 pt-0.5">
        <span className="text-[11px] text-muted-foreground">
          Advice only. You decide with the buttons.
        </span>
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline underline-offset-2"
          onClick={() =>
            sendManagerHandoff({
              text: `Let's talk about this Needs-you item before I decide: "${title}". You suggested: ${state.advice.verdict} — ${state.advice.summary}`,
              room: "brain",
              path: "/brain",
              source: "room_button",
            })
          }
        >
          Talk it over with Elsie
        </button>
      </div>
    </div>
  );
}
