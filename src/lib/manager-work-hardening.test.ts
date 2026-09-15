import { describe, expect, it } from "vitest";

import {
  decideManagerApprovalWith,
  toJsonObject,
  type WorkbenchDeps,
} from "./manager-work.functions";

type Call = { method: string; path: string };

function deps(calls: Call[]): WorkbenchDeps {
  return {
    verifyOwner: async () =>
      ({ ok: true, userId: "owner-1", email: "owner@example.com", aal: "aal2" }) as never,
    reserve: async () => ({ allowed: true, reservationId: "r1" }) as never,
    settle: async () => undefined,
    rest: async <T>(_token: string, method: string, path: string) => {
      calls.push({ method, path });
      return { ok: true, data: [] as unknown as T };
    },
    ensureBudget: async () => ({ ok: true }),
  };
}

describe("approval decision validation", () => {
  it("rejects a malformed decision before any database call", async () => {
    const calls: Call[] = [];
    const result = await decideManagerApprovalWith(deps(calls), {
      accessToken: "t",
      approvalId: "a1",
      decision: "APPROVE!" as never,
    });
    expect(result).toEqual({
      ok: false,
      code: "invalid_input",
      message: "A decision must be exactly 'approved' or 'declined'.",
    });
    expect(calls).toHaveLength(0);
  });

  it("rejects a missing decision without writing anything", async () => {
    const calls: Call[] = [];
    const result = await decideManagerApprovalWith(deps(calls), {
      accessToken: "t",
      approvalId: "a1",
      decision: undefined as never,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid_input" });
    expect(calls.filter((call) => call.method !== "GET")).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("never coerces a malformed decision into declined", async () => {
    const calls: Call[] = [];
    await decideManagerApprovalWith(deps(calls), {
      accessToken: "t",
      approvalId: "a1",
      decision: "declined " as never,
    });
    expect(calls).toHaveLength(0);
  });
});

describe("toJsonObject", () => {
  it("keeps primitives inside nested arrays", () => {
    expect(toJsonObject({ tags: ["a", 2, true, null] })).toEqual({ tags: ["a", 2, true, null] });
  });

  it("keeps objects and nested arrays inside arrays", () => {
    expect(toJsonObject({ rows: [{ id: "x" }, ["y", 1]] })).toEqual({
      rows: [{ id: "x" }, ["y", 1]],
    });
  });

  it("drops undefined keys and replaces undefined array items with null", () => {
    expect(toJsonObject({ a: undefined, b: [undefined, "keep"] })).toEqual({ b: [null, "keep"] });
  });

  it("returns an empty object for non-objects", () => {
    expect(toJsonObject(undefined)).toEqual({});
    expect(toJsonObject("text")).toEqual({});
  });
});
