/**
 * Plain-words reason for a failed Office build run (1 Nov 2026).
 * Before this, Elsie and the connector could only say "failure", so a stopped
 * builder looked like a stall. Reads the run's jobs list (Actions read access,
 * the same access the status check already uses). Pure: no network.
 */
const STEP_REASONS: Record<string, string> = {
  'Install locked dependencies': 'the builder could not install the Office packages (a GitHub or package problem, not the request).',
  'Prepare bounded job': 'the request text was refused before any work started (too short or too long).',
  'Install pinned Claude Code': 'the builder tool could not be installed (a GitHub or package problem, not the request).',
  'Implement requested change': 'the builder stopped before finishing the change, usually because it ran out of steps or its spending limit. Split the request into smaller screen changes.',
  'Reject protected changes before running candidate code': 'the change touched files builders are not allowed to change, so it was thrown away.',
  'Verify candidate': 'the change was made but the automatic typecheck, tests or build failed, so no draft was opened.',
  'Open draft change': 'the builder made no usable code change, so no draft was opened.',
};

interface Step { name?: unknown; conclusion?: unknown }
interface Job { conclusion?: unknown; steps?: unknown }

/** " Stopped at: … — reason" for the first failed step, or "" when unknown. */
export function buildFailureReason(jobsBody: unknown): string {
  const jobs = (jobsBody as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs)) return '';
  for (const job of jobs as Job[]) {
    if (!Array.isArray(job?.steps)) continue;
    const step = (job.steps as Step[]).find(s => s?.conclusion === 'failure');
    if (!step || typeof step.name !== 'string') continue;
    const name = step.name.slice(0, 80);
    const reason = STEP_REASONS[name];
    return reason ? ` Stopped at "${name}": ${reason}` : ` Stopped at "${name}".`;
  }
  return '';
}
