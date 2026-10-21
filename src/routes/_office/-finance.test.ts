import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "finance.tsx"), "utf8");

describe("Finance owner sign-in gate", () => {
  it("keeps private content gated and opens the existing Account flow", () => {
    expect(source).toContain('owner.state !== "owner"');
    expect(source).toContain("Private receipts remain locked.");
    expect(source).toContain("onClick={openOfficeAccount}");
    // The gate returns before the receipt dashboard, totals, or reconciliation render.
    const gateIndex = source.indexOf('owner.state !== "owner"');
    const receiptImportIndex = source.indexOf("Receipt inbox");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(receiptImportIndex).toBeGreaterThan(gateIndex);
    expect(source.slice(0, receiptImportIndex)).toContain("return (");
  });

  it("gives every Finance section a clear, real heading", () => {
    // Overview and opened-section titles are <h2>; each card section is an <h3>.
    expect(source).toContain('<h2 className="text-xl font-semibold">Finance overview</h2>');
    expect(source).toContain('<h3 className="text-base font-semibold leading-none tracking-tight">{children}</h3>');
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
    // The receipt list title no longer duplicates the opened "Receipts" section heading.
    expect(source).not.toContain("Receipts ({receipts.length})");
  });

  it("reuses the Account entry rather than a second auth method", () => {
    expect(source).toContain('import { openOfficeAccount } from "@/lib/office-account-dialog"');
    expect(source).not.toContain("signInWithPassword");
  });
});
