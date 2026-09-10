import { describe, expect, it } from "vitest";
import { textFromAttachment } from "./gmail-receipts.server";
import { MAX_ATTACHMENT_BYTES } from "./receipt-ingestion";

describe("Gmail attachment handling", () => {
  it("reads bounded MIME text attachments", async () => {
    const bytes = new TextEncoder().encode("Vendor: Test\nTotal: CAD 12.00");
    await expect(textFromAttachment(bytes, "text/plain")).resolves.toContain("Vendor: Test");
  });

  it("recognizes images without pretending OCR succeeded", async () => {
    await expect(textFromAttachment(new Uint8Array([1, 2, 3]), "image/png")).resolves.toBe("");
  });

  it("rejects oversized attachments before parsing", async () => {
    await expect(textFromAttachment(new Uint8Array(MAX_ATTACHMENT_BYTES + 1), "application/pdf")).rejects.toThrow(
      "attachment_too_large",
    );
  });
});