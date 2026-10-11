"use client";

/**
 * First screen of the CanX Office.
 *
 * No valid session means one clean sign-in screen — never a half-open office
 * that surprises John with a sign-in prompt later. Ordinary sign-in (AAL1) is
 * all that is asked for here; the authenticator is a step-up, requested only
 * when a protected action is attempted.
 *
 * Nothing in this file decides who the owner is. The server verifies every
 * session, and this screen reports the server's answer.
 */

import { useEffect, useState, type ReactNode } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOwnerSession } from "@/lib/owner-session";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="dark flex min-h-svh flex-col bg-black px-5 py-8 text-white sm:px-10">
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col items-center justify-center gap-8 lg:flex-row lg:gap-12">
        <div className="w-full max-w-5xl flex-1">
          <div className="relative aspect-[2/1] w-full overflow-hidden">
            <img
              src="/canx-logo.png"
              alt="CanX — Canerica Extreme"
              width={1600}
              height={1600}
              fetchPriority="high"
              className="absolute left-0 top-1/2 w-full max-w-none -translate-y-1/2"
            />
          </div>
        </div>
        <section aria-label="CanX Office entrance" className="w-full max-w-md shrink-0 rounded-2xl border border-white/15 bg-[#101014] p-6 shadow-[0_0_60px_rgba(220,38,38,.08)] sm:p-8 lg:w-[380px]">
          <p className="mb-6 text-sm font-semibold uppercase tracking-[0.24em] text-red-400">CanX Office</p>
          {children}
        </section>
      </main>
      <p className="mx-auto mt-8 text-center text-sm text-zinc-400">A CanX Initiative</p>
    </div>
  );
}

/** Neutral, short, and flash-free while the existing session is checked. */
export function OfficeOpeningScreen() {
  return (
    <Shell>
      <p role="status" className="text-sm text-muted-foreground">
        Opening CanX Office…
      </p>
    </Shell>
  );
}

export function OfficeSignInScreen({ onSignedIn }: { onSignedIn?: () => void } = {}) {
  const session = useOwnerSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const problem = await session.signIn(email.trim(), password);
    if (problem) setError(problem);
    else onSignedIn?.();
    setBusy(false);
  };

  const sendReset = async () => {
    setBusy(true);
    setError(null);
    const problem = await session.requestPasswordReset(recoveryEmail.trim());
    if (problem) setError(problem);
    else setSent(true);
    setBusy(false);
  };


  if (!session.configured) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">The office connection could not be loaded</h1>
        <p role="alert" className="mt-2 text-lg text-foreground">
          This page could not load its sign-in settings. This does not mean your account or records are gone.
          The office stays closed until the connection can be checked securely.
        </p>
        <Button className="mt-4" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await session.refresh(); } finally { setBusy(false); }
        }}>{busy ? "Checking connection…" : "Retry office connection"}</Button>
        <p className="mt-3 break-all text-sm text-muted-foreground">
          Office address: {typeof window !== "undefined" ? window.location.origin : "loading…"}
        </p>
      </Shell>
    );
  }

  if (recovering) {
    return (
      <Shell>
        <h1 className="text-base font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the email address for your CanX owner account. We will send a secure link you can use to set a new
          password.
        </p>
        {sent ? (
          <p role="status" className="mt-4 text-sm text-foreground">
            Check your email for a secure password-reset link. It may take a minute to arrive, and it can land in
            your spam folder.
          </p>
        ) : (
          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && recoveryEmail) void sendReset();
            }}
          >
            <Input
              type="email"
              autoComplete="email"
              value={recoveryEmail}
              placeholder="Account email"
              aria-label="Account email"
              onChange={(event) => setRecoveryEmail(event.target.value)}
            />
            <Button type="submit" size="lg" className="w-full" disabled={busy || !recoveryEmail}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="button"
          className="mt-4 text-sm text-primary underline"
          onClick={() => {
            setRecovering(false);
            setSent(false);
            setError(null);
          }}
        >
          Back to sign in
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Welcome to your office</h1>
      <p className="mt-2 text-base text-zinc-400">
        Sign in with your email and password.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && email && password) void submit();
        }}
      >
        <label htmlFor="office-email" className="block text-sm font-medium text-zinc-200">Email</label>
        <Input
          id="office-email"
          type="email"
          autoComplete="email"
          value={email}
          placeholder="you@example.com"
          required
          aria-label="Owner email"
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="office-password" className="block text-sm font-medium text-zinc-200">Password</label>
        <Input
          id="office-password"
          type="password"
          autoComplete="current-password"
          value={password}
          placeholder="Password"
          required
          aria-label="Password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" size="lg" className="w-full bg-red-600 text-white hover:bg-red-500" disabled={busy || !email || !password}>
          <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
          {busy ? "Signing in…" : "Sign in to CanX Office"}
        </Button>
      </form>

      <button
        type="button"
        className="mt-3 text-sm font-medium text-primary underline"
        onClick={() => {
          setRecoveryEmail(email.trim());
          setError(null);
          setSent(false);
          setRecovering(true);
        }}
      >
        Forgot password?
      </button>

      {session.state === "not_owner" && (
        <p className="mt-3 text-sm text-foreground">
          That account is signed in, but it is not the CanX owner account.
        </p>
      )}
      {session.state === "error" && (
        <div className="mt-3">
          <p className="text-sm text-foreground">{session.message}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void session.refresh()}>
            Try again
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="mt-5 flex items-start gap-2 text-sm text-zinc-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Private access to CanX Office.
      </p>
    </Shell>
  );
}

/**
 * Gate: checking → office or sign-in, deterministically.
 * The gate fails closed. With no CanX-owned backend configured there is no way
 * to verify the owner, so the office is kept closed and the unavailable
 * sign-in screen is shown instead of any office content.
 */
export function OfficeGate({ children }: { children: ReactNode }) {
  const session = useOwnerSession();
  const [entranceChecked, setEntranceChecked] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    try {
      setEntered(window.sessionStorage.getItem("canx-office-logo-entrance-v1") === "1");
    } catch { /* The entrance still works when browser storage is unavailable. */ }
    setEntranceChecked(true);
  }, []);

  useEffect(() => {
    if (session.state === "checking" || session.state === "owner") return;
    setEntered(false);
    try { window.sessionStorage.removeItem("canx-office-logo-entrance-v1"); } catch { /* Keep page state. */ }
  }, [session.state]);

  const enterOffice = () => {
    setEntered(true);
    try { window.sessionStorage.setItem("canx-office-logo-entrance-v1", "1"); } catch { /* Keep page state. */ }
  };

  if (session.state === "checking" || !entranceChecked) return <OfficeOpeningScreen />;
  if (session.state !== "owner") return <OfficeSignInScreen onSignedIn={enterOffice} />;
  if (!entered && !session.viewer) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-base text-zinc-400">You’re signed in and ready to go.</p>
        <Button size="lg" className="mt-6 w-full bg-red-600 text-white hover:bg-red-500" onClick={enterOffice}>
          Enter CanX Office
        </Button>
      </Shell>
    );
  }
  return <>{children}</>;
}
