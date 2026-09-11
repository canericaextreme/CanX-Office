"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Check,
  GripVertical,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minus,
  Paintbrush,
  PhoneOff,
  Plus,
  Send,
  Square,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { loadTeam, teamForManager } from "@/lib/office-team";
import { getManagerStatus, managerChat, type ManagerStatus, type ManagerToolCall } from "@/lib/manager.functions";
import { buildOfficeContext, localBriefing } from "@/lib/office-context";
import {
  ACCENT_LABELS,
  THEME_FIELDS,
  useOfficeTheme,
  type AccentName,
  type DensityName,
  type MotionName,
  type SurfaceLevel,
} from "@/lib/office-theme";
import { PROVENANCE_LABELS, loadNotes, saveNotes, type OfficeNote } from "@/lib/office-notes";
import { useOwnerSession } from "@/lib/owner-session";
import { useDictation, useReadAloud } from "@/lib/use-speech";
import { forSpeech, isAffirmative, isNegative, spokenSummary } from "@/lib/voice-summary";
import { deleteSharedNote, listSharedNotes, saveSharedNotes } from "@/lib/records.functions";
import { useDraggablePanel } from "@/lib/use-draggable-panel";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "office";
  content: string;
  toolCalls?: ManagerToolCall[];
}

type Tab = "manager" | "appearance" | "notes";

export function OfficeManager() {
  const [open, setOpen] = useState(false);
  /** Shrinks the window to a small floating control; the conversation stays live. */
  const [minimized, setMinimized] = useState(false);
  const [tab, setTab] = useState<Tab>("manager");
  const [status, setStatus] = useState<ManagerStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<OfficeNote[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const voiceModeRef = useRef(false);
  const mutedRef = useRef(false);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => undefined);
  const lastAnswerRef = useRef<{ id: string; text: string } | null>(null);
  /** The full Manager panel can be dragged by its handle so it never blocks top buttons. */
  const panel = useDraggablePanel({ initial: { right: 16, bottom: 80 } });
  voiceModeRef.current = voiceMode;
  mutedRef.current = muted;

  /** Full text of an answer that was summarised aloud, waiting for a yes. */
  const pendingFullRef = useRef<{ id: string; text: string } | null>(null);
  const [awaitingReadMore, setAwaitingReadMore] = useState(false);
  const speakingRef = useRef(false);
  const listeningRef = useRef(false);
  const bargeInRef = useRef<((heard: string) => void) | null>(null);
  /** What the Manager is saying, so its own voice is not mistaken for John's. */
  const spokenTextRef = useRef("");

  const dictation = useDictation({
    onFinal: (heard: string) =>
      setDraft((current) => (current.trim() ? `${current.trim()} ${heard}` : heard)),
    onPause: () => {
      if (voiceModeRef.current) void sendRef.current();
    },
    // Barge-in: as soon as John speaks, the Manager stops talking and listens.
    onSpeechStart: (heard: string) => bargeInRef.current?.(heard),
  });
  const readAloud = useReadAloud();
  speakingRef.current = readAloud.speakingId !== null;
  listeningRef.current = dictation.listening;
  bargeInRef.current = (heard: string) => {
    if (!speakingRef.current) return;
    const words = heard.trim().split(/\s+/).filter(Boolean);
    // Ignore one or two stray words, and ignore the Manager's own words coming
    // back through the microphone — otherwise it cuts itself off mid-sentence.
    if (words.length < 3) return;
    const echo = spokenTextRef.current;
    if (echo && echo.includes(heard.trim().toLowerCase())) return;
    readAloud.stop();
  };

  /** Speak an answer, remembering the words so echo does not trigger barge-in. */
  const speakAnswer = (id: string, text: string, onDone?: () => void) => {
    spokenTextRef.current = text.toLowerCase().replace(/\s+/g, " ");
    readAloud.speak(id, text, () => {
      spokenTextRef.current = "";
      onDone?.();
    });
  };

  const fetchStatus = useServerFn(getManagerStatus);
  const sendChat = useServerFn(managerChat);
  const listShared = useServerFn(listSharedNotes);
  const pushShared = useServerFn(saveSharedNotes);
  const dropShared = useServerFn(deleteSharedNote);
  const session = useOwnerSession();
  const token = session.accessToken ?? "";
  const shared = session.shared;
  const context = useMemo(() => buildOfficeContext(), []);

  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  // When the owner is signed in, the shared account is the source of truth.
  useEffect(() => {
    if (!shared) return;
    void listShared({ data: { accessToken: token } })
      .then((result) => {
        if (result.ok && result.data) setNotes(result.data);
      })
      .catch(() => undefined);
  }, [shared, token, listShared]);

  // Re-check the manager whenever the sign-in state changes.
  useEffect(() => {
    setStatus(null);
  }, [session.state]);

  useEffect(() => {
    if (!open || status) return;
    void fetchStatus({ data: { accessToken: token } })
      .then(setStatus)
      .catch(() =>
        setStatus({
          provider: "none",
          connected: false,
          state: "auth_unavailable",
          authReady: false,
          keyPresent: false,
          modelConfigured: false,
          verified: false,
          model: null,
          detail: "The office could not reach its own server to check the manager's connection.",
        }),
      );
  }, [open, status, fetchStatus, token]);

  useEffect(() => {
    if (open && !minimized) inputRef.current?.focus();
  }, [open, minimized, tab]);

  // Closing the panel always ends Voice Mode: the microphone never stays on.
  useEffect(() => {
    if (open) return;
    voiceModeRef.current = false;
    setVoiceMode(false);
    setMuted(false);
    dictation.stop();
    readAloud.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  const addNote = useCallback(
    (note: OfficeNote) => {
      setNotes((current) => {
        const next = [note, ...current];
        saveNotes(next);
        return next;
      });
      if (shared) void pushShared({ data: { accessToken: token, notes: [note] } }).catch(() => undefined);
    },
    [shared, token, pushShared],
  );

  const removeNote = useCallback(
    (id: string) => {
      setNotes((current) => {
        const next = current.filter((note) => note.id !== id);
        saveNotes(next);
        return next;
      });
      if (shared) void dropShared({ data: { accessToken: token, id } }).catch(() => undefined);
    },
    [shared, token, dropShared],
  );

  /** Explicit, additive merge. Nothing on either side is overwritten silently. */
  const mergeDeviceRecords = useCallback(async () => {
    if (!shared) return;
    const deviceNotes = loadNotes();
    if (!deviceNotes.length) return;
    const result = await pushShared({ data: { accessToken: token, notes: deviceNotes } }).catch(() => null);
    if (result?.ok) {
      const refreshed = await listShared({ data: { accessToken: token } }).catch(() => null);
      if (refreshed?.ok && refreshed.data) setNotes(refreshed.data);
    }
  }, [shared, token, pushShared, listShared]);

  const send = async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || busy) return;

    // A plain yes or no answers "shall I read the rest?" without going to the
    // provider at all — nothing is spent and nothing is approved by it.
    const pending = pendingFullRef.current;
    if (voiceModeRef.current && pending) {
      if (isAffirmative(text)) {
        pendingFullRef.current = null;
        setAwaitingReadMore(false);
        setDraft("");
        dictation.stop();
        speakAnswer(pending.id, pending.text, resumeListening);
        return;
      }
      if (isNegative(text)) {
        pendingFullRef.current = null;
        setAwaitingReadMore(false);
        setDraft("");
        resumeListening();
        return;
      }
      pendingFullRef.current = null;
      setAwaitingReadMore(false);
    }

    // In Voice Mode the microphone pauses while the Manager thinks.
    if (voiceModeRef.current) dictation.stop();
    setError(null);
    const userMessage: ChatMessage = { id: `m-${Date.now()}`, role: "user", content: text };
    const history = [...messages, userMessage];
    setMessages(history);
    setDraft("");
    setBusy(true);
    try {
      const reply = await sendChat({
        data: {
          accessToken: token,
          team: teamForManager(loadTeam()),
          messages: history
            .filter((m) => m.role !== "office")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        },
      });
      if (!reply.ok) {
        setError(
          reply.code === "auth_not_ready"
            ? "The manager cannot answer: there is no owner sign-in with MFA yet, so paid AI calls are blocked. No request was sent to any provider."
            : reply.code === "not_configured"
              ? "The manager has no AI connection yet, so there is no answer to give. See the setup note below."
              : reply.code === "limit_blocked"
                ? (reply.detail ?? "The request was refused by the office's own spending and rate limits.")
                : reply.code === "health_check_failed"
                  ? (reply.detail ?? "The live check of the AI connection did not pass, so nothing was asked.")
                  : reply.code === "context_unavailable"
                    ? (reply.detail ?? "The office records could not be read just now, so nothing was asked.")
                  : (reply.detail ?? "The AI request could not be completed."),
        );
        if (voiceModeRef.current) resumeListening();
      } else {
        const answerId = `m-${Date.now()}-a`;
        const answer = reply.text || "(The provider returned an empty answer.)";
        lastAnswerRef.current = { id: answerId, text: answer };
        setMessages((current) => [
          ...current,
          { id: answerId, role: "assistant", content: answer, toolCalls: reply.toolCalls },
        ]);
        // A real task change — typed or spoken — reloads the Work Board.
        const changedWork = (reply.toolCalls ?? []).some((call) =>
          ["create_task", "assign_task", "verify_task", "request_approval"].includes(call.name),
        );
        if (changedWork && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
        }
        if (voiceModeRef.current) {
          if (mutedRef.current) {
            resumeListening();
          } else {
            // Short spoken summary by default; the full text stays on screen.
            const shaped = spokenSummary(answer);
            pendingFullRef.current = shaped.truncated ? { id: answerId, text: shaped.full } : null;
            setAwaitingReadMore(shaped.truncated);
            // Listening stays on while it speaks, so John can interrupt.
            resumeListening(0);
            speakAnswer(answerId, shaped.spoken || answer, resumeListening);
          }
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be completed.");
      if (voiceModeRef.current) resumeListening();
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };
  sendRef.current = send;

  /**
   * Voice Mode keeps the microphone open. It is started alongside the spoken
   * answer (delay 0) so John can interrupt, and again once speaking ends.
   */
  function resumeListening(delay = 300) {
    if (!voiceModeRef.current) return;
    setTimeout(() => {
      if (voiceModeRef.current && !listeningRef.current) dictation.start();
    }, delay);
  }

  const startVoiceMode = () => {
    setVoiceMode(true);
    voiceModeRef.current = true;
    setError(null);
    dictation.start();
  };

  const endVoiceMode = () => {
    setVoiceMode(false);
    voiceModeRef.current = false;
    pendingFullRef.current = null;
    setAwaitingReadMore(false);
    dictation.stop();
    readAloud.stop();
  };

  const repeatAnswer = () => {
    const last = lastAnswerRef.current;
    if (!last) return;
    dictation.stop();
    speakAnswer(last.id, forSpeech(last.text), resumeListening);
  };


  const briefing = () => {
    setMessages((current) => [
      ...current,
      {
        id: `b-${Date.now()}`,
        role: "office",
        content: localBriefing(context, {
          databaseConnected: session.state === "owner",
          managerVerified: status?.verified === true,
        }).join("\n"),
      },
    ]);
  };

  // Plain words for the small floating control, so the state is never a colour alone.
  const liveState = busy
    ? "Thinking…"
    : readAloud.speakingId !== null
      ? "Speaking…"
      : dictation.listening
        ? "Listening…"
        : voiceMode
          ? "Voice Mode on — paused"
          : "Office Manager";

  return (
    <>
      {!(open && minimized) && (
        <Button
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="office-manager-panel"
          className="fixed bottom-4 right-4 z-40 h-12 rounded-full px-5 shadow-lg"
        >
          {open ? <X className="mr-1.5 h-4 w-4" /> : <Bot className="mr-1.5 h-4 w-4" />}
          Office Manager
        </Button>
      )}

      {open && minimized && (
        <div
          aria-label="Office Manager, minimised"
          className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-2xl"
        >
          <Bot className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span role="status" aria-live="polite" className="truncate text-sm font-medium text-foreground">
            {liveState}
          </span>
          {voiceMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            >
              {dictation.listening ? (
                <>
                  <Square className="mr-1.5 h-3.5 w-3.5" /> Stop
                </>
              ) : (
                <>
                  <Mic className="mr-1.5 h-3.5 w-3.5" /> Listen
                </>
              )}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8" onClick={() => setMinimized(false)}>
            <Maximize2 className="mr-1.5 h-3.5 w-3.5" /> Open
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Close the Office Manager"
            onClick={() => {
              setMinimized(false);
              setOpen(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {open && (
        <aside
          ref={panel.ref as React.RefObject<HTMLElement>}
          id="office-manager-panel"
          aria-label="Office Manager"
          hidden={minimized}
          style={panel.style}
          className={`fixed z-40 ${
            minimized ? "hidden" : "flex"
          } max-h-[78vh] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl`}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-border bg-secondary/60 p-2">
            <div
              {...panel.handleProps}
              className="mr-1 flex cursor-move touch-none select-none items-center rounded-md p-1.5 text-muted-foreground hover:bg-background active:bg-secondary"
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
            </div>
            {(["manager", "appearance", "notes"] as Tab[]).map((name) => (
              <button
                key={name}
                onClick={() => setTab(name)}
                aria-current={tab === name}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                  tab === name ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-background"
                }`}
              >
                {name === "notes" ? `Saved (${notes.length})` : name}
              </button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8"
              onClick={() => setMinimized(true)}
              aria-label="Minimise the Office Manager to a small floating control"
            >
              <Minus className="mr-1.5 h-4 w-4" /> Minimise
            </Button>
          </div>


          {tab === "manager" && (
            <>
              <div className="shrink-0 border-b border-border px-3 py-2 text-xs">
                {status === null ? (
                  <span className="text-muted-foreground">Checking the connection…</span>
                ) : (
                  <span className={status.connected ? "text-foreground" : "text-muted-foreground"}>
                    <span
                      className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                        status.connected ? "bg-emerald-500" : status.state === "auth_unavailable" ? "bg-red-500" : "bg-amber-500"
                      }`}
                      aria-hidden="true"
                    />
                    {status.connected
                      ? `AI connected — OpenAI (${status.model}).`
                      : status.state === "auth_unavailable"
                        ? status.keyPresent
                          ? "AI blocked — a key is present but unusable without verified owner sign-in with two-step verification. Nothing here is an AI answer."
                          : "AI not connected — verified owner sign-in with two-step verification is required first. Nothing here is an AI answer."
                        : status.state === "configured_unverified"
                          ? "AI configured but unverified — no live check has passed. Nothing here is an AI answer."
                          : "AI not connected. Nothing here is an AI answer."}
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Ask about today's priorities, the sample records in the office, or how the rooms fit together. The
                    manager can also suggest an appearance change or a task for you to save — it cannot run anything,
                    spend anything, or touch another project.
                  </p>
                )}
                {messages.map((message) => (
                  <div key={message.id} className={message.role === "user" ? "text-right" : ""}>
                    {message.role !== "user" && (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {message.role === "office"
                          ? "Office briefing — written by this app, not by AI"
                          : "Office Manager — OpenAI"}
                      </p>
                    )}
                    <div
                      className={
                        message.role === "user"
                          ? "inline-block max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-left text-sm text-primary-foreground"
                          : "whitespace-pre-wrap text-sm text-foreground"
                      }
                    >
                      {message.content}
                    </div>
                    {message.role !== "user" && readAloud.supported && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1 h-7 px-2 text-xs"
                        aria-label={
                          readAloud.speakingId === message.id ? "Stop reading this answer aloud" : "Read this answer aloud"
                        }
                        onClick={() =>
                          readAloud.speakingId === message.id
                            ? readAloud.stop()
                            : speakAnswer(message.id, forSpeech(message.content))
                        }
                      >
                        {readAloud.speakingId === message.id ? (
                          <>
                            <Square className="mr-1.5 h-3.5 w-3.5" /> Stop reading
                          </>
                        ) : (
                          <>
                            <Volume2 className="mr-1.5 h-3.5 w-3.5" /> Read aloud
                          </>
                        )}
                      </Button>
                    )}
                    {message.toolCalls?.map((call, index) => (
                      <ProposalCard
                        key={`${message.id}-${index}`}
                        call={call}
                        onSaveNote={addNote}
                        onOpenAppearance={() => setTab("appearance")}
                      />
                    ))}
                  </div>
                ))}
                {busy && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking…
                  </p>
                )}
                {error && (
                  <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm">
                    <p className="text-foreground">{error}</p>
                    {status && !status.connected && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        A provider key on its own will not switch this on. Live AI needs verified owner sign-in with
                        MFA, plus request-rate and spending limits, and a live connection check that actually passes.
                        The steps are in <code>docs/office-manager-setup.md</code>.
                      </p>
                    )}
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="shrink-0 border-t border-border p-2">
                <Textarea
                  ref={inputRef}
                  rows={2}
                  value={draft}
                  placeholder="Ask the Office Manager…"
                  aria-label="Message the Office Manager"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => void send()} disabled={busy || !draft.trim()}>
                    <Send className="mr-1.5 h-4 w-4" /> Send
                  </Button>
                  {!dictation.supported ? (
                    <Button size="sm" variant="outline" disabled aria-label="Voice Mode is not available in this browser">
                      <MicOff className="mr-1.5 h-4 w-4" /> Talk
                    </Button>
                  ) : !voiceMode ? (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Talk — start Voice Mode and speak with the Office Manager"
                      onClick={startVoiceMode}
                    >
                      <Mic className="mr-1.5 h-4 w-4" /> Talk
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" aria-label="End Voice Mode" onClick={endVoiceMode}>
                      <PhoneOff className="mr-1.5 h-4 w-4" /> End Voice Mode
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={briefing}>
                    Office briefing
                  </Button>
                  <Link to="/round-table" className="ml-auto text-xs text-primary underline">
                    Monday round table
                  </Link>
                </div>

                {voiceMode && (
                  <div className="mt-2 rounded-lg border border-border bg-secondary/50 p-2.5">
                    <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs font-semibold text-foreground">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          busy ? "bg-amber-500" : readAloud.speakingId ? "bg-sky-500" : dictation.listening ? "bg-red-500" : "bg-muted-foreground"
                        }`}
                        aria-hidden="true"
                      />
                      {busy
                        ? "Thinking… the Manager is working on your answer."
                        : readAloud.speakingId
                          ? "Speaking… reading the answer aloud."
                          : dictation.listening
                            ? "Listening… speak now, then pause and it will be sent."
                            : "Voice Mode is on, but the microphone is stopped. Press Start listening."}
                    </p>
                    {(dictation.interim || draft) && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Heard so far: {draft}
                        {dictation.interim ? ` ${dictation.interim}` : ""}
                      </p>
                    )}
                    {awaitingReadMore && (
                      <p className="mt-1.5 text-xs text-foreground">
                        Only a short summary was read aloud. Say “yes” to hear the rest, or just ask your next
                        question. The full answer is written above.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {dictation.listening ? (
                        <Button size="sm" variant="outline" aria-label="Stop listening" onClick={dictation.stop}>
                          <Square className="mr-1.5 h-4 w-4" /> Stop listening
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" aria-label="Start listening again" onClick={dictation.start}>
                          <Mic className="mr-1.5 h-4 w-4" /> Start listening
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        aria-pressed={muted}
                        aria-label={muted ? "Unmute spoken answers" : "Mute spoken answers"}
                        onClick={() => {
                          const next = !muted;
                          setMuted(next);
                          mutedRef.current = next;
                          if (next) readAloud.stop();
                        }}
                      >
                        {muted ? <VolumeX className="mr-1.5 h-4 w-4" /> : <Volume2 className="mr-1.5 h-4 w-4" />}
                        {muted ? "Unmute" : "Mute"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label="Repeat the last answer aloud"
                        disabled={!lastAnswerRef.current}
                        onClick={repeatAnswer}
                      >
                        <Volume2 className="mr-1.5 h-4 w-4" /> Repeat answer
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      No recording is kept — only the written conversation above. Speaking never approves anything:
                      yellow actions still wait for your approval and red actions still stop.
                    </p>
                  </div>
                )}

                {dictation.error && (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    {dictation.error}
                  </p>
                )}
                {!dictation.supported && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Voice Mode is not available in this browser, so please type your message and use Send. Chrome, Edge
                    and Safari support it.
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "appearance" && <AppearancePanel />}

          {tab === "notes" && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {shared
                    ? "Saved to your CanX account, so these appear on any device you sign in on."
                    : "Saved on this device only, until you sign in to a CanX-owned account."}
                </p>
                {shared && (
                  <Button size="sm" variant="outline" onClick={() => void mergeDeviceRecords()}>
                    Copy this device's records into the CanX account
                  </Button>
                )}
              </div>
              {notes.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet.</p>}
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{note.title}</p>
                      {note.detail && <p className="mt-1 text-sm text-muted-foreground">{note.detail}</p>}
                      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {note.kind} · {note.owner || "no owner"} · {PROVENANCE_LABELS[note.provenance]}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${note.title}`} onClick={() => removeNote(note.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      )}
    </>
  );
}

function ProposalCard({
  call,
  onSaveNote,
  onOpenAppearance,
}: {
  call: ManagerToolCall;
  onSaveNote: (note: OfficeNote) => void;
  onOpenAppearance: () => void;
}) {
  const { preview } = useOfficeTheme();
  const [done, setDone] = useState(false);

  if (call.name === "preview_appearance") {
    return (
      <div className="mt-2 rounded-lg border border-border bg-secondary/50 p-2.5 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appearance suggestion</p>
        <p className="mt-1 text-sm text-foreground">
          {typeof call.arguments["reason"] === "string" ? call.arguments["reason"] : "A look-and-feel change."}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => {
            preview(call.arguments as never);
            onOpenAppearance();
          }}
        >
          <Paintbrush className="mr-1.5 h-4 w-4" /> Preview it
        </Button>
      </div>
    );
  }

  if (call.name === "propose_task") {
    const title = typeof call.arguments["title"] === "string" ? call.arguments["title"] : "";
    if (!title) return null;
    return (
      <div className="mt-2 rounded-lg border border-border bg-secondary/50 p-2.5 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proposed for your list</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{title}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={done}
          onClick={() => {
            onSaveNote({
              id: `n-${Date.now()}`,
              kind: call.arguments["kind"] === "decision" ? "decision" : "task",
              title,
              detail: typeof call.arguments["detail"] === "string" ? call.arguments["detail"] : "",
              owner: typeof call.arguments["owner"] === "string" ? call.arguments["owner"] : "",
              provenance: "ai-proposal",
              source: "Office Manager (AI proposal)",
              createdAt: new Date().toISOString(),
            });
            setDone(true);
          }}
        >
          {done ? <Check className="mr-1.5 h-4 w-4" /> : <Plus className="mr-1.5 h-4 w-4" />}
          {done ? "Saved" : "Save it"}
        </Button>
      </div>
    );
  }

  return null;
}

function AppearancePanel() {
  const { theme, dirty, canUndo, preview, apply, discard, undo, reset } = useOfficeTheme();

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <p className="text-xs text-muted-foreground">
        These are the only appearance settings anything in this office can change, and they stay on this device.
      </p>

      <Group label="Surface">
        <div className="flex flex-wrap gap-2">
          {THEME_FIELDS.surface.options.map((value: SurfaceLevel) => (
            <Choice key={value} active={theme.surface === value} onClick={() => preview({ surface: value })}>
              {value}
            </Choice>
          ))}
        </div>
      </Group>

      <Group label={`Panel transparency — ${theme.transparency}%`}>
        <Slider
          value={[theme.transparency]}
          min={0}
          max={80}
          step={5}
          aria-label="Panel transparency"
          onValueChange={(values) => preview({ transparency: values[0] ?? theme.transparency })}
        />
      </Group>

      <Group label="Accent">
        <div className="flex flex-wrap gap-2">
          {THEME_FIELDS.accent.options.map((value: AccentName) => (
            <Choice key={value} active={theme.accent === value} onClick={() => preview({ accent: value })}>
              {ACCENT_LABELS[value]}
            </Choice>
          ))}
        </div>
      </Group>

      <Group label="Text density">
        <div className="flex flex-wrap gap-2">
          {THEME_FIELDS.density.options.map((value: DensityName) => (
            <Choice key={value} active={theme.density === value} onClick={() => preview({ density: value })}>
              {value}
            </Choice>
          ))}
        </div>
      </Group>

      <Group label="Movement">
        <div className="flex flex-wrap gap-2">
          {THEME_FIELDS.motion.options.map((value: MotionName) => (
            <Choice key={value} active={theme.motion === value} onClick={() => preview({ motion: value })}>
              {value === "full" ? "Gentle movement" : "No movement"}
            </Choice>
          ))}
        </div>
      </Group>

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" onClick={apply} disabled={!dirty}>
          Apply
        </Button>
        <Button size="sm" variant="outline" onClick={discard} disabled={!dirty}>
          Cancel preview
        </Button>
        <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo}>
          <Undo2 className="mr-1.5 h-4 w-4" /> Undo
        </Button>
        <Button size="sm" variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>
      {dirty && <p className="text-xs text-muted-foreground">Previewing — nothing is kept until you press Apply.</p>}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
