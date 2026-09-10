import { createFileRoute, Link } from "@tanstack/react-router";
import { BrainMap } from "@/components/office/BrainMap";
import { Office3D } from "@/components/office/Office3D";
import { SimpleOffice } from "@/components/office/SimpleOffice";
import { StatusPanel } from "@/components/office/StatusPanel";
import { TourGuide } from "@/components/office/TourGuide";
import { SAMPLE_STATUS } from "@/lib/office-data";
import { useOfficeViewMode } from "@/hooks/use-office-view";
import { Card, CardContent } from "@/components/ui/card";
import { SampleBadge } from "@/components/office/SampleBadge";

export const Route = createFileRoute("/_office/")({
  head: () => ({
    meta: [
      { title: "CanX Office — Reception" },
      { name: "description", content: "CanX Office command centre for John Cantlon." },
      { property: "og:title", content: "CanX Office — Reception" },
      { property: "og:description", content: "CanX Office command centre for John Cantlon." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reception,
});

function Reception() {
  const { mode, hydrated } = useOfficeViewMode();

  return (
    <main className="min-h-screen bg-background font-reception-body">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-col gap-4 border-b-4 border-reception-charcoal pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="font-reception-heading text-3xl font-extrabold text-foreground">
                 <span className="text-reception-red">CANX</span> <span className="text-reception-charcoal">Office</span>
              </h1>
              <SampleBadge />
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              John's visual command centre. What is happening? What needs me? What is blocked?
              What has been verified? What will it cost?
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TourGuide />
          </div>
        </div>

        <Card className="mb-6 border-border bg-card">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-[240px] flex-1">
              <p className="text-sm font-medium text-foreground">
                Ask the Office Manager — bottom right of every room.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                It reads the office, sums up what needs you, suggests tasks for you to save, and can preview the
                look of the office. It has no AI connection yet, and it says so instead of guessing.
              </p>
            </div>
            <Link
              to="/round-table"
              className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              Monday round table draft
            </Link>
          </CardContent>
        </Card>

        <div className="mb-6">{mode === "3d" ? <Office3D /> : <SimpleOffice />}</div>

        <div className="mb-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">


            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Quick answers
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Open work" value="4" tone="blue" />
                <Metric label="Need me" value="2" tone="yellow" />
                <Metric label="Red stops" value="1" tone="red" />
                <Metric label="Cost guardrail" value="CAD $300/mo" tone="grey" />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                These numbers are synthetic examples for demonstration only.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <StatusPanel items={SAMPLE_STATUS} />
          </div>
        </div>

        <div className="mb-6 min-w-0 max-w-full">
          <BrainMap />
        </div>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "green" | "blue" | "yellow" | "red" | "grey";
}) {
  const colors = {
    green: "border-l-canx-green bg-canx-green/5",
    blue: "border-l-canx-blue bg-canx-blue/5",
    yellow: "border-l-canx-yellow bg-canx-yellow/5",
    red: "border-l-canx-red bg-canx-red/5",
    grey: "border-l-canx-grey bg-canx-grey/5",
  };

  return (
    <div className={`rounded-lg border-l-4 p-3 ${colors[tone]}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
