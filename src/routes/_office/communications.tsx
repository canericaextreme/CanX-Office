import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/communications")({
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
  component: Communications,
});

function Communications() {
  return (
    <RoomShell>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Mailbox access</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Give Elsie access to retrieve receipts when you ask. Your regular email stays in
              your mailbox; connecting does not copy your inbox into the Office.
            </p>
            <Button className="mt-4" asChild>
              <a href="https://lovable.dev/dashboard?connectors" target="_blank" rel="noopener noreferrer">
                Connect mailbox
              </a>
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">
              Setup opens in a new tab. Choose Gmail, select read-only access, and link the
              connection to CanX Office. We will verify Elsie's access after setup.
              Receipt retrieval currently supports Gmail.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Scheduled messages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Drafts, approvals, and send logs will appear here after a transactional email service
              is connected and verified.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}
