import { describe, expect, it } from "vitest";
import { taskExecutionEvidence } from "./task-execution-evidence";

const receipt = {
  kind: "office-task-v2",
  builder: "claude",
  state: "success",
  runId: 38851382385,
  attempt: "fixture",
  prior: 'Earlier notes with {braces} and "quotes"',
};

describe("Work Board build receipt display", () => {
  it("keeps the build link and read-only receipt guard after notes are appended", () => {
    // Shape reproduced from an owner-scoped waiting task. No private note text.
    const evidence =
      JSON.stringify(receipt) + "\n[colleague-relay fixture] Reviewer notes {data only}";
    expect(taskExecutionEvidence(evidence)).toEqual({
      label: "Claude: Candidate checks passed — review and publication still required",
      url: "https://github.com/canericaextreme/CanX-Office/actions/runs/38851382385",
    });
  });
  it("retains legacy Codex identity and unconfirmed-submission caution without inventing a link", () => {
    expect(
      taskExecutionEvidence(
        JSON.stringify({ kind: "codex-task-v1", state: "submission_unconfirmed" }) + "\nLater note",
      ),
    ).toEqual({
      label: "Codex: Build submission unconfirmed — check Build & Testing before retrying",
    });
  });
  it("does not mistake JSON in a note or an unknown builder for a build receipt", () => {
    expect(taskExecutionEvidence("Note first: " + JSON.stringify(receipt))).toBeNull();
    expect(taskExecutionEvidence(JSON.stringify({ ...receipt, builder: "unknown" }))).toBeNull();
    expect(taskExecutionEvidence('{"kind":"office-task-v2"')).toBeNull();
  });
  it("never exposes a link from an invalid run id or a URL supplied in appended text", () => {
    for (const runId of [-1, 0, 1.5, "42", Number.MAX_SAFE_INTEGER + 1]) {
      const display = taskExecutionEvidence(
        JSON.stringify({ ...receipt, runId }) + " https://example.invalid/fake-run",
      );
      expect(display?.label).toMatch(/^Claude:/);
      expect(display?.url).toBeUndefined();
    }
  });
});
