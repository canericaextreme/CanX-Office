"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOwnerSession } from "@/lib/owner-session";
import { OwnerSignIn } from "./OwnerSignIn";

export function ElsieAuthenticator() {
  const session = useOwnerSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  if (session.stepUpComplete) return null;
  const canVerify = session.signedIn || session.state === "mfa_required";
  const verify = async () => {
    if (!canVerify || busy || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const problem = await session.submitMfaCode(code);
      if (problem) setError(problem);
      else setCode("");
    } catch {
      setError("Code could not be verified. Nothing was unlocked.");
    } finally { setBusy(false); }
  };
  return (
    <section aria-label="Elsie authenticator" className="canx-elsie-auth shrink-0 border-b border-border bg-background px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <label htmlFor="elsie-authenticator-code" className="shrink-0 text-sm font-semibold">Authenticator</label>
        <Input id="elsie-authenticator-code" aria-label="Six-digit authenticator code for Elsie" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={!canVerify || busy} className="h-11 min-w-0 flex-1 text-base" onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={event => { if (event.key === "Enter") void verify(); }} />
        {canVerify ? <Button className="h-11 shrink-0" disabled={busy || code.length !== 6} onClick={() => void verify()}><ShieldCheck className="h-4 w-4" aria-hidden="true" />{busy ? "Checking" : "Verify"}</Button> : <Button className="h-11 shrink-0" aria-expanded={showSignIn} onClick={() => setShowSignIn(value => !value)}><ShieldCheck className="h-4 w-4" aria-hidden="true" />Unlock</Button>}
      </div>
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      {showSignIn && !canVerify && <div className="mt-2 max-h-[40dvh] overflow-y-auto"><OwnerSignIn compact /></div>}
    </section>
  );
}
