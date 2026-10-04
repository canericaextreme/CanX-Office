// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Route } from "@/routes/_office/subscriptions";

const Page = Route.options.component as unknown as () => unknown;

describe("probe3", () => {
  it("inspects component", () => {
    console.log("NAME:", Page.name);
    console.log("SRC:", Page.toString().slice(0, 500));
    try {
      const out = (Page as () => unknown)();
      console.log("RESULT TYPE:", typeof out, out === null ? "(null)" : "");
      console.log("RESULT:", JSON.stringify(out)?.slice(0, 300));
    } catch (e) {
      console.log("CALL THREW:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
    expect(true).toBe(true);
  });
});
