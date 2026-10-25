"use client";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOwnerSession } from "@/lib/owner-session";
import { OwnerSignIn } from "./OwnerSignIn";
import { OFFICE_ACCOUNT_EVENT } from "@/lib/office-account-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

const CODE_PENDING_KEY = "canx-account-code-pending";

export function AccountMenu() {
  const session = useOwnerSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => { if (!session.viewer) setOpen(true); };
    window.addEventListener(OFFICE_ACCOUNT_EVENT, show);
    return () => window.removeEventListener(OFFICE_ACCOUNT_EVENT, show);
  }, [session.viewer]);
  // Android may reload the page while John is in his authenticator app. Remember
  // that the code step was open so it comes back by itself instead of vanishing.
  const needsCode = !session.viewer && session.state === "owner" && !session.stepUpComplete;
  useEffect(() => {
    try {
      if (session.stepUpComplete || session.state === "signed_out") window.sessionStorage.removeItem(CODE_PENDING_KEY);
      else if (open && needsCode) window.sessionStorage.setItem(CODE_PENDING_KEY, "1");
      else if (!open && needsCode && window.sessionStorage.getItem(CODE_PENDING_KEY) === "1") setOpen(true);
    } catch { /* Without storage the Account button still works. */ }
  }, [open, needsCode, session.stepUpComplete, session.state]);
  if (session.viewer) return null;
  const changeOpen = (next: boolean) => {
    // Closing on purpose means "not now", so do not reopen after a reload.
    if (!next) try { window.sessionStorage.removeItem(CODE_PENDING_KEY); } catch { /* Keep page state. */ }
    setOpen(next);
  };
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild>
      <Button variant="outline" className="h-11 shrink-0 gap-2 px-3 text-base" aria-label="Account sign-in and authenticator">
        <UserRound className="h-5 w-5" aria-hidden="true" /> Account
      </Button>
    </DialogTrigger>
    <DialogContent className="canx-account-dialog z-[80] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-lg overflow-y-auto overscroll-contain p-4 sm:p-6 [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:right-1 [&>button:last-child]:top-1">
      <DialogHeader>
        <DialogTitle className="pr-10 text-xl">CanX Account</DialogTitle>
        <DialogDescription className="text-base text-foreground">Private records and paid Elsie conversations require owner verification.</DialogDescription>
      </DialogHeader>
      <OwnerSignIn compact />
    </DialogContent>
  </Dialog>;
}
