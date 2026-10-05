import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

describe("sha256Hex", () => {
  it.each(["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "Reçu Lovable — C$326.99 🧾", "x".repeat(10_000)])(
    "matches node:crypto exactly for %#",
    (s) => expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex")),
  );

  it("keeps browser-shared receipt parsing free of node:crypto (startup crash regression)", () => {
    expect(readFileSync("src/lib/receipt-ingestion.ts", "utf8")).not.toMatch(/node:crypto|from ["']crypto["']/);
  });
});
