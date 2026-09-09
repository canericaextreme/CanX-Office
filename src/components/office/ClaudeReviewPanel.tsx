"use client";

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOwnerSession } from "@/lib/owner-session";
import { requestClaudeReview, type ClaudeReviewReply } from "@/lib/claude-review.functions";
import { CLAUDE_ASSIGNMENTS, type ClaudeAssignment } from "@/lib/claude-assignments";

/**
 * Claude second eyes. Independent review only — it never speaks as the Office
 * Manager, and it is expected to disagree when the evidence warrants it.
 */
export function ClaudeReviewPanel() {
  const session = useOwnerSession();
  const ask = useServerFn(requestClaudeReview);
  const [subject, setSubject] = useState("");
  const [primaryRecommendation, setPrimary] = useState("");
  const [evidence, setEvidence] = useState("");
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<ClaudeReviewReply | null>(null);
  const [loaded, setLoaded] = useState<ClaudeAssignment | null>(null);

  function loadAssignment(assignment: ClaudeAssignment) {
    setSubject(assignment.subject);
    setPrimary(assignment.primaryRecommendation);
    setEvidence(assignment.evidence);
    setQuestion(assignment.question);
    setReply(null);
    setLoaded(assignment);
  }

  async function run(input: {
    subject: string;
    primaryRecommendation: string;
    evidence: string;
    question: string;
    activityTitle: string;
  }) {
    setBusy(true);
    // Recorded only because a real review is being submitted right now.
    const taskId = `claude-review-${Date.now()}`;
    startActivity({ taskId, title: input.activityTitle, cellId: "systems" });
    try {
      const result = await ask({
        data: {
          accessToken: session.accessToken ?? "",
          subject: input.subject,
          primaryRecommendation: input.primaryRecommendation,
          evidence: input.evidence,
          question: input.question,
        },
      });
      setReply(result);
      finishActivity(
        taskId,
        result.ok ? "completed" : "failed",
        result.ok ? "Claude returned an independent review." : (result.detail ?? "The review did not complete."),
      );
    } catch {
      setReply(null);
      finishActivity(taskId, "failed", "The review request did not complete.");
    } finally {
      setBusy(false);
    }
  }

  async function runAssignment(assignment: ClaudeAssignment) {
    loadAssignment(assignment);
    await run({
      subject: assignment.subject,
      primaryRecommendation: assignment.primaryRecommendation,
      evidence: assignment.evidence,
      question: assignment.question,
      activityTitle: `Claude second eyes — ${assignment.subject}`,
    });
  }

  async function submit() {
    await run({
      subject,
      primaryRecommendation,
      evidence,
      question,
      activityTitle: `Claude second eyes — ${subject || "untitled review"}`,
    });
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">Claude — second eyes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          An independent review of a recommendation you have already made. Claude does not run the office, cannot
          authorise a build or any spending, and may disagree with the Office Manager.
        </p>
        {CLAUDE_ASSIGNMENTS.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border/50 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prepared reviews — written by John, not yet sent
            </div>
            {CLAUDE_ASSIGNMENTS.map((assignment) => (
              <div key={assignment.id} className="space-y-1.5">
                <div className="text-sm font-medium">{assignment.label}</div>
                <div className="text-xs text-muted-foreground">{assignment.context}</div>
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {assignment.boundaries.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy} onClick={() => runAssignment(assignment)}>
                    {busy ? "Asking Claude…" : "Run this review now"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => loadAssignment(assignment)}>
                    Load without sending
                  </Button>
                </div>
              </div>
            ))}
            {loaded && (
              <p className="text-xs text-muted-foreground">
                Loaded “{loaded.label}”. “Load without sending” changes nothing outside this page; “Run this review now”
                sends it to Claude using your signed-in, two-step-verified session.
              </p>
            )}
          </div>
        )}

        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          placeholder="The recommendation being reviewed"
          value={primaryRecommendation}
          onChange={(e) => setPrimary(e.target.value)}
          rows={3}
        />
        <Textarea
          placeholder="Evidence and context"
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          rows={4}
        />
        <Input placeholder="What should Claude check?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <Button onClick={submit} disabled={busy || !subject.trim() || !primaryRecommendation.trim()}>
          {busy ? "Asking Claude…" : "Ask for a second opinion"}
        </Button>

        {reply && !reply.ok && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-sm">
            {reply.detail ?? "The review could not be completed."}
          </p>
        )}

        {reply?.ok && (
          <div className="space-y-2 rounded-lg border border-border/50 p-3 text-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{reply.reviewer}</div>
            {reply.review ? (
              <>
                <div>
                  <strong>Verdict:</strong> {reply.review.recommendation.replace(/_/g, " ")} ({reply.review.confidence}{" "}
                  confidence)
                </div>
                <ReviewList title="Strongest reasons" items={reply.review.strongestReasons} />
                <ReviewList title="Risks and contrary evidence" items={reply.review.risks} />
                <ReviewList title="Missing evidence" items={reply.review.missingEvidence} />
                {reply.review.nextStep && (
                  <div>
                    <strong>Suggested next step:</strong> {reply.review.nextStep}
                  </div>
                )}
              </>
            ) : (
              <p className="whitespace-pre-wrap">{reply.text}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
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
