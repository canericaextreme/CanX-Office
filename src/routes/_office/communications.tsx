import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useOwnerSession } from "@/lib/owner-session";
import { checkMailboxAccess, type MailboxAccessResult } from "@/lib/mailbox-access.functions";

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
            <MailboxStatusList />
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

const STATUS_LABEL = {
  verified: "Verified — read access confirmed",
  authorization_required: "Linked, but access refused — re-authorize",
  unavailable: "Linked, but could not be checked right now",
} as const;

function MailboxStatusList() {
  const owner = useOwnerSession();
  const [state, setState] = useState<"idle" | "loading" | MailboxAccessResult>("idle");
  useEffect(() => {
    if (!owner.shared || !owner.accessToken) { setState("idle"); return; }
    let live = true;
    setState("loading");
    checkMailboxAccess({ data: { accessToken: owner.accessToken } })
      .then((r) => { if (live) setState(r); })
      .catch(() => { if (live) setState({ ok: false, message: "Mailbox status could not be checked right now." }); });
    return () => { live = false; };
  }, [owner.shared, owner.accessToken]);

  let body: React.ReactNode;
  if (state === "idle") body = <p>Sign in as owner with two-step verification to see which mailboxes Elsie can reach.</p>;
  else if (state === "loading") body = <p>Checking linked mailboxes…</p>;
  else if (!state.ok) body = <p>Status unavailable: {state.message}</p>;
  else if (state.accounts.length === 0) body = <p>No mailbox is linked to CanX Office yet.</p>;
  else body = (
    <>
      <ul className="space-y-2">
        {state.accounts.map((a) => (
          <li key={a.slot} className="rounded-md border border-border p-2">
            <span className="font-medium text-foreground">{a.email ?? `Linked Gmail #${a.slot}`}</span>
            <span className="block">{STATUS_LABEL[a.status]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs">Checked {new Date(state.checkedAt).toLocaleString()} using each mailbox's profile only. No mail was read or copied.</p>
    </>
  );
  return <div className="mt-4 text-sm text-muted-foreground" aria-live="polite">{body}</div>;
}
