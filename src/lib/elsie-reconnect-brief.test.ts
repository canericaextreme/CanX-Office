import { describe, it, expect } from "vitest";
import {
  elsieReconnectBrief,
  readElsieReconnectBrief,
} from "./elsie-reconnect-brief";
describe("Elsie reconnect recovery", () => {
  it("returns recent turns and unfinished tasks with truthful status", () => {
    const s = elsieReconnectBrief(
      [
        {
          role: "assistant",
          content: "Working on analytics",
          created_at: "2026-10-17T00:02Z",
        },
        {
          role: "user",
          content: "Please remember charts",
          created_at: "2026-10-17T00:01Z",
        },
      ],
      [
        {
          id: "1",
          title: "Analytics dashboard",
          detail: "Finish live measures",
          status: "in_progress",
          worker: "codex",
          updated_at: "2026-10-17T00:03Z",
        },
      ],
      "2026-10-17T00:04Z",
    );
    expect(s.indexOf("Please remember charts")).toBeLessThan(
      s.indexOf("Working on analytics"),
    );
    expect(s).toContain("Analytics dashboard");
    expect(s).toContain("not a live builder run");
  });
  it("never invents missing history", () => {
    const s = elsieReconnectBrief([], [], "2026-10-17T00:04Z");
    expect(s).toContain("No recent saved conversation");
    expect(s).toContain("No readable unfinished tasks");
  });
  it("excludes done tasks", () => {
    const s = elsieReconnectBrief(
      [],
      [
        {
          id: "2",
          title: "Finished",
          detail: "",
          worker: "claude",
          status: "done",
          updated_at: "2026-10-17",
        },
      ],
      "2026-10-17",
    );
    expect(s).not.toContain("Finished");
  });
  it("keeps waiting tasks and their blocker visible", () => {
    const s = elsieReconnectBrief(
      [],
      [
        {
          id: "3",
          title: "Awaiting owner review",
          detail: "Review candidate",
          worker: "Codex",
          status: "waiting",
          waiting_reason: "Owner acceptance needed",
          updated_at: "2026-10-17",
        },
      ],
      "2026-10-17",
    );
    expect(s).toContain("Awaiting owner review");
    expect(s).toContain("Owner acceptance needed");
  });
  it.each(["turns", "tasks"])(
    "preserves the other source when %s cannot be read",
    async (failed) => {
      const s = await readElsieReconnectBrief(
        async (path) =>
          path.startsWith("astra_recent_context")
            ? {
                ok: failed !== "turns",
                body: [
                  {
                    role: "user",
                    content: "Remember the report",
                    created_at: "2026-10-17",
                  },
                ],
              }
            : {
                ok: failed !== "tasks",
                body: [
                  {
                    id: "3",
                    title: "Review report",
                    detail: "",
                    worker: "Elsie",
                    status: "waiting",
                    updated_at: "2026-10-17",
                  },
                ],
              },
        "00000000-0000-4000-8000-000000000001",
        "2026-10-17",
      );
      expect(s).toContain(
        failed === "turns" ? "Review report" : "Remember the report",
      );
      expect(s).toContain(
        failed === "turns"
          ? "Recent conversation could not be read"
          : "Unfinished tasks could not be read",
      );
      expect(s).not.toContain(
        failed === "turns"
          ? "No recent saved conversation"
          : "No readable unfinished tasks",
      );
    },
  );
});

describe("Elsie resumes an interrupted build safely", () => {
  const receipt = JSON.stringify({
    kind: "office-task-v2",
    builder: "claude",
    attempt: "a1",
    state: "queued",
    prior: "",
    runId: 38851382385,
  });
  const relayed =
    receipt +
    " [colleague-relay 6bca6abf-dfaf-478c-ae6a-ec94560c66ef claimed chatgpt 2026-10-16T05:00:49.349Z]";
  const tasks = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      title: "Newer idea",
      detail: "",
      status: "open",
      worker: "",
      updated_at: "2026-10-17T02:00Z",
      evidence: "",
    },
    {
      id: "b4ed13d8-947d-a59c-880d-f83f9befba36",
      title: "Tidy Finance headings",
      detail: "",
      status: "in_progress",
      worker: "",
      updated_at: "2026-10-16T05:00Z",
      evidence: relayed,
    },
  ];
  it("names the task id and the saved receipt, even after a relay note was appended", () => {
    const s = elsieReconnectBrief([], tasks, "2026-10-17T03:00Z");
    expect(s).toContain("task b4ed13d8-947d-a59c-880d-f83f9befba36");
    expect(s).toContain(
      "build receipt: Claude, run 38851382385, saved state queued",
    );
    expect(s.indexOf("Tidy Finance headings")).toBeLessThan(
      s.indexOf("Newer idea"),
    );
    expect(s).toContain("call check_task_execution with its task id");
    expect(s).toContain("never call execute_task");
  });
  it("tells Elsie never to resubmit an unconfirmed submission", () => {
    const s = elsieReconnectBrief(
      [],
      [
        {
          ...tasks[1]!,
          evidence: JSON.stringify({
            kind: "office-task-v2",
            builder: "codex",
            attempt: "a2",
            state: "submission_unconfirmed",
            prior: "",
          }),
        },
      ],
      "x",
    );
    expect(s).toContain(
      "Codex, no run link, saved state submission_unconfirmed (submission unconfirmed: check Build & Testing; never resubmit)",
    );
  });
});
