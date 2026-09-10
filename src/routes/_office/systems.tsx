"use client";

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetPanel } from "@/components/office/BudgetPanel";
import { OwnerSignIn } from "@/components/office/OwnerSignIn";
import { ClaudeReviewPanel } from "@/components/office/ClaudeReviewPanel";
import { useOwnerSession } from "@/lib/owner-session";
import { getManagerStatus, type ManagerStatus } from "@/lib/manager.functions";
import { getClaudeStatus, type ClaudeStatus } from "@/lib/claude-review.functions";
import {
  CHATGPT_SNAPSHOT,
  CHATGPT_SNAPSHOT_LABEL,
  OFFICE_CONNECTIONS,
  SUPABASE_SETUP_URL,
} from "@/lib/connections-inventory";
import { backupsNote, databaseStatus, nextStep, type Tone } from "@/lib/systems-status";


export const Route = createFileRoute("/_office/systems")({
  head: () => ({
    meta: [
      { title: "CanX Office — Systems & Connections" },
      {
        name: "description",
        content: "What the CanX Office is actually connected to, what it still needs, and what is only planned.",
      },
      { property: "og:title", content: "CanX Office — Systems & Connections" },
      {
        property: "og:description",
        content: "Honest connection status for the CanX Office: nothing is shown as connected unless it really is.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Systems,
});

function Systems() {
  const session = useOwnerSession();
  const fetchStatus = useServerFn(getManagerStatus);
  const fetchClaude = useServerFn(getClaudeStatus);
  const [ai, setAi] = useState<ManagerStatus | null>(null);
  const [claude, setClaude] = useState<ClaudeStatus | null>(null);

  useEffect(() => {
    void fetchStatus({ data: { accessToken: session.accessToken ?? "" } })
      .then(setAi)
      .catch(() => setAi(null));
    void fetchClaude({ data: { accessToken: session.accessToken ?? "" } })
      .then(setClaude)
      .catch(() => setClaude(null));
  }, [fetchStatus, fetchClaude, session.accessToken, session.state]);


  const dbConnected = session.configured;
  const signedIn = session.state === "owner";

  return (
    <RoomShell showSample={false}>
      <div className="space-y-6">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">What this office is connected to</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nothing below is shown as connected unless the office has actually checked it. A key or an account
              somewhere else is not a connection.
            </p>
            <Row name="CanX-owned database" note={databaseStatus({ state: session.state, configured: session.configured }).note} tone={databaseStatus({ state: session.state, configured: session.configured }).tone} />
            <Row
              name="Owner sign-in with two-step verification"
              note={signedIn ? `Signed in as ${session.email}.` : session.message}
              tone={signedIn ? "green" : "grey"}
            />
            <Row
              name="Office Manager AI"
              note={
                ai === null
                  ? "Checking…"
                  : ai.connected
                    ? `Live and verified (${ai.model}).`
                    : ai.detail
              }
              tone={ai?.connected ? "green" : ai?.state === "configured_unverified" ? "yellow" : "grey"}
            />
            <Row
              name="Claude — second eyes (independent review)"
              note={
                claude === null
                  ? "Checking…"
                  : claude.connected
                    ? `Live and verified (${claude.model}).`
                    : claude.detail
              }
              tone={claude?.connected ? "green" : claude?.state === "configured_unverified" ? "yellow" : "grey"}
            />

            <Row name="Shared records across devices" note={signedIn ? "Saving to your CanX account." : "Device-only. Records stay in this browser."} tone={signedIn ? "green" : "grey"} />
            <Row name="Backups and restore" note="Not tested. There is no CanX-owned account to back up yet." tone="grey" />
            <Row name="Published site" note="Not published." tone="grey" />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Group A — accounts verified in ChatGPT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm text-foreground">
              {CHATGPT_SNAPSHOT_LABEL}. The Office Manager inside this office cannot see or use any of these. Nothing
              from ChatGPT has moved here.
            </p>
            <div className="space-y-2">
              {CHATGPT_SNAPSHOT.map((row) => (
                <div key={row.service} className="rounded-lg border border-border/50 p-3">
                  <div className="font-medium">{row.service}</div>
                  <div className="text-xs text-muted-foreground">{row.account}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Group B — connections this office needs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {OFFICE_CONNECTIONS.map((connection) => {
              const live =
                connection.id === "supabase"
                  ? signedIn
                    ? "green"
                    : dbConnected
                      ? "yellow"
                      : "grey"
                  : connection.id === "openai"
                    ? ai?.connected
                      ? "green"
                      : ai?.state === "configured_unverified"
                        ? "yellow"
                        : "grey"
                    : connection.id === "claude"
                      ? claude?.connected
                        ? "green"
                        : claude?.state === "configured_unverified"
                          ? "yellow"
                          : "grey"
                      : "grey";

              return (
                <div key={connection.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 p-3">
                  <div>
                    <div className="font-medium">{connection.name}</div>
                    <div className="text-xs text-muted-foreground">{connection.purpose}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {connection.stage === "required"
                        ? "Needed first"
                        : connection.stage === "next"
                          ? "After the first two"
                          : "Planned, read only"}
                    </div>
                  </div>
                  <StatePill tone={live as Tone} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <OwnerSignIn />

        <ClaudeReviewPanel />

        <BudgetPanel />


        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Your next step</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              The office cannot create the database for you, and it should not: the account has to be yours.
            </p>
            <a href={SUPABASE_SETUP_URL} target="_blank" rel="noreferrer" className="inline-block text-primary underline">
              {SUPABASE_SETUP_URL}
            </a>
            <p className="text-muted-foreground">
              Choose Supabase there and finish the setup. Then follow <code>docs/office-manager-setup.md</code>, which
              lists the exact steps: the two database files to run, making your account the owner, turning on the
              authenticator app, setting spending limits, and only then adding the AI key.
            </p>
          </CardContent>
        </Card>
      </div>
    </RoomShell>
  );
}

type Tone = "green" | "yellow" | "grey";

const PILL: Record<Tone, { label: string; className: string }> = {
  green: { label: "Connected", className: "border-canx-green/50 bg-canx-green/15 text-canx-green" },
  yellow: { label: "Set up, not verified", className: "border-canx-yellow/50 bg-canx-yellow/15 text-canx-yellow" },
  grey: { label: "Not connected", className: "border-border bg-secondary text-muted-foreground" },
};

function StatePill({ tone }: { tone: Tone }) {
  const pill = PILL[tone];
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${pill.className}`}>
      {pill.label}
    </span>
  );
}

function Row({ name, note, tone }: { name: string; note: string; tone: Tone }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/50 p-3">
      <div>
        <div className="font-medium">{name}</div>
        <div className="text-xs text-muted-foreground">{note}</div>
      </div>
      <StatePill tone={tone} />
    </div>
  );
}
