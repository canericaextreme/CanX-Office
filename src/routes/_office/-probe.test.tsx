// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Route } from "@/routes/_office/subscriptions";

describe("probe", () => {
  it("shape", () => {
    console.log("typeof Route:", typeof Route);
    console.log("keys:", Object.keys(Route as object).join(","));
    const opts = (Route as unknown as { options?: Record<string, unknown> }).options;
    console.log("typeof options:", typeof opts);
    console.log("option keys:", opts ? Object.keys(opts).join(",") : "(none)");
    console.log("typeof options.component:", typeof opts?.component);
    console.log("typeof Route.component:", typeof (Route as unknown as { component?: unknown }).component);
    expect(true).toBe(true);
  });
});
