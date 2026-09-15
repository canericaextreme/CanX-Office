import { createFileRoute, Link } from "@tanstack/react-router";
import { BrainMap } from "@/components/office/BrainMap";
import { Office3D } from "@/components/office/Office3D";
import { SimpleOffice } from "@/components/office/SimpleOffice";
import { TourGuide } from "@/components/office/TourGuide";
import { useOfficeViewMode } from "@/hooks/use-office-view";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_office/")({
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
  component: Reception,
});

function Reception() {
  const { mode } = useOfficeViewMode();

  return (
    <main className="min-h-screen bg-background font-reception-body">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex flex-col gap-4 border-b-4 border-reception-charcoal pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="font-reception-heading text-3xl font-extrabold text-foreground">
                 <span className="text-reception-red">CANX</span> <span className="text-reception-charcoal">Office</span>
              </h1>
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
              <p className="text-sm text-foreground">
                Reception does not count open work, items needing you, or stops yet. No counter is connected to the
                live records, so nothing is shown rather than a made-up number.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Open the Work Board for tasks and the Approvals room for anything waiting on you. Those rooms read the
                real records.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Office cost ceiling
              </h2>
              <p className="text-lg font-semibold text-foreground">C$500 per month (CAD)</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Provenance: set by John on 9 September 2026 as the total running-cost ceiling for the office, separate
                from build credits. This is the recorded decision only — it is not automatically enforced here, and no
                live spending total is shown on this page.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 min-w-0 max-w-full">
          <BrainMap />
        </div>
      </div>
    </main>
  );
}
