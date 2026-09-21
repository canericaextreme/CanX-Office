import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOwnerSession } from "@/lib/owner-session";
import { ESTIMATED_CENTS_BY_SCOPE, requestClaudeReview } from "@/lib/claude-review.functions";
import { rememberReview, openSecondEyes } from "@/lib/second-eyes";

/** The owner's direct click approves one review, never a credit purchase or limit increase. */
export function ClaudeSpendApproval() {
  const session = useOwnerSession();
  const review = useServerFn(requestClaudeReview);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState("");
  const reservation = `C$${(ESTIMATED_CENTS_BY_SCOPE.office / 100).toFixed(2)}`;
  const run = async () => {
    if (lock.current || !session.stepUpComplete) return;
    if (!session.accessToken) {
      setNotice("Your session isn't ready yet. Try refreshing the page, then approve the review again.");
      return;
    }
    lock.current = true;
    setBusy(true); setNotice(null); setIncomplete("");
    try {
      const result = await review({data:{
        accessToken: session.accessToken,
        scope: "office",
        subject: "Whole CanX Office — owner-approved Second Eyes review",
        primaryRecommendation: "The office is ready for reliable daily use. Challenge this claim with evidence; do not change anything.",
        evidence: "Use the fresh read-only office snapshot built by the server. Do not assume a control works because it is visible.",
        question: `Review all six office areas. Identify gaps, risks and unverified behavior, especially Data voice, conversation saving and approvals. Do not claim to have tested live audio. Owner's additional instructions: ${instructions.trim().slice(0,4000)}`,
      }});
      if (result.ok && result.structuredComplete) {
        rememberReview(result, "Approvals");
        setNotice("Claude completed the review. Its findings are open in Second Eyes.");
        openSecondEyes();
      } else {
        setNotice(result.detail ?? "Claude did not complete this review.");
        if (result.code === "incomplete_response") setIncomplete(result.text);
      }
      window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
    } catch {
      setNotice("The result could not be confirmed. No automatic retry was made. Check Second Eyes before approving another paid attempt.");
    } finally { lock.current = false; setBusy(false); }
  };
  return <Card className="mt-4 border-canx-yellow/60 bg-card">
    <CardHeader><CardTitle className="text-base">Claude Second Eyes — one review</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <p className="text-sm text-muted-foreground">Approve one read-only whole-office review. The existing AI budget reserves {reservation}; this is an estimate, not a guaranteed provider charge. Claude cannot change the office or approve spending.</p>
      <Textarea aria-label="Instructions for Claude's office review" placeholder="Anything you want Claude to check (optional)" maxLength={4000} value={instructions} onChange={event => setInstructions(event.target.value)} />
      <Button className="border border-canx-yellow bg-canx-yellow text-black hover:bg-canx-yellow/80" disabled={busy || !session.stepUpComplete} onClick={() => void run()}>
        {busy ? "Claude is reviewing…" : `Approve and run one review — reserve ${reservation}`}
      </Button>
      {!session.stepUpComplete && <p className="text-sm">Confirm your authenticator in the account menu to approve this review.</p>}
      <p className="text-xs text-muted-foreground">This authorizes one Anthropic review within existing office limits. It does not buy OpenAI voice credit, raise any limit, or start recurring reviews.</p>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {incomplete && <div><p className="font-medium">Incomplete review</p><p className="whitespace-pre-wrap text-sm">{incomplete}</p></div>}
    </CardContent>
  </Card>;
}
