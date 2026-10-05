/** Display the durable execution receipt without exposing storage details. */
export function taskExecutionEvidence(text: string): { label: string; url?: string } | null {
  try {
    const value = JSON.parse(text);
    // Legacy codex-task-v1 receipts are Codex builds.
    if (value.kind !== 'codex-task-v1' && value.kind !== 'office-task-v2') return null;
    const who = value.kind === 'office-task-v2' && value.builder === 'claude' ? 'Claude' : 'Codex';
    const labels: Record<string, string> = {
      queued: 'Build queued', in_progress: 'Build running', success: 'Candidate checks passed — review and publication still required',
      failure: 'Build failed', cancelled: 'Build cancelled', skipped: 'Build skipped',
      submission_unconfirmed: 'Build submission unconfirmed — check Build & Testing before retrying',
    };
    const label = `${who}: ${labels[value.state] ?? 'Build status needs checking'}`;
    return Number.isSafeInteger(value.runId) && value.runId > 0
      ? { label, url: `https://github.com/canericaextreme/CanX-Office/actions/runs/${value.runId}` }
      : { label };
  } catch { return null; }
}
