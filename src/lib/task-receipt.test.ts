import { describe, it, expect } from "vitest";
import { readBuildReceipt, splitLeadingJson } from "./task-receipt";
import { readExecution } from "./task-execution.server";

const receipt = JSON.stringify({ kind: "office-task-v2", builder: "claude", attempt: "a1", state: "queued", prior: "[elsie-queue claude 2026-10-16T03:57:50.821Z]\n{not json}", runId: 38851382385 });
const tail = " [colleague-relay 6bca6abf-dfaf-478c-ae6a-ec94560c66ef claimed chatgpt 2026-10-16T05:00:49.349Z] Relay receipt 6bca6abf: OpenAI response {x}";

describe("build receipts survive appended relay notes", () => {
  it("splits the leading receipt from the appended notes", () => {
    expect(splitLeadingJson(receipt + tail)).toEqual({ json: receipt, tail });
    expect(splitLeadingJson("plain note")).toEqual({ json: null, tail: "plain note" });
    expect(splitLeadingJson('{"open": "never closed"').json).toBeNull();
  });
  it("reads the real builder, state and run id (live task b4ed13d8 shape)", () => {
    expect(readBuildReceipt(receipt + tail)).toEqual({ builder: "claude", state: "queued", runId: 38851382385, attempt: "a1" });
    expect(readExecution(receipt + tail)?.runId).toBe(38851382385);
    expect(readExecution(receipt + tail)?.builder).toBe("claude");
  });
  it("still ignores evidence without a receipt", () => {
    expect(readBuildReceipt("")).toBeNull();
    expect(readBuildReceipt('{"kind":"something-else"}')).toBeNull();
    expect(readExecution("ChatGPT Office writing (OpenAI API); no build")).toBeNull();
  });
});
