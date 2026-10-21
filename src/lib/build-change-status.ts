/**
 * What a finished, passing Office build became on GitHub, read from the pull
 * request itself. 17 Oct: Elsie told John the Finance headings change was
 * "still waiting for review and release" although it was merged the day
 * before, because this line always said review was unverified.
 */
export function buildChangeStatus(pr: { number?: unknown; merged_at?: unknown; state?: unknown } | undefined, repo: string): string {
  const passed = " Candidate typecheck, tests and build passed.";
  if (!pr || !Number.isSafeInteger(pr.number)) return passed + " Review and deployment remain unverified.";
  const url = `https://github.com/${repo}/pull/${pr.number}`;
  if (typeof pr.merged_at === "string" && pr.merged_at) {
    return `${passed} Change #${pr.number} was merged into main on ${pr.merged_at.slice(0, 10)}; whether that version is published was not checked here: ${url}.`;
  }
  if (pr.state === "closed") return `${passed} Change #${pr.number} was closed without merging: ${url}.`;
  // 21 Oct: John heard "finished: success" and looked for the change in the
  // Office. A passing draft is only a candidate until it is merged and published.
  return `${passed} Review and deployment remain unverified. Draft change #${pr.number}: ${url}. It is not in the Office yet: it still needs a merge and a Publish.`;
}
