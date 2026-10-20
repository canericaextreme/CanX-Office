import { useEffect, useState } from "react";
import { BRAIN_CAST } from "@/lib/brain-shelves";
import { castNow } from "@/lib/brain-cast-now";
import { useBrainView, type BrainViewState } from "@/lib/use-brain-view";

/**
 * Who's who: what each part of the Office does today, plus a live "Now:" line
 * read from the Work Board and the work logbook (the same reads as the live
 * Brain view). Says plainly when the live part can't be read.
 */
export function BrainCast({ state: injected }: { state?: BrainViewState } = {}) {
  const own = useBrainView({ live: false });
  const state = injected ?? own;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  // Re-read the Work Board and logbook every minute so the cards stay current.
  useEffect(() => {
    if (injected) return;
    const t = setInterval(() => own.reload(), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injected]);

  return (
    <div className="mt-4 space-y-2">
      <h3 id="brain-cast-heading" className="text-base font-bold">
        Who's who
      </h3>
      <ul aria-labelledby="brain-cast-heading" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {BRAIN_CAST.map((m) => {
          const line =
            state.status === "ready"
              ? castNow(m, state.tasks, state.view, now)
              : state.status === "loading"
                ? "Checking…"
                : null;
          return (
            <li
              key={m.who}
              data-cast={m.who}
              className="rounded-lg border border-[var(--brain-line)] bg-[var(--brain-card)] p-3"
            >
              <p className="text-sm font-bold">{m.who}</p>
              <p className="text-sm">{m.role}</p>
              <p className="mt-1 text-xs text-[var(--brain-room-muted)]">{m.does}</p>
              {state.status !== "signed-out" && (
                <p data-cast-now className="mt-2 text-xs font-semibold">
                  Now: {line ?? "couldn't be read just now."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
