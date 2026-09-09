import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/legal")({
  head: () => ({
    meta: [
      { title: "CanX Office — Legal" },
      { name: "description", content: "Contracts, terms, and legal records in CanX Office." },
      { property: "og:title", content: "CanX Office — Legal" },
      { property: "og:description", content: "Contracts, terms, and legal records in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Legal,
});

function Legal() {
  return (
    <RoomShell>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Contracts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Signed agreements, drafts under review, and expiry alerts. No documents stored in
              Phase 1.
            </p>
            <Button className="mt-4" disabled>
              Upload contract
            </Button>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Terms &amp; privacy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Public terms, privacy policy, and cookie notices. Content will be drafted with legal
              review before Phase 2.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
