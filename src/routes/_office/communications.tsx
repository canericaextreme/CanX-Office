import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_office/communications")({
  head: () => ({
    meta: [
      { title: "CanX Office — Communications" },
      { name: "description", content: "Email, messages, and scheduled communications in CanX Office." },
      { property: "og:title", content: "CanX Office — Communications" },
      { property: "og:description", content: "Email, messages, and scheduled communications in CanX Office." },
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
            <CardTitle className="text-base">Inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No mailboxes connected. Phase 3+ only.</p>
            <Button className="mt-4" disabled>
              Connect mailbox
            </Button>
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
