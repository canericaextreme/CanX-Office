import type { OwnerState } from "@/lib/owner-session";

export type Tone = "green" | "yellow" | "grey";

export interface SessionStatusSnapshot {
  state: OwnerState;
  configured: boolean;
}

export interface DatabaseStatus {
  tone: Tone;
  note: string;
}

export function databaseStatus({ state, configured }: SessionStatusSnapshot): DatabaseStatus {
  if (state === "owner") {
    return {
      tone: "green",
      note: "Authenticated owner role and two-step verification confirmed by the CanX database.",
    };
  }
  if (configured) {
    return {
      tone: "yellow",
      note: "Configured. Sign-in still has to succeed.",
    };
  }
  return {
    tone: "grey",
    note: "Not connected. Sign-in and shared saving are unavailable.",
  };
}

export function backupsNote({ state }: SessionStatusSnapshot): string {
  if (state === "owner") {
    return "Account exists, but backup and restore have not been tested.";
  }
  return "Not tested. There is no CanX-owned account to back up yet.";
}

export interface NextStepProps {
  state: OwnerState;
  configured: boolean;
  aiConnected: boolean;
  claudeConnected: boolean;
}

export interface NextStepContent {
  title: string;
  paragraphs: string[];
  setupLink: boolean;
}

export function nextStep({ state, configured, aiConnected, claudeConnected }: NextStepProps): NextStepContent {
  if (state === "owner") {
    const paragraphs = [
      "Database, owner role, and two-step verification are complete.",
      "The next unverified step is a live AI provider health check after you add an AI key in Project Settings → Secrets.",
    ];
    if (!aiConnected && !claudeConnected) {
      paragraphs.push("No AI provider is currently connected.");
    }
    return { title: "Verified so far", paragraphs, setupLink: false };
  }

  if (configured) {
    return {
      title: "Your next step",
      paragraphs: [
        "Database is configured but owner verification is not complete.",
        "Finish sign-in and two-step verification before adding an AI key.",
      ],
      setupLink: false,
    };
  }

  return {
    title: "Your next step",
    paragraphs: [
      "The office cannot create the database for you, and it should not: the account has to be yours.",
    ],
    setupLink: true,
  };
}
