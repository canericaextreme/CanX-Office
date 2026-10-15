import { OfficeFiles } from "./OfficeFiles";

// Colours taken from John's White Claw Zero Proof Black Cherry can (15 Oct 2026):
// magenta-to-purple gradient, a silvery white middle and royal blue lettering.
export const BLUEPRINT_COLORS = {
  magenta: "#a8327f",
  orchid: "#8a3a9c",
  purple: "#6a3aa6",
  plum: "#4f2a7a",
  royal: "#2f3fb4",
  navy: "#24307f",
  silver: "#e9e8f0",
  frost: "#c9c6d8",
} as const;

const C = BLUEPRINT_COLORS;

export const BLUEPRINT_PRINCIPLES = [
  {
    id: "config",
    label: "Configuration-driven Canadian platform",
    detail: "Rooms and rules come from settings, so one build can serve many places.",
    color: C.magenta,
  },
  {
    id: "provinces",
    label: "Provincial configurations, national core",
    detail: "Each province adds its own settings on top of one shared core.",
    color: C.orchid,
  },
  {
    id: "evidence",
    label: "Evidence-led status history",
    detail: "A status changes only when there is proof, and the history is kept.",
    color: C.purple,
  },
  {
    id: "human",
    label: "Human authority over safety-critical AI",
    detail: "AI can suggest. A person decides anything that affects safety.",
    color: C.plum,
  },
  {
    id: "portable",
    label: "Portable, independently rebuildable",
    detail: "The Office can be moved and rebuilt without depending on one provider.",
    color: C.royal,
  },
] as const;

export const BLUEPRINT_DECISIONS = [
  {
    topic: "Backend provider",
    decision: "Open — compare Lovable Cloud vs CanX Supabase",
    state: "Open",
    color: C.magenta,
  },
  {
    topic: "3D office",
    decision: "CSS 3D transforms for Phase 1; WebGL optional later",
    state: "Decided",
    color: C.purple,
  },
  {
    topic: "AI workers",
    decision: "Not enabled until approval integrity and cost limits exist",
    state: "On hold",
    color: C.plum,
  },
  {
    topic: "Stripe",
    decision: "Phase 4+ after legal and finance review",
    state: "Later",
    color: C.royal,
  },
] as const;

const STEPS = [
  ["Propose", "Describe the room or rule change and why it is needed."],
  ["Compare", "Set it beside the approved baseline so the difference is clear."],
  ["Approve", "John approves layout and architecture changes before they are built."],
  ["Record", "Save the dated change here so every assistant reads the same plan."],
] as const;

export function BlueprintRoom() {
  return (
    <div className="space-y-8">
      <header
        className="rounded-xl border p-6 sm:p-8"
        style={{
          borderColor: C.frost,
          background: `linear-gradient(135deg, ${C.magenta} 0%, ${C.purple} 45%, ${C.plum} 100%)`,
          color: C.silver,
        }}
      >
        <p className="text-xs font-semibold tracking-[.2em]" style={{ color: C.frost }}>
          CANX OFFICE / ROOM 07
        </p>
        <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">How the Office is built</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed">
          The plan behind every room: the principles it follows and the big decisions, open or made.
          This room records the design. It does not change a room by itself.
        </p>
      </header>

      <section aria-label="Architecture principles">
        <h2 className="font-serif text-2xl">Architecture principles</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Five rules every room and build is expected to follow.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {BLUEPRINT_PRINCIPLES.map((p, i) => (
            <article
              key={p.id}
              className="overflow-hidden rounded-lg text-white shadow-sm"
              style={{ backgroundColor: p.color }}
            >
              <div className="bg-black/20 px-4 py-3 text-[10px] font-bold uppercase tracking-wider">
                {String(i + 1).padStart(2, "0")} · Principle
              </div>
              <div className="p-4">
                <h3 className="font-serif text-xl font-semibold leading-tight">{p.label}</h3>
                <p className="mt-3 text-sm leading-relaxed">{p.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Key decisions">
        <h2 className="font-serif text-2xl">Key decisions</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The big choices about how the Office is built, and where each one stands.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {BLUEPRINT_DECISIONS.map((d, i) => (
            <article
              key={d.topic}
              className="overflow-hidden rounded-lg shadow-sm"
              style={{ backgroundColor: C.silver, color: C.navy }}
            >
              <div
                className="flex justify-between gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-white"
                style={{ backgroundColor: d.color }}
              >
                <span>{String(i + 1).padStart(2, "0")} · Decision</span>
                <span>{d.state}</span>
              </div>
              <div className="p-4">
                <h3
                  className="font-serif text-xl font-semibold leading-tight"
                  style={{ color: C.royal }}
                >
                  {d.topic}
                </h3>
                <p className="mt-3 text-sm leading-relaxed">{d.decision}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Blueprint files">
        <h2 className="font-serif text-2xl">Plans and drawings</h2>
        <p className="mt-2 mb-4 text-sm text-muted-foreground">
          Saved plans, sketches and specifications for the Office.
        </p>
        <OfficeFiles room="blueprint" />
      </section>

      <section>
        <h2 className="font-serif text-2xl">How a design change moves</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map(([title, detail], i) => (
            <article
              key={title}
              className="rounded-lg border bg-card p-4"
              style={{ borderTop: `4px solid ${i % 2 ? C.royal : C.magenta}` }}
            >
              <p className="text-xs font-semibold text-muted-foreground">STEP {i + 1}</p>
              <h3 className="mt-2 font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed">{detail}</p>
            </article>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          The Layout Change Record helper uses the master Skills registry. Automatic visual
          comparison with the baseline is not connected yet.
        </p>
      </section>
    </div>
  );
}
