import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TaskQueueReview } from "../components/office/TaskQueueReview";
import { isFinishedTask, reviewTaskQueue, QUEUE_STALE_MS } from "./task-queue-maintenance";

const now = Date.parse("2026-10-17T12:00:00Z");
const task = (id: string, status = "open", project = "") => ({ id, status, project, updated_at: "2026-09-01T00:00:00Z" });

describe("queue maintenance review", () => {
  it("separates only saved terminal states and never mutates task records", () => {
    const tasks = [task("a", "done"), task("b", "cancelled"), task("c", "in_progress"), task("d", "waiting"), task("e", "unknown")];
    const original = structuredClone(tasks);
    expect(tasks.filter(isFinishedTask).map(t => t.id)).toEqual(["a", "b"]);
    expect(reviewTaskQueue(tasks, now)).toMatchObject({ done: 1, cancelled: 1, active: 3, staleIds: ["c", "d", "e"], missingProjectIds: ["a", "b", "c", "d", "e"] });
    expect(tasks).toEqual(original);
  });
  it("flags missing labels without inventing a project and treats bad dates as unknown", () => {
    expect(reviewTaskQueue([
      { ...task("blank", "open", "  "), updated_at: "invalid" },
      { ...task("future", "open", "real-project-id"), updated_at: "2099-01-01" },
      { ...task("boundary"), updated_at: new Date(now - QUEUE_STALE_MS).toISOString() },
    ], now)).toMatchObject({ staleIds: [], unknownDateIds: ["blank"], missingProjectIds: ["blank", "boundary"] });
  });
  it("handles an empty loaded list", () => {
    expect(reviewTaskQueue([], now)).toEqual({ done: 0, cancelled: 0, active: 0, staleIds: [], missingProjectIds: [], unknownDateIds: [] });
  });
  it("renders populated report and discloses blocked recurrence and no writes", () => {
    const html = renderToStaticMarkup(createElement(TaskQueueReview, { tasks: [task("a", "done"), task("b")] }));
    expect(html).toContain("1 unfinished; 1 completed; 0 cancelled");
    expect(html).toContain("No saved records changed");
    expect(html).toContain("no daily or weekly background job is configured");
    expect(html).toContain("2 saved tasks have no project");
  });
});
