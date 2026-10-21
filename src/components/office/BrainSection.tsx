import { useEffect, useRef, useState, type ReactNode } from "react";

const KEY = "canx-brain-open-sections-v1";

function readOpen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeOpen(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage blocked: sections simply start closed next time */
  }
}

/**
 * A labelled, collapsible box for the Brain room's supporting sections.
 * Closed by default so the live Brain view stays near the top. Opens by
 * itself when a link jumps to it (#id), and remembers which boxes John
 * opened on this device.
 */
export function BrainSection({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  /** One plain line saying what is inside, shown on the closed bar. */
  hint: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const fromHash = () => {
      if (typeof window !== "undefined" && window.location.hash === `#${id}`) {
        setOpen(true);
        requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "start" }));
        return true;
      }
      return false;
    };
    if (!fromHash() && readOpen().includes(id)) setOpen(true);
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [id]);

  return (
    <details
      id={id}
      ref={ref}
      open={open}
      onToggle={(e) => {
        const now = (e.currentTarget as HTMLDetailsElement).open;
        if (now === open) return;
        setOpen(now);
        const ids = new Set(readOpen());
        if (now) ids.add(id);
        else ids.delete(id);
        writeOpen([...ids]);
      }}
      className="group rounded-xl border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-foreground">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
        <span aria-hidden className="shrink-0 text-xs text-muted-foreground">
          <span className="group-open:hidden">Show ▾</span>
          <span className="hidden group-open:inline">Hide ▴</span>
        </span>
      </summary>
      <div className="border-t border-border p-2 sm:p-3">{children}</div>
    </details>
  );
}
