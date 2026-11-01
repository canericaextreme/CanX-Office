import { SafeHighwaysProgress } from "@/components/office/SafeHighwaysProgress";
import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/safe-highways")({
  head: () => ({
    meta: [
      { title: "CanX Office" },
      { name: "description", content: "Owner-only CanX operations workspace." },
      { property: "og:title", content: "CanX Office" },
      { property: "og:description", content: "Owner-only CanX operations workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SafeHighways,
});

// Laser Blue room palette (16 Oct 2026). Text on the bright blue is always dark navy ink,
// because white text on Laser Blue is hard to read.
const SAFE_HIGHWAYS_COLORS = {
  laser: "#00A2FF",
  sky: "#5CC4FF",
  azure: "#0088E0",
  navy: "#00406E",
  ink: "#001A33",
  pale: "#E8F6FF",
  stone: "#4A5560",
} as const;

const C = SAFE_HIGHWAYS_COLORS;

const STATUS_LOOK = {
  grey: { strip: C.stone, text: C.pale, label: "Unknown / stale" },
} as const;

const COMPONENTS = [
  { name: "Public Reporting App", status: "grey" as const, note: "No live connection" },
  { name: "Foreman Dashboard", status: "grey" as const, note: "No live connection" },
  { name: "Operations Centre", status: "grey" as const, note: "No live connection" },
  { name: "Master Oversight", status: "grey" as const, note: "No live connection" },
  { name: "Public Website", status: "grey" as const, note: "No live connection" },
];

const ROUTING_STEPS = [
  "Report",
  "verified routing",
  "operational review",
  "foreman/crew action",
  "completion or reasoned closure",
  "reporter notification",
  "permanent record",
  "analytics",
];

function SafeHighways() {
  return (
    <RoomShell>
      <div className="space-y-8">
        <header
          className="rounded-xl border p-6 sm:p-8"
          style={{
            borderColor: C.azure,
            background: `linear-gradient(135deg, ${C.sky} 0%, ${C.laser} 50%, ${C.azure} 100%)`,
            color: C.ink,
          }}
        >
          <p className="text-xs font-semibold tracking-[.2em]" style={{ color: C.navy }}>
            CANX OFFICE / ROOM 16
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
            Programme and routing oversight
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed">
            CanX Office oversees Safe Highways; it does not replace its reporting app or rewrite its
            architecture. This room is read-only and disconnected in Phase 1.
          </p>
        </header>

        <SafeHighwaysProgress />

        <section aria-label="Safe Highways components">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COMPONENTS.map((c, i) => {
              const look = STATUS_LOOK[c.status];
              return (
                <article
                  key={c.name}
                  className="flex flex-col overflow-hidden rounded-lg shadow-sm"
                  style={{ backgroundColor: C.pale, color: C.ink }}
                >
                  <div
                    className="flex justify-between gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: i % 2 ? C.sky : C.laser, color: C.ink }}
                  >
                    <span>{String(i + 1).padStart(2, "0")} · Component</span>
                    <span
                      className="rounded-full px-2"
                      style={{ backgroundColor: look.strip, color: look.text }}
                    >
                      {look.label}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-serif text-xl font-semibold leading-tight">{c.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: C.navy }}>
                      {c.note}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-label="Routing evidence">
          <h2 className="font-serif text-2xl">Routing evidence</h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ROUTING_STEPS.map((step, i) => (
              <li
                key={step}
                className="flex flex-col overflow-hidden rounded-lg shadow-sm"
                style={{ backgroundColor: C.pale, color: C.ink }}
              >
                <div
                  className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ backgroundColor: i % 2 ? C.sky : C.laser, color: C.ink }}
                >
                  {String(i + 1).padStart(2, "0")} · Step
                </div>
                <p className="p-4 font-serif text-lg font-semibold leading-tight first-letter:uppercase">
                  {step}
                </p>
              </li>
            ))}
          </ol>
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm"
            style={{ backgroundColor: C.ink, color: C.pale }}
          >
            <span>Live routing data requires a scoped Phase 3 connection.</span>
            <Button disabled style={{ backgroundColor: C.laser, color: C.ink }}>
              Request read-only inventory connection
            </Button>
          </div>
        </section>
      </div>
    </RoomShell>
  );
}
