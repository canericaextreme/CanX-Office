"use client";

/**
 * Owner sign-in card. Shows an honest unavailable state while no CanX-owned
 * database is connected. Nothing here decides whether you are the owner — the
 * server does that on every request.
 */

import { useState } from "react";
import { Eye, EyeOff, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOwnerSession } from "@/lib/owner-session";

export function OwnerSignIn({ compact = false }: { compact?: boolean }) {
  const session = useOwnerSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<{ qr: string; secret: string; factorId: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [signInAnyway, setSignInAnyway] = useState(false);
  const reconnecting = session.state === "error" && session.savedSession && !signInAnyway;

  const run = async (action: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await action();
      if (problem) setError(problem);
      else setCode("");
    } catch {
      setError("Account verification could not finish. Nothing was unlocked.");
    } finally { setBusy(false); }
  };

  return (
    <section aria-label="Owner account controls" className="space-y-4 text-base [&_input]:min-h-11 [&_input]:text-base [&_button]:min-h-11 [&_button]:text-base [&_button]:whitespace-normal">
        {!compact && <h2 className="text-xl font-semibold">Owner account</h2>}
        {session.state === "checking" ? <p role="status">Checking Account…</p> : !session.configured && (
          <div className="space-y-3">
            <p role="alert">Account sign-in settings are unavailable. Private records and paid calls stay locked.</p>
            <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await session.refresh(); return null; })}>Check Account connection</Button>
          </div>
        )}

        {session.configured && reconnecting && (
          <div className="space-y-3">
            <p role="status">Your saved sign-in is still on this device. Reconnecting automatically, so there is no need to type your password.</p>
            <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await session.refresh(); return null; })}>Try again now</Button>
            <button type="button" className="block text-sm text-primary underline" onClick={() => setSignInAnyway(true)}>Sign in again instead</button>
          </div>
        )}

        {session.configured && (session.state === "signed_out" || (session.state === "error" && !reconnecting)) && (
          <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (email && password) void run(() => session.signIn(email, password)); }}>
            <label className="block space-y-1"><span>Email</span>
            <Input
              type="email"
              value={email}
              autoComplete="username"
              required
              aria-label="Owner email"
              onChange={(event) => setEmail(event.target.value)}
            />
            </label>
            <label className="block space-y-1"><span>Password</span>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                required
                aria-label="Password"
                autoComplete="current-password"
                className="pr-12"
                onChange={(event) => setPassword(event.target.value)}
              />
              <Button
                variant="ghost"
                size="icon"
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
            </label>
            <Button type="submit" className="w-full" disabled={busy || !email || !password}>
              <LogIn className="mr-1.5 h-4 w-4" /> Sign in
            </Button>
          </form>
        )}

        {(session.state === "mfa_required" || (session.state === "owner" && !session.stepUpComplete)) && (
          <form className="space-y-3" onSubmit={event => { event.preventDefault(); if (code.length === 6) void run(() => enrolment ? session.confirmEnrolment(enrolment.factorId, code) : session.submitMfaCode(code)); }}>
            <label className="block space-y-1"><span>Authenticator code</span>
            <Input
              inputMode="numeric"
              value={code}
              autoComplete="one-time-code"
              maxLength={6}
              aria-label="Six digit code"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            </label>
            <div className="grid gap-2">
              <Button type="submit" disabled={busy || code.length !== 6}>
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Verify
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await session.enrolTotp();
                    if (typeof result === "string") return result;
                    setEnrolment(result);
                    return null;
                  })
                }
              >
                Set up an authenticator app
              </Button>
            </div>
            {enrolment && (
              <div className="rounded-lg border border-border/60 p-3">
                <p className="text-sm text-foreground">Scan this in your authenticator app, then enter a code.</p>
                <img src={enrolment.qr} alt="Authenticator setup code" className="my-2 h-40 w-40 bg-white p-1" />
                <p className="text-xs text-muted-foreground">
                  Keep your recovery codes somewhere safe and offline. Without them, losing your phone means losing
                  access to the account.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  disabled={busy || code.length !== 6}
                  onClick={() => void run(() => session.confirmEnrolment(enrolment.factorId, code))}
                >
                  Finish setup
                </Button>
              </div>
            )}
          </form>
        )}

        {session.state === "not_owner" && (
          <p className="text-sm text-foreground">
            That account is signed in, but it is not the CanX owner account, so nothing shared is available.
          </p>
        )}

        {session.state === "owner" && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 break-all text-base text-foreground">{session.email ?? "Owner signed in"}</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void session.signOut()}>
              <LogOut className="mr-1.5 h-4 w-4" /> Sign out
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
    </section>
  );
}
