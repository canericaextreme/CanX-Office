import { describe, expect, it } from "vitest";
import { cleanSubscriptionList, cleanWebsiteUrl } from "./subscriptions";
import { sameContent } from "./finance-doc-cas.server";

const LOVABLE = "https://lovable.dev/projects/52572715-7d7c-4c7a-85cb-96664ada3394?tab=settings&view=preview";

describe("website URL cleaning", () => {
  it("keeps a long Lovable project URL intact", () => {
    expect(cleanWebsiteUrl(LOVABLE)).toBe(LOVABLE);
  });
  it("repairs an accidentally duplicated scheme", () => {
    expect(cleanWebsiteUrl("http://https://lovable.dev/projects/abc")).toBe("https://lovable.dev/projects/abc");
    expect(cleanWebsiteUrl("https://https://lovable.dev")).toBe("https://lovable.dev/");
  });
  it("rejects broken hosts, spaces and non-web schemes instead of saving a dead link", () => {
    for (const bad of ["https//lovable.dev", "https://https", "lovable.dev/x", "https:// lovable.dev", "javascript:alert(1)", "ftp://x.com", `https://a.com/${"x".repeat(2100)}`]) {
      expect(cleanWebsiteUrl(bad)).toBeUndefined();
    }
  });
});

describe("save readback with optional fields", () => {
  it("verifies a stored list after jsonb drops undefined keys", () => {
    const list = cleanSubscriptionList([
      { id: "s-gh", name: "GitHub", websiteUrl: "https://github.com/" },
      { id: "s-lov", name: "Lovable", websiteUrl: LOVABLE },
      { id: "s-sb", name: "Supabase" },
    ])!;
    const stored = JSON.parse(JSON.stringify(list));
    expect(sameContent(stored, list)).toBe(true);
    const reread = cleanSubscriptionList(stored)!;
    expect(reread.find((s) => s.id === "s-lov")?.websiteUrl).toBe(LOVABLE);
    expect(reread.find((s) => s.id === "s-gh")?.websiteUrl).toBe("https://github.com/");
    expect(reread.find((s) => s.id === "s-sb")?.websiteUrl).toBeUndefined();
  });
});
