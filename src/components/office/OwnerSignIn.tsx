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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerSession } from "@/lib/owner-session";
import { SUPABASE_SETUP_URL } from "@/lib/connections-inventory";

export function OwnerSignIn() {
  const session = useOwnerSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrolment, setEnrolment] = useState<{ qr: string; secret: string; factorId: string } | null>(null);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const problem = await action();
    if (problem) setError(problem);
    setBusy(false);
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">Owner sign-in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{session.message}</p>

        {!session.configured && (
          <div className="rounded-lg border border-border/60 bg-secondary/40 p-3 text-sm">
            <p className="text-foreground">Sign-in is unavailable until a CanX-owned database is connected.</p>
            <p className="mt-1 text-muted-foreground">
              You complete that step yourself, in your own account, so CanX owns it.
            </p>
            <a
              href={SUPABASE_SETUP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-primary underline"
            >
              Open the connectors page and choose Supabase
            </a>
          </div>
        )}

        {session.configured && (session.state === "signed_out" || session.state === "error") && (
          <div className="space-y-2">
            <Input
              type="email"
              value={email}
              placeholder="Owner email"
              aria-label="Owner email"
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              value={password}
              placeholder="Password"
              aria-label="Password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button disabled={busy || !email || !password} onClick={() => void run(() => session.signIn(email, password))}>
              <LogIn className="mr-1.5 h-4 w-4" /> Sign in
            </Button>
          </div>
        )}

        {session.state === "mfa_required" && (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              Enter the six-digit code from your authenticator app to finish signing in.
            </p>
            <Input
              inputMode="numeric"
              value={code}
              placeholder="123456"
              aria-label="Six digit code"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || code.length !== 6} onClick={() => void run(() => session.submitMfaCode(code))}>
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Verify
              </Button>
              <Button
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
                  size="sm"
                  className="mt-2"
                  disabled={busy || code.length !== 6}
                  onClick={() => void run(() => session.confirmEnrolment(enrolment.factorId, code))}
                >
                  Finish setup
                </Button>
              </div>
            )}
          </div>
        )}

        {session.state === "not_owner" && (
          <p className="text-sm text-foreground">
            That account is signed in, but it is not the CanX owner account, so nothing shared is available.
          </p>
        )}

        {session.state === "owner" && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-foreground">Signed in as {session.email}. Records save to your CanX account.</span>
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
      </CardContent>
    </Card>
  );
}
