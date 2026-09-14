"use client";

/**
 * Claude — Second Eyes, available from every room in the CanX Office.
 *
 * Claude is an independent reviewer only. It is never the Office Manager,
 * never John, and never an approver. It cannot build, save, send, buy, deploy
 * or change anything: every button here asks for an opinion and nothing else.
 *
 * Nothing runs on its own. No review starts on navigation, in the background,
 * or on a timer — a paid review happens only when John presses a button, which
 * is what keeps this inside the monthly running-cost ceiling.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, Building2, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useOwnerSession } from "@/lib/owner-session";
import {
  getClaudeStatus,
  requestClaudeReview,
  type ClaudeReviewReply,
  type ClaudeStatus,
} from "@/lib/claude-review.functions";
import { CLAUDE_ASSIGNMENTS, type ClaudeAssignment } from "@/lib/claude-assignments";
import { captureOfficeView, officeRoomLabel } from "@/lib/office-observe";
import { finishActivity, startActivity } from "@/lib/office-activity-log";
import {
  consumePrefill,
  getSecondEyesState,
  rememberReview,
  subscribeSecondEyes,
} from "@/lib/second-eyes";

type Tone = "green" | "yellow" | "grey" | "checking";

const TONE_LABEL: Record<Tone, string> = {
  green: "Connected and verified",
  yellow: "Set up, not verified",
  grey: "Not connected",
  checking: "Checking",
};

const TONE_CLASS: Record<Tone, string> = {
  green: "border-canx-green/50 bg-canx-green/15 text-canx-green",
  yellow: "border-canx-yellow/50 bg-canx-yellow/15 text-canx-yellow",
  grey: "border-border bg-secondary text-muted-foreground",
  checking: "border-border bg-secondary text-muted-foreground",
};

function toneFor(status: ClaudeStatus | null, loading: boolean): Tone {
  if (loading || status === null) return "checking";
  if (status.connected) return "green";
  if (status.state === "configured_unverified") return "yellow";
  return "grey";
}

const emptyState = { lastReview: null, lastRoom: null, prefill: null, openRequests: 0 };

export function SecondEyesPanel() {
  const session = useOwnerSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const room = officeRoomLabel(pathname);

  const fetchStatus = useServerFn(getClaudeStatus);
  const review = useServerFn(requestClaudeReview);

  const shared = useSyncExternalStore(subscribeSecondEyes, getSecondEyesState, () => emptyState);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState<null | "room" | "office" | "manual">(null);
  const [problem, setProblem] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [primary, setPrimary] = useState("");
  const [evidence, setEvidence] = useState("");
  const [question, setQuestion] = useState("");
  const [evidenceSource, setEvidenceSource] = useState(
    "Written by John in this form. The office does not add any of its own records to a manual review.",
  );

  /** Another part of the office asked for this panel (never a review). */
  useEffect(() => {
    if (shared.openRequests === 0) return;
    const prefill = consumePrefill();
    if (prefill) {
      setSubject(prefill.subject);
      setPrimary(prefill.primaryRecommendation);
      setEvidence(prefill.evidence);
      setQuestion(prefill.question);
      setEvidenceSource(prefill.evidenceSource);
    }
    setOpen(true);
  }, [shared.openRequests]);

  const checkConnection = useCallback(async () => {
    setChecking(true);
    try {
      setStatus(await fetchStatus({ data: { accessToken: session.accessToken ?? "" } }));
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }, [fetchStatus, session.accessToken]);

  // The connection check is free and never touches the paid endpoint.
  useEffect(() => {
    if (!open) return;
    void checkConnection();
  }, [open, checkConnection]);

  const tone = toneFor(status, checking);

  async function run(
    kind: "room" | "office" | "manual",
    input: {
      subject: string;
      primaryRecommendation: string;
      evidence: string;
      question: string;
      image?: string;
      roomText?: string;
    },
  ) {
    setBusy(kind);
    setProblem(null);
    // Movement in the office is allowed only while this real request runs.
    const taskId = `claude-review-${Date.now()}`;
    startActivity({ taskId, title: `Claude second eyes — ${input.subject}`, cellId: "systems" });
    try {
      const reply = await review({
        data: {
          accessToken: session.accessToken ?? "",
          scope: kind,
          path: pathname,
          roomLabel: room,
          ...input,
        },
      });
      if (reply.ok) {
        rememberReview(reply, room);
        setProblem(null);
      } else {
        setProblem(reply.detail ?? "The review could not be completed.");
      }
      finishActivity(
        taskId,
        reply.ok ? "completed" : "failed",
        reply.ok ? "Claude returned an independent review." : (reply.detail ?? "The review did not complete."),
      );
    } catch {
      setProblem("The review request did not complete.");
      finishActivity(taskId, "failed", "The review request did not complete.");
    } finally {
      setBusy(null);
    }
  }

  /**
   * One picture, taken only now, of the marked office page only. The panel is
   * closed first so the picture shows the room and not this drawer.
   */
  async function captureThisRoom(): Promise<{ image: string; text: string } | string> {
    setOpen(false);
    await new Promise((resolve) => setTimeout(resolve, 350));
    const result = await captureOfficeView(pathname);
    setOpen(true);
    if (!result.ok) return result.message;
    return { image: result.observation.image, text: result.observation.text };
  }

  async function reviewThisRoom() {
    setProblem(null);
    const captured = await captureThisRoom();
    if (typeof captured === "string") {
      setProblem(`Claude was not shown the screen. ${captured} Nothing was sent.`);
      return;
    }
    await run("room", {
      subject: `Office page review — ${room}`,
      primaryRecommendation: `Review the CanX Office page "${room}" as John currently sees it, and say what is unclear, risky, missing or wrong.`,
      evidence: "The attached picture and the visible text of this one office page.",
      question:
        "What on this page is unclear, misleading, unverified or risky? What would you check before relying on it?",
      image: captured.image,
      roomText: captured.text,
    });
  }

  async function reviewWholeOffice(withPicture: boolean) {
    setProblem(null);
    let picture: { image: string; text: string } | null = null;
    if (withPicture) {
      const captured = await captureThisRoom();
      if (typeof captured === "string") {
        setProblem(`No picture was attached. ${captured}`);
      } else {
        picture = captured;
      }
    }
    await run("office", {
      subject: "Whole CanX Office review",
      primaryRecommendation:
        "Review the whole CanX Office across leadership and decisions, programmes and projects, operations and the work board, money and records, systems security and connections, and team and skills.",
      evidence: "The read-only office snapshot built on the server for this request.",
      question:
        "Where is this office weakest, and what is unverified or missing? Give findings for each of the six areas you can actually see.",
      ...(picture ? { image: picture.image, roomText: picture.text } : {}),
    });
  }

  function loadAssignment(assignment: ClaudeAssignment) {
    setSubject(assignment.subject);
    setPrimary(assignment.primaryRecommendation);
    setEvidence(assignment.evidence);
    setQuestion(assignment.question);
    setEvidenceSource(`Prepared review written by John on ${assignment.preparedOn}. ${assignment.context}`);
  }

  const signedIn = session.state === "owner";
  const canReview = signedIn && session.stepUpComplete;
  const working = busy !== null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Claude — Second Eyes, independent review"
          title="Claude — Second Eyes"
          className="relative shrink-0"
        >
          <Eye className="h-5 w-5" />
          <span
            aria-hidden="true"
            className={`absolute bottom-1 right-1 h-2 w-2 rounded-full border ${TONE_CLASS[tone]}`}
          />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        data-canx-no-capture="true"
        className="flex w-full max-w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="text-base">Claude — Second Eyes</SheetTitle>
          <p className="text-xs text-muted-foreground">
            An independent review. Claude does not run this office, cannot approve, build, spend, send or change
            anything, and may disagree with the Office Manager. John decides.
          </p>
        </SheetHeader>

        <div className="space-y-4 p-4">
          <div className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Claude connection</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>
                {TONE_LABEL[tone]}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {checking
                ? "Checking the Claude connection…"
                : (status?.detail ?? "The Claude connection has not been checked in this panel yet.")}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void checkConnection()} disabled={checking}>
                Check again
              </Button>
              <span className="text-xs text-muted-foreground">
                Model: {status?.model ?? "not configured"}. A key on its own is never treated as a connection.
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
            <div className="text-sm font-medium text-foreground">Scope right now</div>
            <p className="mt-1">
              Current room: <strong className="text-foreground">{room}</strong> ({pathname}). A whole-office review
              instead uses a fresh read-only snapshot of the office records this app can actually read.
            </p>
          </div>

          {!canReview && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">
              {signedIn
                ? "Confirm your authenticator from the account menu before asking for a review."
                : "Sign in as the owner to ask Claude for a review."}
            </p>
          )}

          <div className="grid gap-2">
            <Button size="lg" className="h-14 justify-start gap-3" disabled={!canReview || working} onClick={() => void reviewThisRoom()}>
              {busy === "room" ? <Loader2 className="h-5 w-5 animate-spin" /> : <MonitorSmartphone className="h-5 w-5" />}
              <span className="text-left">
                <span className="block font-semibold">Review this room</span>
                <span className="block text-xs font-normal opacity-80">
                  Takes one picture of {room} now, and sends nothing if that picture fails.
                </span>
              </span>
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-14 justify-start gap-3"
              disabled={!canReview || working}
              onClick={() => void reviewWholeOffice(false)}
            >
              {busy === "office" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Building2 className="h-5 w-5" />}
              <span className="text-left">
                <span className="block font-semibold">Review whole office</span>
                <span className="block text-xs font-normal opacity-80">
                  Server-built read-only snapshot across the six office areas.
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canReview || working}
              onClick={() => void reviewWholeOffice(true)}
            >
              Review whole office, and include a picture of this page
            </Button>
          </div>

          {problem && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm">
              {problem}
            </p>
          )}

          {shared.lastReview?.ok && <ReviewResult reply={shared.lastReview} room={shared.lastRoom} />}

          <details className="rounded-lg border border-border/60 p-3">
            <summary className="cursor-pointer text-sm font-medium">Review one specific recommendation</summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">Evidence source: {evidenceSource}</p>
              {CLAUDE_ASSIGNMENTS.map((assignment) => (
                <Button
                  key={assignment.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => loadAssignment(assignment)}
                >
                  Load: {assignment.label}
                </Button>
              ))}
              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Textarea
                placeholder="The recommendation being reviewed"
                rows={3}
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
              />
              <Textarea
                placeholder="Evidence and context"
                rows={4}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
              <Input
                placeholder="What should Claude check?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={!canReview || working || !subject.trim() || !primary.trim()}
                onClick={() =>
                  void run("manual", {
                    subject,
                    primaryRecommendation: primary,
                    evidence,
                    question,
                  })
                }
              >
                {busy === "manual" ? "Asking Claude…" : "Ask for a second opinion"}
              </Button>
            </div>
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReviewResult({ reply, room }: { reply: ClaudeReviewReply; room: string | null }) {
  const scopeLabel =
    reply.scope === "office" ? "Whole office" : reply.scope === "room" ? `One office page — ${room ?? "unknown"}` : "One recommendation";

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{reply.reviewer}</div>
      <div className="text-xs text-muted-foreground">
        Scope: {scopeLabel} · Model: {reply.model ?? "unknown"} · Reviewed at {reply.reviewedAt}
      </div>
      <p className="text-xs text-muted-foreground">
        Kept on this device for this browser session only. It is not saved to the office records.
      </p>

      {reply.review ? (
        <>
          <div>
            <strong>Verdict:</strong> {reply.review.recommendation.replace(/_/g, " ")} ({reply.review.confidence}{" "}
            confidence)
          </div>
          {reply.review.areaFindings?.length ? (
            <div>
              <strong>By area:</strong>
              <ul className="ml-4 list-disc">
                {reply.review.areaFindings.map((item) => (
                  <li key={item.area}>
                    <span className="font-medium">{item.area}:</span> {item.finding}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <List title="Strongest reasons" items={reply.review.strongestReasons} />
          <List title="Risks and contrary evidence" items={reply.review.risks} />
          <List title="Missing or unverified evidence" items={reply.review.missingEvidence} />
          {reply.review.nextStep && (
            <div>
              <strong>Recommended next step:</strong> {reply.review.nextStep}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1">
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
            Claude did not return a complete structured review, so this is its plain reply and not a finished review.
          </p>
          <p className="whitespace-pre-wrap">{reply.text}</p>
        </div>
      )}

      <List title="What Claude did and did not receive" items={reply.coverage} />
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <strong>{title}:</strong>
      <ul className="ml-4 list-disc">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
