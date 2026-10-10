import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { claudeOfficeChat, type ManagerReply } from "@/lib/manager.functions";
import { currentBuildVersion } from "@/lib/office-health";
import { Button } from "@/components/ui/button";

type Message = { role: "user" | "assistant"; content: string };
type Conversation = { ownerId: string; messages: Message[]; draft: string; pending?: boolean };
const keyFor = (ownerId: string) => `canx-claude-conversation:${ownerId}`;

/** Tab-local recovery only. Shared memory still needs the server's saved readback. */
function restore(ownerId: string): Conversation {
  const empty = { ownerId, messages: [], draft: "" };
  try {
    const raw = window.sessionStorage.getItem(keyFor(ownerId));
    if (!raw || raw.length > 140_000) return empty;
    const value = JSON.parse(raw);
    if (!Array.isArray(value.messages) || typeof value.draft !== "string") return empty;
    const messages = value.messages
      .filter(
        (m: Message) =>
          m && ["user", "assistant"].includes(m.role) && typeof m.content === "string",
      )
      .slice(-20)
      .map((m: Message) => ({ role: m.role, content: m.content.slice(0, 6000) }));
    return {
      ownerId,
      messages,
      draft: value.draft.slice(0, 6000),
      pending: value.pending === true,
    };
  } catch {
    return empty;
  }
}

export function ClaudeOfficeChatPanel() {
  const session = useOwnerSession();
  const ask = useServerFn(claudeOfficeChat);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<ManagerReply | null>(null);
  const [problem, setProblem] = useState("");
  const [recovery, setRecovery] = useState("");
  const inFlight = useRef(false);
  const currentOwner = useRef(session.ownerId);
  currentOwner.current = session.signedIn ? session.ownerId : null;

  useEffect(() => {
    setReply(null);
    setProblem("");
    setRecovery("");
    setConversation(session.signedIn && session.ownerId ? restore(session.ownerId) : null);
    const refresh = (event: Event) => {
      const next = (event as CustomEvent<Conversation>).detail;
      if (session.signedIn && next?.ownerId === session.ownerId) setConversation(next);
    };
    window.addEventListener("canx-claude-reply", refresh);
    return () => window.removeEventListener("canx-claude-reply", refresh);
  }, [session.ownerId, session.signedIn]);

  useEffect(() => {
    if (!conversation || !session.signedIn || conversation.ownerId !== session.ownerId) return;
    try {
      window.sessionStorage.setItem(
        keyFor(conversation.ownerId),
        JSON.stringify({
          messages: conversation.messages,
          draft: conversation.draft,
          pending: conversation.pending === true,
        }),
      );
      setRecovery("");
    } catch {
      setRecovery(
        "This tab could not keep a recovery copy. Keep your message here until the reply is confirmed.",
      );
    }
  }, [conversation, session.ownerId, session.signedIn]);

  const active =
    conversation?.ownerId === session.ownerId && session.signedIn ? conversation : null;
  const draft = active?.draft ?? "";
  const blocked = !session.signedIn
    ? "Sign in to the Office to send a message."
    : !session.stepUpComplete
      ? "Complete owner verification in the Office to send a message."
      : !session.accessToken || !active
        ? "Your Office session is getting ready. Your message has not been sent."
        : "";
  const pending = active?.pending === true;

  function retain(next: Conversation) {
    try {
      window.sessionStorage.setItem(
        keyFor(next.ownerId),
        JSON.stringify({
          messages: next.messages,
          draft: next.draft,
          pending: next.pending === true,
        }),
      );
    } catch {
      /* The storage effect reports recovery failures. */
    }
    if (currentOwner.current === next.ownerId) setConversation(next);
    window.dispatchEvent(new CustomEvent("canx-claude-reply", { detail: next }));
  }

  async function send() {
    if (inFlight.current || pending || blocked || !active || !draft.trim()) return;
    const ownerId = active.ownerId;
    const user: Message = { role: "user", content: draft.trim() };
    const messages = [...active.messages.slice(-18), user];
    inFlight.current = true;
    setBusy(true);
    setProblem("");
    setReply(null);
    retain({ ...active, pending: true });
    try {
      const result = await ask({
        data: {
          accessToken: session.accessToken!,
          messages,
          currentRoute: "/build-testing",
          buildId: currentBuildVersion(),
        },
      });
      if (!result.ok) {
        retain({ ...active, pending: false });
        if (currentOwner.current !== ownerId) return;
        setReply(result);
        setProblem(
          result.detail ||
            result.text ||
            "Claude could not finish. Your message is still here; nothing was resent automatically.",
        );
        return;
      }
      const answer: Message = {
        role: "assistant",
        content: (result.text || "The Office returned action results below.").slice(0, 6000),
      };
      retain({ ownerId, draft: "", messages: [...messages, answer].slice(-20), pending: false });
      if (currentOwner.current === ownerId) setReply(result);
    } catch {
      if (currentOwner.current === ownerId)
        setProblem(
          "The reply could not be confirmed. Your message is still here. If it asked for a build or another action, check the Work Board and build status before sending it again.",
        );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-label="Claude Office conversation" className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Talk to Claude in the Office</h3>
      <p className="text-sm">
        Keep messages and follow-ups here. Claude uses the Office's records and action tools.
        Existing owner verification and budget limits apply; Office API use is separate from Claude
        Pro.
      </p>
      <p className="text-sm text-muted-foreground">
        This conversation stays in this browser tab when you change rooms or refresh. Shared recent
        memory is confirmed separately below. External Claude browser chats are separate and are not
        imported automatically.
      </p>
      {active && active.messages.length > 0 && (
        <div
          role="log"
          aria-label="Claude Office messages"
          className="max-h-80 space-y-3 overflow-y-auto"
        >
          {active.messages.map((message, index) => (
            <div key={index} className="rounded border p-3 text-sm">
              <p className="font-medium">{message.role === "user" ? "You" : "Claude"}</p>
              <p className="whitespace-pre-wrap">{message.content}</p>
            </div>
          ))}
        </div>
      )}
      <label className="block" htmlFor="claude-office-message">
        Message to Claude
      </label>
      <textarea
        id="claude-office-message"
        className="min-h-28 w-full rounded border bg-background p-3"
        maxLength={6000}
        value={draft}
        disabled={!active || busy || pending}
        onChange={(event) => active && setConversation({ ...active, draft: event.target.value })}
      />
      <Button disabled={!!blocked || pending || busy || !draft.trim()} onClick={() => void send()}>
        {busy ? "Waiting for Claude…" : "Send message to Claude"}
      </Button>
      {pending && !busy && (
        <div role="status">
          <p>
            An earlier message has no confirmed reply. Check the Work Board and Claude build status
            before sending it again.
          </p>
          <Button variant="outline" onClick={() => active && retain({ ...active, pending: false })}>
            I checked the status — allow another message
          </Button>
        </div>
      )}
      {blocked && <p role="status">{blocked}</p>}
      {problem && <p role="alert">{problem}</p>}
      {recovery && <p role="status">{recovery}</p>}
      {reply && (
        <div role="region" aria-label="Claude message outcome" className="space-y-2 text-sm">
          {reply.actionResults.map((action, index) => (
            <p key={index}>
              {action.name} — {action.status}: {action.detail}
            </p>
          ))}
          {reply.persisted === true ? (
            <p>Recent Office memory saved and read back.</p>
          ) : (
            <p>
              Shared recent memory was not confirmed for this reply. The tab copy is not a Brain
              archive.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
