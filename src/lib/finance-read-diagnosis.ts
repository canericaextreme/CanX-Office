/**
 * Classifies a failed Finance read into a safe, actionable reason.
 * Never echoes raw provider bodies, keys, tokens or record data.
 */
export type FinanceReadFailure =
  | "backend_not_configured"
  | "session_expired"
  | "access_denied"
  | "ingestion_setup_missing"
  | "table_missing"
  | "unexpected_response";

export function classifyFinanceRead(status: number | null, body: unknown): FinanceReadFailure {
  if (status === null) return "backend_not_configured";
  const code = body && typeof body === "object" ? String((body as { code?: unknown }).code ?? "") : "";
  if (code === "42703") return "ingestion_setup_missing";
  if (code === "42P01" || code === "PGRST205") return "table_missing";
  if (code === "42501") return "access_denied";
  if (code.startsWith("PGRST3") || status === 401) return "session_expired";
  if (status === 403) return "access_denied";
  return "unexpected_response";
}

export function financeReadMessage(reason: FinanceReadFailure): string {
  const tail = " Gmail was not contacted and nothing was filed.";
  switch (reason) {
    case "backend_not_configured":
      return `Finance records could not be read: the CanX database is not configured on the server (code backend_not_configured).${tail}`;
    case "session_expired":
      return `Finance records could not be read: your sign-in has expired. Sign in again with two-step verification and retry (code session_expired).${tail}`;
    case "access_denied":
      return `Finance records could not be read: the database refused access for this account (code access_denied).${tail}`;
    case "ingestion_setup_missing":
      return `Finance records could not be read: the email-receipt database setup (migration 0004) has not been applied to the CanX database (code ingestion_setup_missing).${tail}`;
    case "table_missing":
      return `Finance records could not be read: the Finance table was not found in the CanX database (code table_missing).${tail}`;
    default:
      return `Finance records could not be read: the database gave an unexpected response (code unexpected_response).${tail}`;
  }
}
