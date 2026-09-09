/**
 * Browser client for the CanX-owned Supabase project.
 *
 * The browser is never given a secret. It receives only the project URL and
 * the publishable key, and it receives them from this app's own server rather
 * than from a build-time variable, because Lovable reserves the VITE_ prefix
 * for its own managed values. Every protected action is still re-verified on
 * the server, so this configuration being public changes nothing about access.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getBrowserBackendConfig } from "@/lib/auth.functions";

let client: SupabaseClient | null = null;
let pending: Promise<SupabaseClient | null> | null = null;

/** Null while no CanX-owned project is configured on the server. */
export async function loadCanxSupabase(): Promise<SupabaseClient | null> {
  if (client) return client;
  if (!pending) {
    pending = (async () => {
      try {
        const config = await getBrowserBackendConfig();
        if (!config) return null;
        client = createClient(config.url, config.publishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, storageKey: "canx-office-auth" },
        });
        return client;
      } catch {
        return null;
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
}

/** The already-loaded client, if any. Never triggers a fetch. */
export function currentCanxSupabase(): SupabaseClient | null {
  return client;
}
