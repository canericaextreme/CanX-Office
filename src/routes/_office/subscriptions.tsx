"use client";

import { createFileRoute } from "@tanstack/react-router";
import { Bot, ChevronRight, Pencil, ShieldCheck } from "lucide-react";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/office/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_office/subscriptions")({
  head: () => ({
    meta: [
      { title: "CanX Office — Subscriptions" },
      { name: "description", content: "Track recurring costs and service inventory in CanX Office." },
      { property: "og:title", content: "CanX Office — Subscriptions" },
      { property: "og:description", content: "Track recurring costs and service inventory in CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Subscriptions,
});

const SUBS = [
  { name: "Lovable", cost: "Credits", status: "green" as const, note: "Development platform" },
  { name: "Supabase (proposed)", cost: "TBD", status: "grey" as const, note: "Backend not selected" },
  { name: "Email sending", cost: "TBD", status: "grey" as const, note: "Not connected" },
];

export const AI_WORKERS_VERIFICATION = {
  spend: "$0.20",
  monthlyLimit: "$25.00",
  usage: "0.8%",
  status: "Partially verified",
  lastVerified: "September 11, 2026",
  evidence: "OpenAI Platform Usage and API key activity checked September 11, 2026.",
} as const;

function Subscriptions() {
  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Service inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SUBS.map((sub) => (
            <div key={sub.name} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <div className="font-medium">{sub.name}</div>
                <div className="text-xs text-muted-foreground">{sub.note}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{sub.cost}</span>
                <StatusBadge tone={sub.status} />
              </div>
            </div>
          ))}
          <AiWorkersDetails />
        </CardContent>
      </Card>
    </RoomShell>
  );
}

function AiWorkersDetails() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group flex min-h-20 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-border/50 p-3 text-left transition-colors hover:border-canx-blue/70 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canx-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Open AI Workers subscription verification details"
        >
          <span className="flex min-w-0 items-start gap-3">
            <Bot className="mt-0.5 h-5 w-5 shrink-0 text-canx-blue" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium text-foreground">AI Workers</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Current verified spend {AI_WORKERS_VERIFICATION.spend} of {AI_WORKERS_VERIFICATION.monthlyLimit} OpenAI monthly project limit
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Usage {AI_WORKERS_VERIFICATION.usage} · Last verified {AI_WORKERS_VERIFICATION.lastVerified}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
            <StatusBadge tone="yellow" label={AI_WORKERS_VERIFICATION.status} />
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto border-border bg-card p-4 text-foreground sm:p-6">
        <DialogHeader className="pr-8">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-canx-blue" aria-hidden="true" />
            <DialogTitle>AI Workers subscription details</DialogTitle>
          </div>
          <DialogDescription>
            Verified provider evidence is shown separately from billing that still needs checking. No API keys or secrets are displayed.
          </DialogDescription>
        </DialogHeader>

        <section aria-labelledby="ai-workers-result" className="rounded-md border border-canx-blue/50 bg-canx-blue/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="ai-workers-result" className="text-sm font-semibold text-foreground">Result</h2>
            <StatusBadge tone="yellow" label={AI_WORKERS_VERIFICATION.status} />
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Current verified spend" value={AI_WORKERS_VERIFICATION.spend} />
            <Detail label="OpenAI monthly project limit" value={AI_WORKERS_VERIFICATION.monthlyLimit} />
            <Detail label="Usage" value={AI_WORKERS_VERIFICATION.usage} />
            <Detail label="Last verified" value={AI_WORKERS_VERIFICATION.lastVerified} />
          </dl>
        </section>

        <section aria-labelledby="openai-provider" className="rounded-md border border-canx-blue/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="openai-provider" className="font-semibold">OpenAI API</h2>
            <StatusBadge tone="blue" label="Verified" />
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Project" value="CanX Office" />
            <Detail label="Key name" value="CanX Office Manager" />
            <Detail label="Spend" value={AI_WORKERS_VERIFICATION.spend} />
            <Detail label="Monthly limit" value={AI_WORKERS_VERIFICATION.monthlyLimit} />
            <Detail label="Last used" value={AI_WORKERS_VERIFICATION.lastVerified} />
          </dl>
          <div className="mt-4 border-l-4 border-canx-blue pl-3">
            <h3 className="text-xs font-semibold uppercase text-canx-blue">Evidence</h3>
            <p className="mt-1 text-sm text-foreground">{AI_WORKERS_VERIFICATION.evidence}</p>
          </div>
        </section>

        <section aria-labelledby="claude-provider" className="rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="claude-provider" className="font-semibold">Claude API</h2>
            <span className="max-w-full whitespace-normal text-right">
              <StatusBadge tone="grey" label="Connected, billing not yet verified" />
            </span>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Cost" value="Unknown" />
            <Detail label="Action" value="Verify Anthropic billing/usage" />
          </dl>
        </section>

        <section aria-labelledby="verification-evidence" className="rounded-md border border-border bg-secondary/35 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-canx-blue" aria-hidden="true" />
            <h2 id="verification-evidence" className="text-sm font-semibold">Evidence</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            OpenAI usage and limit are verified from the OpenAI Platform check dated September 11, 2026. Claude is connected, but its billing and usage have not been verified.
          </p>
        </section>

        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Verification figures are read-only because Subscription Watch does not yet have a safe persistent verification record.
          </p>
          <Button type="button" variant="outline" size="sm" disabled aria-label="Edit verification unavailable until safe persistence is added">
            <Pencil className="h-4 w-4" />
            Edit verification unavailable
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
