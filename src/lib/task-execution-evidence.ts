import { readBuildReceipt } from "./task-receipt";

/** Display the durable execution receipt without exposing storage details. */
export function taskExecutionEvidence(text: string): { label: string; url?: string } | null {
  // Relays append notes after the leading receipt. Use the same validated
  // reader as task execution/reconnect so the link and read-only edit guard survive.
  const value = readBuildReceipt(text);
  if (!value) return null;
  const who = value.builder === "claude" ? "Claude" : "Codex";
  const labels: Record<string, string> = {
    queued: "Build queued",
    in_progress: "Build running",
    success: "Candidate checks passed — review and publication still required",
    failure: "Build failed",
    cancelled: "Build cancelled",
    skipped: "Build skipped",
    submission_unconfirmed: "Build submission unconfirmed — check Build & Testing before retrying",
  };
  const label = `${who}: ${labels[value.state] ?? "Build status needs checking"}`;
  return value.runId
    ? { label, url: `https://github.com/canericaextreme/CanX-Office/actions/runs/${value.runId}` }
    : { label };
}
