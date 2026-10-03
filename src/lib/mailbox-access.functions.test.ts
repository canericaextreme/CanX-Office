import { describe, expect, it, vi } from "vitest";
import { checkMailboxAccessWith } from "./mailbox-access.functions";
import { checkGmailProfile } from "./gmail-receipts.server";

const s = { lovableApiKey: "lk", connectionApiKey: "ck-secret" };
const owner = async () => ({ ok: true as const, userId: "u", email: "o@x", aal: "aal2" });

describe("mailbox access check", () => {
  it("denies non-owners without touching Gmail", async () => {
    const check = vi.fn();
    const r = await checkMailboxAccessWith({ verifyOwner: async () => ({ ok: false, reason: "no_session", message: "Sign in" } as never), gmailAccounts: () => [s], check }, "t");
    expect(r.ok).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
  it("returns nothing when no mailbox is linked", async () => {
    const r = await checkMailboxAccessWith({ verifyOwner: owner, gmailAccounts: () => [], check: vi.fn() }, "t");
    expect(r).toMatchObject({ ok: true, accounts: [] });
  });
  it("returns only address/status and never credentials", async () => {
    const r = await checkMailboxAccessWith({ verifyOwner: owner, gmailAccounts: () => [s, s], check: async (_x, slot) => slot === 1 ? { slot, email: "a@gmail.com", status: "verified" } : { slot, email: "leak@x", status: "authorization_required" } }, "t");
    expect(JSON.stringify(r)).not.toContain("ck-secret");
    expect(r.ok && r.accounts).toEqual([{ slot: 1, email: "a@gmail.com", status: "verified" }, { slot: 2, email: null, status: "authorization_required" }]);
  });
  it("profile check maps statuses and reads only the profile endpoint", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ emailAddress: "a@gmail.com", messagesTotal: 5 }), { status: 200 }));
    expect(await checkGmailProfile(s, 1, f as never)).toEqual({ slot: 1, email: "a@gmail.com", status: "verified" });
    expect(String((f.mock.calls[0] as unknown[])[0])).toMatch(/\/users\/me\/profile$/);
    expect((await checkGmailProfile(s, 1, (async () => new Response("", { status: 403 })) as never)).status).toBe("authorization_required");
    expect((await checkGmailProfile(s, 1, (async () => { throw new Error("x"); }) as never)).status).toBe("unavailable");
  });
});
