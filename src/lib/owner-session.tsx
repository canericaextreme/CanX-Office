"use client";

/**
 * Owner sign-in state for the CanX-owned database.
 *
 * The browser only ever holds a session. Whether that session counts as "the
 * owner" is decided on the server, every time, and this file simply reports
 * the server's answer. Nothing here grants a role.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { currentCanxSupabase, loadCanxSupabase } from "@/lib/canx-supabase";
import { verifyOwnerSession, type SessionResult } from "@/lib/auth.functions";

export type OwnerState =
  | "checking"
  | "backend_missing"
  | "signed_out"
  | "mfa_required"
  | "not_owner"
  | "error"
  | "owner";

export interface OwnerSession {
  state: OwnerState;
  configured: boolean;
  email: string | null;
  message: string;
  accessToken: string | null;
  /** True when shared saving to the CanX account is permitted. */
  shared: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  submitMfaCode: (code: string) => Promise<string | null>;
  enrolTotp: () => Promise<{ qr: string; secret: string; factorId: string } | string>;
  confirmEnrolment: (factorId: string, code: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<OwnerSession | null>(null);

const STATE_FROM_REASON: Record<string, OwnerState> = {
  backend_not_configured: "backend_missing",
  no_session: "signed_out",
  invalid_session: "signed_out",
  expired_session: "signed_out",
  mfa_required: "mfa_required",
  not_owner: "not_owner",
  backend_error: "error",
};

const DEVICE_ONLY = "No CanX-owned database is connected, so the office is saving on this device only.";

export function OwnerSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OwnerState>("checking");
  const [configured, setConfigured] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("Checking your sign-in…");
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const applyResult = useCallback((token: string | null, result: SessionResult) => {
    setAccessToken(token);
    if (result.ok) {
      setState("owner");
      setEmail(result.email);
      setMessage(result.message);
      return;
    }
    setState(STATE_FROM_REASON[result.reason ?? "no_session"] ?? "signed_out");
    setMessage(result.message);
  }, []);

  const refresh = useCallback(async () => {
    const supabase = await loadCanxSupabase();
    if (!supabase) {
      setConfigured(false);
      setState("backend_missing");
      setAccessToken(null);
      setMessage(DEVICE_ONLY);
      return;
    }
    setConfigured(true);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    try {
      const result = await verifyOwnerSession({ data: { accessToken: token ?? "" } });
      applyResult(token, result);
    } catch {
      setState("error");
      setMessage("The office could not check your sign-in.");
    }
  }, [applyResult]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      await refresh();
      const supabase = currentCanxSupabase();
      if (!supabase) return;
      const { data } = supabase.auth.onAuthStateChange((event: string) => {
        if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "MFA_CHALLENGE_VERIFIED" || event === "USER_UPDATED") {
          void refresh();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    })();
    return () => unsubscribe?.();
  }, [refresh]);

  const signIn = useCallback(
    async (userEmail: string, password: string) => {
      const supabase = getCanxSupabase();
      if (!supabase) return "No CanX-owned database is connected yet.";
      const { error } = await supabase.auth.signInWithPassword({ email: userEmail, password });
      if (error) return "That email and password were not accepted.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const submitMfaCode = useCallback(
    async (code: string) => {
      const supabase = getCanxSupabase();
      if (!supabase) return "No CanX-owned database is connected yet.";
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) return "The second step could not be started.";
      const factor = factors?.totp?.[0];
      if (!factor) return "No authenticator app is set up on this account yet.";
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) return "That code was not accepted.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const enrolTotp = useCallback(async () => {
    const supabase = getCanxSupabase();
    if (!supabase) return "No CanX-owned database is connected yet.";
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) return "The authenticator app could not be set up.";
    return { qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id };
  }, []);

  const confirmEnrolment = useCallback(
    async (factorId: string, code: string) => {
      const supabase = getCanxSupabase();
      if (!supabase) return "No CanX-owned database is connected yet.";
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) return "That code was not accepted.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    const supabase = getCanxSupabase();
    if (supabase) await supabase.auth.signOut();
    setAccessToken(null);
    setEmail(null);
    setState(canxBackendConfigured ? "signed_out" : "backend_missing");
    setMessage("Signed out. The office is back to saving on this device only.");
  }, []);

  const value = useMemo<OwnerSession>(
    () => ({
      state,
      configured: canxBackendConfigured,
      email,
      message,
      accessToken,
      shared: state === "owner" && Boolean(accessToken),
      signIn,
      submitMfaCode,
      enrolTotp,
      confirmEnrolment,
      signOut,
      refresh,
    }),
    [state, email, message, accessToken, signIn, submitMfaCode, enrolTotp, confirmEnrolment, signOut, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwnerSession(): OwnerSession {
  const value = useContext(Ctx);
  if (!value) throw new Error("useOwnerSession must be used inside OwnerSessionProvider");
  return value;
}
