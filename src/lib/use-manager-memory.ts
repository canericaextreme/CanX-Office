/**
 * Shared Manager workbench memory for office rooms.
 *
 * Loads durable owner-scoped memory (tasks, approvals, change log, budget)
 * from the CanX-owned database. Fails closed: when the owner is not signed in
 * with two-step verification, or the shared database is unavailable, no
 * durable records are returned and callers keep their labelled sample view.
 */

import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { loadManagerMemory, type ManagerMemory } from "@/lib/manager-work.functions";

export interface ManagerMemoryState {
  /** Durable memory, or null when unavailable. */
  memory: ManagerMemory | null;
  loading: boolean;
  /** Plain-language reason durable memory is unavailable, if any. */
  error: string | null;
  /** True when the signed-in owner session is verified. */
  isOwner: boolean;
  accessToken: string | null;
  /** Reason to show when there is no owner session. */
  sessionMessage: string;
  refresh: () => void;
}

export function useManagerMemory(): ManagerMemoryState {
  const { state, accessToken, message } = useOwnerSession();
  const load = useServerFn(loadManagerMemory);
  const [memory, setMemory] = useState<ManagerMemory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const isOwner = state === "owner" && !!accessToken;

  useEffect(() => {
    if (!isOwner || !accessToken) {
      setMemory(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load({ data: { accessToken } })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setMemory(result);
          setError(null);
        } else {
          setMemory(null);
          setError(result.message);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMemory(null);
          setError("The shared workbench could not be reached.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, accessToken, load, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  return {
    memory,
    loading,
    error,
    isOwner,
    accessToken: accessToken ?? null,
    sessionMessage: message,
    refresh,
  };
}

export function formatCents(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "Not stated";
  return `C$${(cents / 100).toFixed(2)}`;
}
