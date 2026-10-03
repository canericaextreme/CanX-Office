import { afterEach, describe, expect, it, vi } from "vitest";
import { readGmailAccounts, textFromAttachment } from "./gmail-receipts.server";
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

describe("linked Gmail accounts", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns no accounts when nothing is linked", () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("GOOGLE_MAIL_API_KEY", "");
    expect(readGmailAccounts()).toEqual([]);
  });

  it("returns one account per linked connection key, in order", () => {
    vi.stubEnv("LOVABLE_API_KEY", "lov");
    vi.stubEnv("GOOGLE_MAIL_API_KEY", "first");
    vi.stubEnv("GOOGLE_MAIL_API_KEY_1", "second");
    const accounts = readGmailAccounts();
    expect(accounts).toHaveLength(2);
    expect(accounts[0]?.connectionApiKey).toBe("first");
    expect(accounts[1]?.connectionApiKey).toBe("second");
  });

  it("never invents accounts for keys that do not exist", () => {
    vi.stubEnv("LOVABLE_API_KEY", "lov");
    vi.stubEnv("GOOGLE_MAIL_API_KEY", "first");
    vi.stubEnv("GOOGLE_MAIL_API_KEY_1", "");
    vi.stubEnv("GOOGLE_MAIL_API_KEY_2", "");
    expect(readGmailAccounts()).toHaveLength(1);
  });
});