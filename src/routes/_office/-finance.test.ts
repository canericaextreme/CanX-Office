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

  it("gives every Finance section a clear, real heading", () => {
    // Overview and opened-section titles are <h2>; each card section is an <h3>.
    expect(source).toMatch(/<h2 className="bank-serif[^"]*">Finance overview<\/h2>/);
    expect(source).toMatch(/<h3 className="bank-serif[^"]*">\{children\}<\/h3>/);
    // The shared CardTitle renders a plain <div>, so Finance no longer uses it for section titles.
    expect(source).not.toContain("<CardTitle");
    for (const title of [
      "Income records",
      "Expense records",
      "Tax preparation records",
      "Receipt inbox: import and export",
      "Review before importing — {preview.fileName}",
      "Totals by currency",
      "Receipt records ({receipts.length})",
      "Reconciliation",
    ]) {
      expect(source).toContain(`<SectionTitle>${title}</SectionTitle>`);
    }
    // The monthly cost summary on the overview is a real <h3> too.
    expect(source).toContain('id="finance-monthly"');
    // The receipt list title no longer duplicates the opened "Receipts" section heading.
    expect(source).not.toContain("Receipts ({receipts.length})");
  });

  it("reuses the existing OwnerSignIn component rather than a second auth method", () => {
    expect(source).toContain('import { OwnerSignIn } from "@/components/office/OwnerSignIn"');
    expect(source).not.toContain("signInWithPassword");
  });
});
