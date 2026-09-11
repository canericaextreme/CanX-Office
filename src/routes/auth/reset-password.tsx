"use client";

/**
 * Password update page for the CanX Office recovery email link.
 *
 * The link from the email creates a short-lived recovery session in the
 * existing CanX-owned Supabase client. This page only sets a new password on
 * that session — it grants no role and bypasses nothing. Owner checks and the
 * authenticator step-up for protected actions are unchanged and still happen
 * on the server.
 */

import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OwnerSessionProvider, useOwnerSession } from "@/lib/owner-session";
import { OfficeThemeProvider } from "@/lib/office-theme";
import { loadCanxSupabase } from "@/lib/canx-supabase";

const MIN_LENGTH = 10;

export const Route = createFileRoute("/auth/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — CanX Office" },
      { name: "description", content: "Set a new password for your CanX Office owner account." },
      { property: "og:title", content: "Set a new password — CanX Office" },
      { property: "og:description", content: "Set a new password for your CanX Office owner account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function Shell({ children }: { children: React.ReactNode }) {
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

function ResetPasswordCard() {
  const session = useOwnerSession();
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<"checking" | "ready" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = await loadCanxSupabase();
      if (!supabase) {
        if (!cancelled) setLinkState("expired");
        return;
      }
      // The client picks the recovery tokens out of the URL on load.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setLinkState("ready");
        return;
      }
      const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
        if (next) setLinkState("ready");
      });
      const timer = setTimeout(() => {
        if (!cancelled) setLinkState((current) => (current === "ready" ? current : "expired"));
      }, 2500);
      return () => {
        clearTimeout(timer);
        sub.subscription.unsubscribe();
      };
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Please use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const problem = await session.updatePassword(password);
    setBusy(false);
    if (problem) {
      setError(problem);
      return;
    }
    setDone(true);
    setTimeout(() => void navigate({ to: "/" }), 1200);
  };

  if (linkState === "checking") {
    return (
      <Shell>
        <p role="status" className="text-sm text-muted-foreground">
          Checking your reset link…
        </p>
      </Shell>
    );
  }

  if (linkState === "expired") {
    return (
      <Shell>
        <h1 className="text-base font-semibold">This reset link has expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Reset links can only be used once, and they stop working after a short time. Go back to the office
          sign-in screen and request a new one.
        </p>
        <Button className="mt-4" onClick={() => void navigate({ to: "/" })}>
          Back to sign in
        </Button>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <h1 className="text-base font-semibold">Your password is updated</h1>
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Taking you back to the office…
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-base font-semibold">Set a new password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Choose a new password for your CanX owner account. At least {MIN_LENGTH} characters. Your browser password
        manager can save it for you afterwards.
      </p>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void submit();
        }}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          placeholder="New password"
          aria-label="New password"
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          type="password"
          autoComplete="new-password"
          value={confirm}
          placeholder="Confirm new password"
          aria-label="Confirm new password"
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={busy || !password || !confirm}>
          {busy ? "Saving…" : "Save new password"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </Shell>
  );
}

function ResetPasswordPage() {
  return (
    <OfficeThemeProvider>
      <OwnerSessionProvider>
        <ResetPasswordCard />
      </OwnerSessionProvider>
    </OfficeThemeProvider>
  );
}
