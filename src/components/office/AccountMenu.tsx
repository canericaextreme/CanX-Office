"use client";

/**
 * Account menu in the office header: who is signed in, the authenticator
 * step-up, and Sign out. Deliberately here and not on the floating companion.
 */

import { useState } from "react";
import { LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOwnerSession } from "@/lib/owner-session";
import { OwnerSignIn } from "@/components/office/OwnerSignIn";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

export function AccountMenu() {
  const session = useOwnerSession();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session.viewer) return null;
  if (session.state !== "owner") return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-11 shrink-0 gap-2" aria-label="Owner sign-in and authenticator">
          {session.state === "mfa_required" ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
          {session.state === "mfa_required" ? "Code" : "Sign in"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CanX owner account</DialogTitle>
          <DialogDescription>{session.state === "mfa_required" ? "Enter your six-digit authenticator code to talk with Elsie." : "Sign in, then enter your authenticator code to talk with Elsie."}</DialogDescription>
        </DialogHeader>
        <OwnerSignIn />
      </DialogContent>
    </Dialog>
  );

  const verify = async () => {
    setBusy(true);
    setError(null);
    const problem = await session.submitMfaCode(code);
    setError(problem);
    if (!problem) setCode("");
    setBusy(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Account and sign out">
          <UserRound className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[calc(100dvh-1rem)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto">
        <DropdownMenuLabel className="space-y-1">
          <span className="block truncate text-sm font-semibold">{session.email ?? "Signed in"}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {session.stepUpComplete
              ? "Authenticator confirmed for this session. Protected actions can proceed."
              : "Ordinary sign-in. Protected actions will ask for your authenticator."}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {!session.stepUpComplete && (
          <div
            className="space-y-2 px-2 py-2"
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs text-muted-foreground">
              Verify now if you are about to approve, send, buy, publish, or change security.
            </p>
            <Input
              inputMode="numeric"
              value={code}
              placeholder="123456"
              aria-label="Authenticator code"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <Button size="sm" className="w-full" disabled={busy || code.length !== 6} onClick={() => void verify()}>
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" /> Verify with authenticator
            </Button>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => {
            void session.signOut();
          }}
        >
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
