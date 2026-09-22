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

import { useState, type ReactNode } from "react";
import { Building2, LogIn, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOwnerSession } from "@/lib/owner-session";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card/90 p-6 shadow-xl backdrop-blur">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Building2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-lg font-semibold leading-tight">CanX Office</p>
            <p className="text-xs text-muted-foreground">Canerica Extreme</p>
          </div>
        </div>
        {children}
      </div>
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

export function OfficeSignInScreen() {
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
      <h1 className="text-base font-semibold">Sign in to open the office</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your usual CanX owner email and password. Your authenticator is only asked for when you do something
        protected, such as an approval, a purchase, or publishing.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && email && password) void submit();
        }}
      >
        <Input
          type="email"
          autoComplete="email"
          value={email}
          placeholder="Owner email"
          aria-label="Owner email"
          onChange={(event) => setEmail(event.target.value)}
        />
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          placeholder="Password"
          aria-label="Password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy || !email || !password}>
          <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
          {busy ? "Signing in…" : "Sign in"}
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

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Your sign-in is checked on the server every time. CanX Office does not store your password; Supabase keeps a
        browser session so you can stay signed in.
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
  if (session.state === "checking") return <OfficeOpeningScreen />;
  if (session.state === "owner") return <>{children}</>;
  return <OfficeSignInScreen />;
}
