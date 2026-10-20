"use client";
import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOwnerSession } from "@/lib/owner-session";
import { OwnerSignIn } from "./OwnerSignIn";
import { OFFICE_ACCOUNT_EVENT } from "@/lib/office-account-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";

export function AccountMenu() {
  const session = useOwnerSession();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => { if (!session.viewer) setOpen(true); };
    window.addEventListener(OFFICE_ACCOUNT_EVENT, show);
    return () => window.removeEventListener(OFFICE_ACCOUNT_EVENT, show);
  }, [session.viewer]);
  if (session.viewer) return null;
  return <Dialog open={open} onOpenChange={setOpen}>
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
