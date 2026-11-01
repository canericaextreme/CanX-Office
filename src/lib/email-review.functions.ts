import { createServerFn } from "@tanstack/react-start";
import {
  DECISIONS_NOTE_ID,
  EXCLUSIONS_NOTE_ID,
  ledgerDays,
  parseLedgerEntries,
  readDecisions,
  isSenderExcluded,
  withDecision,
  withExcludedSender,
  type EmailDecision,
  type EmailReviewEntry,
} from "./email-review";

export type EmailReviewReply =
  | { ok: true; entries: Array<EmailReviewEntry & { decision: EmailDecision | null; excluded: boolean }>; checkedAt: string }
  | { ok: false; message: string };

export type EmailDecisionReply = { ok: true; detail: string } | { ok: false; message: string };

const tokenOf = (input: unknown) => {
  const raw = input as { accessToken?: unknown } | undefined;
  return typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "";
};

async function ownerContext(accessToken: string) {
  const backend = await import("./canx-backend.server");
  const config = backend.readBackendConfig();
  if (!config) return { ok: false as const, message: backend.DENY_MESSAGES.backend_not_configured };
  const verified = await backend.verifyOwner(accessToken);
  if (!verified.ok) return { ok: false as const, message: verified.message };
  const rest = (path: string, init?: RequestInit) => backend.restRequest(config, accessToken, path, init);
  return { ok: true as const, userId: verified.userId, rest };
}

type NoteRow = { id?: unknown; detail?: unknown; title?: unknown };
const rows = (body: unknown) => (Array.isArray(body) ? (body as NoteRow[]) : []);

/** Read-only: the last 48 hours of swept emails, with John's saved choices. */
export const readEmailReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ({ accessToken: tokenOf(input) }))
  .handler(async ({ data }): Promise<EmailReviewReply> => {
    const ctx = await ownerContext(data.accessToken);
    if (!ctx.ok) return ctx;
    const now = Date.now();
    const days = ledgerDays(now);
    const or = days.map((d) => `id.like.email-ledger-${d}-*`).join(",");
    const [ledgers, extra] = await Promise.all([
      ctx.rest(`office_notes?select=id,detail&owner_id=eq.${ctx.userId}&or=(${encodeURIComponent(or)})&limit=120`),
      ctx.rest(`office_notes?select=id,detail&owner_id=eq.${ctx.userId}&id=in.(${DECISIONS_NOTE_ID},${EXCLUSIONS_NOTE_ID})`),
    ]);
    if (!ledgers.ok || !extra.ok) return { ok: false, message: "The saved email sweep could not be read just now. Nothing was changed." };
    const byId = new Map(rows(extra.body).map((r) => [String(r.id ?? ""), String(r.detail ?? "")]));
    const decisions = readDecisions(byId.get(DECISIONS_NOTE_ID));
    const exclusions = byId.get(EXCLUSIONS_NOTE_ID) ?? "";
    const entries = parseLedgerEntries(rows(ledgers.body).map((r) => String(r.detail ?? "")), now).map((e) => ({
      ...e,
      decision: decisions[e.messageId] ?? null,
      excluded: isSenderExcluded(exclusions, e.sender),
    }));
    return { ok: true, entries, checkedAt: new Date(now).toISOString() };
  });

async function upsertNote(
  rest: (path: string, init?: RequestInit) => Promise<{ ok: boolean; body: unknown }>,
  userId: string,
  id: string,
  title: string,
  detail: string,
) {
  const saved = await rest("office_notes?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ id, owner_id: userId, kind: "decision", title, detail, provenance: "john", source: "John" }]),
  });
  if (!saved.ok) return false;
  const back = await rest(`office_notes?select=detail&owner_id=eq.${userId}&id=eq.${encodeURIComponent(id)}`);
  return back.ok && rows(back.body)[0]?.detail === detail;
}

/** Saves Accept or Ignore for one swept email. Ignore also adds the sender to the sweep's exclusion note. Gmail is never touched. */
export const decideEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = (input ?? {}) as { messageId?: unknown; sender?: unknown; decision?: unknown };
    return {
      accessToken: tokenOf(input),
      messageId: typeof raw.messageId === "string" ? raw.messageId.slice(0, 80).trim() : "",
      sender: typeof raw.sender === "string" ? raw.sender.slice(0, 200) : "",
      decision: (raw.decision === "ignore" ? "ignore" : "accept") as EmailDecision,
    };
  })
  .handler(async ({ data }): Promise<EmailDecisionReply> => {
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(data.messageId)) return { ok: false, message: "That email could not be identified. Nothing was changed." };
    const ctx = await ownerContext(data.accessToken);
    if (!ctx.ok) return ctx;
    const current = await ctx.rest(`office_notes?select=id,detail&owner_id=eq.${ctx.userId}&id=in.(${DECISIONS_NOTE_ID},${EXCLUSIONS_NOTE_ID})`);
    if (!current.ok) return { ok: false, message: "Your earlier choices could not be read, so nothing was saved." };
    const byId = new Map(rows(current.body).map((r) => [String(r.id ?? ""), String(r.detail ?? "")]));
    const at = new Date().toISOString();

    if (data.decision === "ignore") {
      const next = withExcludedSender(byId.get(EXCLUSIONS_NOTE_ID), data.sender, at.slice(0, 10));
      if (next) {
        const ok = await upsertNote(ctx.rest, ctx.userId, EXCLUSIONS_NOTE_ID, "Email sweep: senders John excluded (read before every sweep)", next);
        if (!ok) return { ok: false, message: "The sender could not be added to the sweep's ignore list. Nothing else was changed." };
      }
    }
    const ok = await upsertNote(ctx.rest, ctx.userId, DECISIONS_NOTE_ID, "Emails card: John's Accept and Ignore choices", withDecision(byId.get(DECISIONS_NOTE_ID), data.messageId, data.decision, at));
    if (!ok) return { ok: false, message: "Your choice could not be saved. Please try again." };
    return {
      ok: true,
      detail: data.decision === "ignore" ? "Ignored. Future sweeps will leave this sender out. The email is still in Gmail." : "Accepted. It stays in the Office.",
    };
  });
