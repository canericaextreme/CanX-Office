import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "finance.tsx"), "utf8");

describe("Finance owner sign-in gate", () => {
  it("renders OwnerSignIn and nothing else before the owner is verified", () => {
    expect(source).toContain('owner.state !== "owner"');
    expect(source).toContain("Sign in to Finance");
    expect(source).toContain("<OwnerSignIn />");
    // The gate returns before the receipt dashboard, totals, or reconciliation render.
    const gateIndex = source.indexOf('owner.state !== "owner"');
    const receiptImportIndex = source.indexOf("Receipt inbox");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(receiptImportIndex).toBeGreaterThan(gateIndex);
    expect(source.slice(0, receiptImportIndex)).toContain("return (");
  });

  it("reuses the existing OwnerSignIn component rather than a second auth method", () => {
    expect(source).toContain('import { OwnerSignIn } from "@/components/office/OwnerSignIn"');
    expect(source).not.toContain("signInWithPassword");
  });
});
