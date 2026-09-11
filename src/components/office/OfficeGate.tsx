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
import { SUPABASE_SETUP_URL } from "@/lib/connections-inventory";

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
        <h1 className="text-base font-semibold">Sign-in is not available yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No CanX-owned database is connected, so there is no account to sign in to. The office is running on this
          device only.
        </p>
        <a href={SUPABASE_SETUP_URL} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-primary underline">
          Open the connectors page and choose Supabase
        </a>
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
        Your sign-in is checked on the server every time. Nothing is stored in this page.
      </p>
    </Shell>
  );
}

/**
 * Gate: checking → office or sign-in, deterministically.
 * Device-only mode (no CanX database configured) still opens the office, so
 * the existing published behaviour is preserved rather than blocked.
 */
export function OfficeGate({ children }: { children: ReactNode }) {
  const session = useOwnerSession();
  if (session.state === "checking") return <OfficeOpeningScreen />;
  if (session.state === "backend_missing") return <>{children}</>;
  if (session.state === "owner") return <>{children}</>;
  return <OfficeSignInScreen />;
}
