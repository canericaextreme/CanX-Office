import { describe, expect, it } from "vitest";
import {
  isSenderExcluded,
  ledgerDays,
  parseLedgerEntries,
  readDecisions,
  senderAddress,
  withDecision,
  withExcludedSender,
} from "./email-review";

const NOW = Date.parse("2026-11-01T03:00:00Z");
const ledger = JSON.stringify([
  { mailbox: "canerica14@gmail.com", messageId: "1a18f1a76b5eeb1a", from: "TELUS telusbilling@info.telus.com", subject: "Your TELUS home services e.Bill is ready", received: "2026-10-30T16:17:14-07:00", url: "https://mail.google.com/mail/u/?authuser=x#all/1a18f1a76b5eeb1a", outcome: "source-filed" },
  { mailbox: "canerica14@gmail.com", id: "1a17349b915ff397", from: "CIBC Banking mailbox.noreply@cibc.com", subject: "eStatement Alert", received: "2026-10-25T09:39:26-04:00", outcome: "source-filed" },
  { mailbox: "canericaextreme@gmail.com", messageId: "1a1905fdcee0a58d", from: "GitHub noreply@github.com", subject: "Token expiring", received: "2026-10-31T05:12:43Z", url: "javascript:alert(1)", outcome: { status: "source-filed" } },
]);

describe("Emails review card logic", () => {
  it("keeps only emails from the last 48 hours, newest first, and drops unsafe links", () => {
    const entries = parseLedgerEntries([ledger, ledger, "not json"], NOW);
    expect(entries.map((e) => e.messageId)).toEqual(["1a1905fdcee0a58d", "1a18f1a76b5eeb1a"]);
    expect(entries[0]!.url).toBe("");
    expect(entries[0]!.outcome).toBe("source-filed");
    expect(entries[1]!.sender).toBe("telusbilling@info.telus.com");
    expect(entries[1]!.url).toMatch(/^https:\/\/mail\.google\.com\//);
  });

  it("names the ledger days a 48-hour window touches", () => {
    expect(ledgerDays(NOW)).toEqual(["20261030", "20261031", "20261101"]);
  });

  it("reads a sender address from the From line", () => {
    expect(senderAddress("CIBC Banking <mailbox.noreply@cibc.com>")).toBe("mailbox.noreply@cibc.com");
    expect(senderAddress("No address here")).toBe("");
  });

  it("saves Accept and Ignore choices and reads them back", () => {
    const one = withDecision("", "abc123", "accept", "2026-11-01T03:00:00Z");
    const two = withDecision(one, "def456", "ignore", "2026-11-01T03:01:00Z");
    expect(readDecisions(two)).toEqual({ abc123: "accept", def456: "ignore" });
    expect(readDecisions("garbage")).toEqual({});
  });

  it("adds an ignored sender to the exclusion note once, never twice", () => {
    const rule = "STANDING OWNER RULE ... mailbox.noreply@cibc.com ...";
    expect(isSenderExcluded(rule, "mailbox.noreply@cibc.com")).toBe(true);
    expect(withExcludedSender(rule, "CIBC Banking mailbox.noreply@cibc.com", "2026-11-01")).toBeNull();
    const next = withExcludedSender(rule, "Mixbook <news@eml.mixbook.com>", "2026-11-01");
    expect(next).toContain(rule);
    expect(next).toContain("Also excluded: news@eml.mixbook.com");
    expect(withExcludedSender(rule, "no address", "2026-11-01")).toBeNull();
  });
});
