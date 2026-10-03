import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "./canx-backend.server";
import type { GmailSettings, MailboxAccessCheck } from "./gmail-receipts.server";

export type MailboxAccessResult =
  | { ok: true; checkedAt: string; accounts: MailboxAccessCheck[] }
  | { ok: false; message: string };

export interface MailboxAccessDeps {
  verifyOwner: (token: string) => Promise<OwnerVerification>;
  gmailAccounts: () => GmailSettings[];
  check: (settings: GmailSettings, slot: number) => Promise<MailboxAccessCheck>;
}

export async function checkMailboxAccessWith(deps: MailboxAccessDeps, accessToken: string): Promise<MailboxAccessResult> {
  const owner = await deps.verifyOwner(accessToken);
  if (!owner.ok) return { ok: false, message: owner.message };
  const accounts = deps.gmailAccounts();
  const checks = await Promise.all(accounts.map((account, index) => deps.check(account, index + 1)));
  // Only address + status leave the server.
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    accounts: checks.map(({ slot, email, status }) => ({ slot, email: status === "verified" ? email : null, status })),
  };
}

export const checkMailboxAccess = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => {
    const token = (data as { accessToken?: unknown })?.accessToken;
    if (typeof token !== "string" || token.length > 8192) throw new Error("invalid_request");
    return { accessToken: token };
  })
  .handler(async ({ data }) => {
    const backend = await import("./canx-backend.server");
    const gmail = await import("./gmail-receipts.server");
    return checkMailboxAccessWith(
      { verifyOwner: backend.verifyOwner, gmailAccounts: gmail.readGmailAccounts, check: (s, slot) => gmail.checkGmailProfile(s, slot) },
      data.accessToken,
    );
  });
