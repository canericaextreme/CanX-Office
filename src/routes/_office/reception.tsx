import { createFileRoute, Link } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Button } from "@/components/ui/button";
import { readOfficeConnectionPlan } from "@/lib/office-connection-plan";
import { roomIdentityForRoute } from "@/lib/office-room-identity";
import { PreTripBadge } from "@/components/office/PreTripCard";

// Solar Flare room palette (16 Oct 2026). Text on the orange-gold is always dark ink,
// because white text on Solar Flare is hard to read.
const RECEPTION_COLORS = {
  flare: "#FFB000",
  amber: "#FF9500",
  ember: "#E07000",
  rust: "#8A4500",
  ink: "#2B1A00",
  pale: "#FFF6E0",
  stone: "#5A5246",
} as const;

const C = RECEPTION_COLORS;

const STEP_LOOK = {
  verified: { strip: C.ember, text: C.ink, label: "Verified step" },
  blocked: { strip: C.stone, text: C.pale, label: "Blocked" },
  pending: { strip: C.flare, text: C.ink, label: "Not verified yet" },
} as const;

const SHORTCUTS = [
  { to: "/work-board", label: "Work Board" },
  { to: "/brain", label: "Brain" },
  { to: "/approvals", label: "Approvals" },
  { to: "/", label: "Office map" },
] as const;

export const Route = createFileRoute("/_office/reception")({
  component: ReceptionRoom,
});

function ReceptionRoom() {
  const plan = readOfficeConnectionPlan();

  return (
    <RoomShell title="Reception" showSample={false}>
      <div className="space-y-8">
        <header
          className="rounded-xl border p-6 sm:p-8"
          style={{
            borderColor: C.ember,
            background: `linear-gradient(135deg, ${C.flare} 0%, ${C.amber} 55%, ${C.ember} 100%)`,
            color: C.ink,
          }}
        >
          <p className="text-xs font-semibold tracking-[.2em]" style={{ color: C.rust }}>
            CANX OFFICE / ROOM 01
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl">
            Welcome to CanX Office
          </h2>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed">
            Talk to Elsie about what you need, or open a room to review your work.
          </p>
          <div className="mt-5">
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent("canx:open-manager"))}
              className="hover:opacity-90"
              style={{ backgroundColor: C.ink, color: C.flare }}
            >
              Talk to Elsie
            </Button>
          </div>
          <div className="mt-4 inline-block rounded-md px-3 py-2" style={{ backgroundColor: C.pale, color: C.ink }}>
            <PreTripBadge />
          </div>
        </header>

        <section aria-label="Rooms">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SHORTCUTS.map((room, i) => {
              const purpose = room.to === "/" ? null : roomIdentityForRoute(room.to)?.purpose;
              return (
                <Link
                  key={room.to}
                  to={room.to}
                  className="flex flex-col overflow-hidden rounded-lg shadow-sm transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2"
                  style={{ backgroundColor: C.pale, color: C.ink, outlineColor: C.ember }}
                >
                  <div
                    className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: i % 2 ? C.amber : C.flare, color: C.ink }}
                  >
                    Open room
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-serif text-xl font-semibold leading-tight">{room.label}</h3>
                    {purpose && (
                      <p className="mt-2 text-sm leading-relaxed" style={{ color: C.rust }}>
                        {purpose}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-label={plan.title}>
          <h2 className="font-serif text-2xl">{plan.title}</h2>
          <div
            className="mt-4 rounded-lg px-4 py-3 text-sm"
            style={{ backgroundColor: C.ink, color: C.pale }}
          >
            <strong style={{ color: C.flare }}>Next step:</strong> {plan.nextStep}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Reviewed {plan.reviewedAt.slice(0, 10)}. {plan.source}.
          </p>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plan.steps.map((step, i) => {
              const look =
                step.status === "verified" || step.status === "blocked"
                  ? STEP_LOOK[step.status]
                  : STEP_LOOK.pending;
              return (
                <li
                  key={step.id}
                  className="flex flex-col overflow-hidden rounded-lg shadow-sm"
                  style={{ backgroundColor: C.pale, color: C.ink }}
                >
                  <div
                    className="flex justify-between gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: look.strip, color: look.text }}
                  >
                    <span>{String(i + 1).padStart(2, "0")} · Step</span>
                    <span>{look.label}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-serif text-lg font-semibold leading-tight">{step.label}</h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: C.rust }}>
                      {step.evidence}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </RoomShell>
  );
}
