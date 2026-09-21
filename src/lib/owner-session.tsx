"use client";

/**
 * Owner sign-in state for the CanX-owned database.
 *
 * The browser only ever holds a session. Whether that session counts as "the
 * owner" is decided on the server, every time, and this file simply reports
 * the server's answer. Nothing here grants a role.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadCanxSupabase } from "@/lib/canx-supabase";
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
  /** Verified assurance level of the current session, from the server. */
  aal: "aal1" | "aal2" | null;
  /** Ordinary office access: signed in as the owner, authenticator not required. */
  signedIn: boolean;
  /** Authenticator confirmed — protected actions may proceed. */
  stepUpComplete: boolean;
  /** True when shared saving to the CanX account is permitted. */
  shared: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Sends the official Supabase password-reset email. Never says whether an email is registered. */
  requestPasswordReset: (email: string) => Promise<string | null>;
  /** Sets a new password for the session created by the recovery link. */
  updatePassword: (newPassword: string) => Promise<string | null>;
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

/**
 * Plain, honest mapping for updateUser failures. A wrong diagnosis is worse
 * than a vague one: only genuine session/expiry failures may say "request a
 * new link"; policy rejections and reuse must say so; anything unknown must
 * not falsely declare the link expired. No secrets, no account details.
 */
export function mapUpdatePasswordError(error: unknown): string {
  const authError = (error ?? {}) as { message?: unknown; code?: unknown; status?: unknown };
  const code = typeof authError.code === "string" ? authError.code.toLowerCase() : "";
  const message = typeof authError.message === "string" ? authError.message.toLowerCase() : "";
  const status = typeof authError.status === "number" ? authError.status : null;
  if (
    code.includes("session_not_found") ||
    code.includes("otp_expired") ||
    message.includes("session") && message.includes("not") && message.includes("found") ||
    message.includes("jwt") && message.includes("expired") ||
    status === 401 ||
    status === 403
  ) {
    return "This reset link is no longer valid. Go back to sign-in and request a fresh link — links can only be used once and stop working after a short time.";
  }
  if (code === "same_password" || message.includes("same password") || message.includes("different from the old")) {
    return "That is the same password as before. Please choose a different password you have not used for this account.";
  }
  if (code === "weak_password" || message.includes("weak password") || message.includes("at least") || message.includes("password") && message.includes("strength")) {
    return "That password was not accepted by the password rules. Use at least 10 characters, and avoid passwords that are very common or easy to guess.";
  }
  return "That password could not be saved just now. Please try again in a moment — if it keeps failing, go back to sign-in and request a fresh reset link.";
}

export function OwnerSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OwnerState>("checking");
  const [configured, setConfigured] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [message, setMessage] = useState("Checking your sign-in…");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null);

  const applyResult = useCallback((token: string | null, result: SessionResult) => {
    setAccessToken(token);
    if (result.ok) {
      setState("owner");
      setEmail(result.email);
      setMessage(result.message);
      setAal(result.aal === "aal2" ? "aal2" : "aal1");
      return;
    }
    setAal(null);
    setState(STATE_FROM_REASON[result.reason ?? "no_session"] ?? "signed_out");
    setMessage(result.message);
  }, []);

  const refreshGeneration = useRef(0);
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const supabase = await loadCanxSupabase();
    if (generation !== refreshGeneration.current) return;
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
      if (generation === refreshGeneration.current) applyResult(token, result);
    } catch {
      if (generation !== refreshGeneration.current) return;
      setState("error");
      setMessage("The office could not check your sign-in.");
    }
  }, [applyResult]);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const supabase = await loadCanxSupabase();
      if (!active) return;
      if (supabase) {
        const { data } = supabase.auth.onAuthStateChange((event: string) => {
          if (event === "SIGNED_OUT") {
            ++refreshGeneration.current;
            setAccessToken(null);
            setEmail(null);
            setAal(null);
            setState("signed_out");
          }
          // Leave the auth callback before calling getSession (auth holds a lock).
          // TOKEN_REFRESHED must propagate the new token to Data and its save queue.
          if (["INITIAL_SESSION", "SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "MFA_CHALLENGE_VERIFIED", "USER_UPDATED"].includes(event)) {
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => { if (active) void refresh(); }, 0);
          }
        });
        unsubscribe = () => data.subscription.unsubscribe();
      }
      await refresh();
    })();
    return () => {
      active = false;
      ++refreshGeneration.current;
      clearTimeout(refreshTimer);
      unsubscribe?.();
    };
  }, [refresh]);

  const signIn = useCallback(
    async (userEmail: string, password: string) => {
      const supabase = await loadCanxSupabase();
      if (!supabase) return "No CanX-owned database is connected yet.";
      const { error } = await supabase.auth.signInWithPassword({ email: userEmail, password });
      if (error) return "That email and password were not accepted.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const requestPasswordReset = useCallback(async (userEmail: string) => {
    const supabase = await loadCanxSupabase();
    if (!supabase) return "No CanX-owned database is connected yet.";
    // Same origin, so this works in preview and on the published office alike.
    const options =
      typeof window === "undefined" ? {} : { redirectTo: `${window.location.origin}/auth/reset-password` };
    const { error } = await supabase.auth.resetPasswordForEmail(userEmail, options);
    // Deliberately generic: never reveal whether an address has an account.
    if (error) return "The reset email could not be sent just now. Check the address and try again in a moment.";
    return null;
  }, []);

  const updatePassword = useCallback(
    async (newPassword: string) => {
      const supabase = await loadCanxSupabase();
      if (!supabase) return "No CanX-owned database is connected yet.";
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return mapUpdatePasswordError(error);
      await refresh();
      return null;
    },
    [refresh],
  );

  const submitMfaCode = useCallback(
    async (code: string) => {
      const supabase = await loadCanxSupabase();
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
    const supabase = await loadCanxSupabase();
    if (!supabase) return "No CanX-owned database is connected yet.";
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) return "The authenticator app could not be set up.";
    return { qr: data.totp.qr_code, secret: data.totp.secret, factorId: data.id };
  }, []);

  const confirmEnrolment = useCallback(
    async (factorId: string, code: string) => {
      const supabase = await loadCanxSupabase();
      if (!supabase) return "No CanX-owned database is connected yet.";
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) return "That code was not accepted.";
      await refresh();
      return null;
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    ++refreshGeneration.current;
    const supabase = await loadCanxSupabase();
    if (supabase) await supabase.auth.signOut();
    setAccessToken(null);
    setEmail(null);
    setAal(null);
    setState(configured ? "signed_out" : "backend_missing");
    setMessage("Signed out. Sign in again to open the office.");
  }, [configured]);

  const value = useMemo<OwnerSession>(
    () => ({
      state,
      configured,
      email,
      message,
      accessToken,
      aal,
      signedIn: state === "owner" && Boolean(accessToken),
      stepUpComplete: state === "owner" && aal === "aal2",
      shared: state === "owner" && Boolean(accessToken),
      signIn,
      requestPasswordReset,
      updatePassword,
      submitMfaCode,
      enrolTotp,
      confirmEnrolment,
      signOut,
      refresh,
    }),
    [state, configured, email, message, accessToken, aal, signIn, requestPasswordReset, updatePassword, submitMfaCode, enrolTotp, confirmEnrolment, signOut, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOwnerSession(): OwnerSession {
  const value = useContext(Ctx);
  if (!value) throw new Error("useOwnerSession must be used inside OwnerSessionProvider");
  return value;
}
