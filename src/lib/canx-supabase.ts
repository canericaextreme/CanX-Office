/**
 * Browser client for the CanX-owned Supabase project.
 *
 * Returns null while the project is not configured. No key here is a secret:
 * only the publishable key is ever exposed, and every protected action is
 * re-verified on the server.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_CANX_SUPABASE_URL"] as string | undefined;
const key = import.meta.env["VITE_CANX_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

export const canxBackendConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

export function getCanxSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "canx-office-auth" },
    });
  }
  return client;
}
