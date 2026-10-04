// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Route } from "@/routes/_office/subscriptions";

const Page = Route.options.component as () => React.ReactElement;

describe("probe2", () => {
  it("renders", () => {
    let err: unknown = null;
    try {
      const { container } = render(<Page />);
      console.log("HTML:", container.innerHTML.slice(0, 400));
    } catch (e) {
      err = e;
      console.log("THROWN:", e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e));
    }
    expect(true).toBe(true);
  });
});
