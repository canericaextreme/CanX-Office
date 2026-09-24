"use client";

import { recordVoiceTurn } from "@/lib/astra-voice-memory.functions";
import { VoiceTurnPairer } from "@/lib/voice-turns";
import { MemoryHealthCard } from "@/components/office/MemoryHealthCard";
import { MEMORY_NOTICE, requestsConversationSave, shouldCheckpointConversation } from "@/lib/conversation-memory";
import { saveConversationSummary } from "@/lib/conversation-summary.functions";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { captureOfficeView } from "@/lib/office-observe";
import { observeCurrentRoom } from "@/lib/manager-observe.functions";
import { parseRoomCommand, roomReportSource } from "@/lib/manager-room-commands";
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
  ShieldCheck,
  Square,
  Trash2,
  Undo2,
  Volume2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { loadTeam, teamForManager } from "@/lib/office-team";
import {
  getManagerStatus,
  managerChat,
  type ManagerStatus,
  type ManagerToolCall,
} from "@/lib/manager.functions";
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
import { speakManagerText, transcribeManagerAudio } from "@/lib/manager-voice.functions";
import { useManagerVoice } from "@/lib/use-manager-voice";
import { useRealtimeManager } from "@/lib/use-realtime-manager";
import {
  approvalSubmissionNotice,
  isAffirmative,
  isNegative,
  pendingApprovalNotice,
  spokenSummary,
} from "@/lib/voice-summary";
import { useManagerMemory } from "@/lib/use-manager-memory";
import { deleteSharedNote, listSharedNotes, saveSharedNotes } from "@/lib/records.functions";
import { useDraggablePanel } from "@/lib/use-draggable-panel";
import { useBackgroundScrollLock } from "@/lib/use-background-scroll-lock";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileOverlayShield } from "@/lib/use-mobile-overlay-shield";
import { useTranscriptScrollContainment } from "@/lib/use-transcript-scroll-containment";
import {
  HANDOFF_SOURCE_LABEL,
  HANDOFF_STATUS_LABEL,
  MANAGER_HANDOFF_EVENT,
  handoffStatusFromReply,
  newHandoffId,
  publishHandoffReceipt,
  type HandoffSource,
  type HandoffStatus,
  type ManagerHandoff,
} from "@/lib/companion-bridge";
import { ManagerRoomsPanel } from "@/components/office/ManagerRoomsPanel";
import { ManagerTeamPanel } from "@/components/office/ManagerTeamPanel";
import {
  CONSOLE_VIEWS,
  type ConsoleView,
  type RoomReview,
} from "@/lib/manager-console";

import {
  budgetScopeLines,
  modelStatusLine,
  type VerificationReceipt,
} from "@/lib/manager-verification";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "office";
  content: string;
  toolCalls?: ManagerToolCall[];
  /** What was actually read for this answer. Shown, never assumed. */
  checked?: VerificationReceipt;
}

type Tab = ConsoleView;

/** One short sentence used by the voice check with the microphone off. */
export const VOICE_CHECK_SENTENCE =
  "Voice check. If you can hear this sentence, the speaking voice works on this device.";

export function OfficeManager() {
  const router = useRouter();
  const observeRoom = useServerFn(observeCurrentRoom);
  const roomActionLock = useRef(false);
  const [open, setOpen] = useState(false);
  /** Shrinks the window to a small floating control; the conversation stays live. */
  const [minimized, setMinimized] = useState(false);
  // The office underneath stays fixed while the Astra panel is open.
  useBackgroundScrollLock(open && !minimized);
  // On phones the open panel sits inside a full-viewport layer so the office is never a touch target.
  const isMobile = useIsMobile();
  const mobileShieldActive = isMobile && open && !minimized;
  const mobileShieldRef = useMobileOverlayShield<HTMLDivElement>(mobileShieldActive);
  const [tab, setTab] = useState<Tab>("now");

  const [status, setStatus] = useState<ManagerStatus | null>(null);
  /** Exact time of the last successful connection check, in this session only. */
  const [lastCheckLabel, setLastCheckLabel] = useState<string | null>(null);
  /** Room reviews held in memory for this visit. Never stored anywhere. */
  const [roomReviews, setRoomReviews] = useState<Record<string, RoomReview | undefined>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const historyReady = true;
  const [historyStatus, setHistoryStatus] = useState(MEMORY_NOTICE);
  const [savingSummary, setSavingSummary] = useState(false);
  const savingSummaryRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const savedThroughRef = useRef(0);
  const autoAttemptThroughRef = useRef(0);
  const [autoMemory, setAutoMemory] = useState(true);
  const pendingSummaryRef = useRef<{ id: string; turns: ChatMessage[]; through: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [fullScreen, setFullScreen] = useState(false);
  const [textSize, setTextSize] = useState(20);
  const [delivery, setDelivery] = useState("");
  /** One reviewed handoff from the Office Work assistant. Session memory only. */
  const [handoff, setHandoff] = useState<{
    id: string;
    source: HandoffSource;
    status: HandoffStatus;
    detail: string;
    canResend: boolean;
  } | null>(null);
  const reportHandoff = (
    id: string,
    next: { status: HandoffStatus; detail: string; canResend: boolean },
  ) => {
    setHandoff((current) => (current && current.id === id ? { ...current, ...next } : current));
    publishHandoffReceipt({ id, status: next.status, detail: next.detail, at: new Date().toISOString() });
  };
  useEffect(() => {
    try {
      const size = Number(localStorage.getItem("canx-manager-text-size"));
      if (size >= 20 && size <= 32) setTextSize(size);
    } catch { /* Storage can be unavailable. */ }
  }, []);
  const changeTextSize = (size: number) => {
    setTextSize(size);
    try { localStorage.setItem("canx-manager-text-size", String(size)); } catch { /* Optional preference. */ }
  };
  const [composerHeight, setComposerHeight] = useState(120);
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const dividerDrag = useRef<{ y: number; height: number } | null>(null);
  const resizeComposer = (height: number) => {
    setComposerHeight(Math.max(60, Math.min(height, window.innerHeight * 0.4)));
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Plain-language problem with speaking aloud, shown on the compact companion. */
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const [notes, setNotes] = useState<OfficeNote[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  useTranscriptScrollContainment(messagesScrollRef, open && !minimized && tab === "now");
  const followMessagesRef = useRef(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false);
  const voiceSessionRef = useRef(0);
  const speechRequestRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  const mountedRef = useRef(true);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => undefined);
  const voiceTurnRef = useRef<(audioBase64: string, mimeType: string) => Promise<void>>(
    async () => undefined,
  );
  /** The full Manager panel can be dragged by its handle so it never blocks top buttons. */
  const panel = useDraggablePanel({ initial: { right: 16, bottom: 80 } });
  voiceModeRef.current = voiceMode;

  /** Full text of an answer that was summarised aloud, waiting for a yes. */
  const pendingFullRef = useRef<{ id: string; text: string } | null>(null);
  const [awaitingReadMore, setAwaitingReadMore] = useState(false);
  const requestTranscription = useServerFn(transcribeManagerAudio);
  const requestSpeech = useServerFn(speakManagerText);
  const managerVoice = useManagerVoice((audioBase64, mimeType) =>
    voiceTurnRef.current(audioBase64, mimeType),
  );

  const speakAnswer = async (_id: string, text: string, onDone?: () => void) => {
    const request = ++speechRequestRef.current;
    const voiceSession = voiceSessionRef.current;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    managerVoice.cancelListening();
    managerVoice.stopPlayback();
    setSpeechError(null);
    managerVoice.setPhase("preparing");
    const result = await requestSpeech({ data: { accessToken: token, text } }).catch(() => null);
    if (
      !mountedRef.current ||
      request !== speechRequestRef.current ||
      voiceSession !== voiceSessionRef.current
    )
      return;
    if (!result?.ok || !result.audioBase64) {
      // The hosted voice is preferred, but Astra must still talk if that one
      // provider or model refuses the request. The device voice costs nothing.
      const started = managerVoice.speakLocally(text, () => {
        if (request === speechRequestRef.current && voiceSession === voiceSessionRef.current)
          onDone?.();
      });
      if (!started) {
        managerVoice.setPhase("error");
        setSpeechError(
          result?.detail ??
            "Astra could not start a spoken answer. The written answer is still available.",
        );
      }
      return;
    }
    // If the browser refuses, the hook keeps the already-paid-for audio and
    // reports the real refusal; the main button replays that same audio.
    await managerVoice.playAudio(result.audioBase64, result.contentType, () => {
      if (request === speechRequestRef.current && voiceSession === voiceSessionRef.current)
        onDone?.();
    });
  };

  /**
   * The real approval box. Voice Mode reads the pending banner aloud when it
   * changes, so a spoken approval request is heard as well as seen.
   */
  const workbenchMemory = useManagerMemory();
  const refreshMemory = workbenchMemory.refresh;
  const pendingApprovals = (workbenchMemory.memory?.approvals ?? []).filter(
    (a) => a.status === "pending",
  ).length;
  const lastPendingRef = useRef<number | null>(null);
  /** Set when the Manager has just said the approval line itself. */
  const suppressBannerSpeechRef = useRef(false);

  useEffect(() => {
    const onChanged = () => refreshMemory();
    window.addEventListener("canx:workbench-changed", onChanged);
    return () => window.removeEventListener("canx:workbench-changed", onChanged);
  }, [refreshMemory]);

  useEffect(() => {
    const previous = lastPendingRef.current;
    lastPendingRef.current = pendingApprovals;
    if (previous === null || pendingApprovals <= previous) return;
    if (suppressBannerSpeechRef.current) {
      suppressBannerSpeechRef.current = false;
      return;
    }
    if (!voiceModeRef.current || sendingRef.current || managerVoice.phase !== "idle") return;
    const line = pendingApprovalNotice(pendingApprovals);
    if (line) void speakAnswer(`approvals-${pendingApprovals}`, line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingApprovals]);

  const fetchStatus = useServerFn(getManagerStatus);
  const sendChat = useServerFn(managerChat);
  const listShared = useServerFn(listSharedNotes);
  const pushShared = useServerFn(saveSharedNotes);
  const dropShared = useServerFn(deleteSharedNote);
  const session = useOwnerSession();
  const token = session.accessToken ?? "";
  const shared = session.shared;
  const context = useMemo(() => buildOfficeContext(), []);
  const managerTeam = useMemo(() => teamForManager(loadTeam()), []);
  const persistSummary = useServerFn(saveConversationSummary);
  const historyOwner = useRef<string | null>(null);
  useEffect(() => {
    const owner = session.signedIn ? session.email : null;
    if (historyOwner.current !== owner) {
      historyOwner.current = owner;
      setMessages([]);
      messagesRef.current = [];
      savedThroughRef.current = 0;
      autoAttemptThroughRef.current = 0;
      pendingSummaryRef.current = null;
      setHistoryStatus(MEMORY_NOTICE);
    }
  }, [session.signedIn, session.email]);
  const saveConversationNow = useCallback(async () => {
    if (savingSummaryRef.current) return "The requested summary is already being saved.";
    if (!session.stepUpComplete || !token) return "Sign in with your authenticator before saving.";
    const owner = historyOwner.current;
    const pending = pendingSummaryRef.current ?? {
      id: crypto.randomUUID(),
      turns: messagesRef.current.slice(savedThroughRef.current).filter(message => message.role !== "office"),
      through: messagesRef.current.length,
    };
    pendingSummaryRef.current = pending;
    savingSummaryRef.current = true;
    setSavingSummary(true);
    setHistoryStatus("Preparing an office continuity summary…");
    try {
      const result = await persistSummary({ data: { accessToken: token, confirmed: true, id: pending.id, turns: pending.turns } });
      if (owner !== historyOwner.current || !mountedRef.current) return result.message;
      setHistoryStatus(result.message);
      if (result.ok && "title" in result && "summary" in result) {
        savedThroughRef.current = pending.through;
        pendingSummaryRef.current = null;
        setMessages(current => [...current, { id: `summary-${pending.id}`, role: "office", content: `${result.message}\n${result.title}\n${result.summary}` }]);
        window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
      } else {
        // An explicit retry takes a fresh snapshot if nothing useful existed.
        if (result.message.startsWith("No useful") || result.message.startsWith("There is no")) {
          pendingSummaryRef.current = null;
          savedThroughRef.current = pending.through;
        }
      }
      return result.message;
    } catch {
      const message = "The Brain save was not confirmed. Keep this window open and press Save conversation to retry.";
      if (owner === historyOwner.current && mountedRef.current) setHistoryStatus(message);
      return message;
    } finally {
      savingSummaryRef.current = false;
      if (mountedRef.current) setSavingSummary(false);
    }
  }, [persistSummary, token, session.stepUpComplete]);
  const saveVoiceTurn = useServerFn(recordVoiceTurn);
  const voicePairerRef = useRef(new VoiceTurnPairer());
  const saveSpokenMessage = useCallback((role: "user" | "assistant", content: string) => {
    const message: ChatMessage = { id: crypto.randomUUID(), role, content };
    messagesRef.current = [...messagesRef.current, message];
    setMessages(current => [...current, message]);
    // Completed spoken turns go to durable Astra memory once; turns already
    // saved by the typed Manager path are skipped by the pairer.
    const turn = voicePairerRef.current.feed(role, content);
    if (turn && token && session.stepUpComplete) {
      void saveVoiceTurn({ data: { accessToken: token, ...turn } })
        .then(result => { if (!result.ok && mountedRef.current) setHistoryStatus(result.message); })
        .catch(() => { if (mountedRef.current) setHistoryStatus("The spoken turn was not saved to Astra memory."); });
    }
  }, [token, session.stepUpComplete, saveVoiceTurn]);
  // One implementation for typed and spoken requests. No model-generated code or URLs run here.
  const runRoomCommand = async (request: string): Promise<string | null> => {
    const command = parseRoomCommand(request, router.state.location.pathname);
    if (!command) return null;
    if (!session.stepUpComplete || !token) return "Complete owner verification before changing or inspecting a room.";
    if (roomActionLock.current) return "A room request is already running. Wait for its result.";
    roomActionLock.current = true;
    try {
      if (command.kind === "move-panel") {
        setFullScreen(false);
        panel.moveToSide(command.side);
        return `Moved Astra’s window to the ${command.side} side of this screen. You can drag it back.`;
      }
      if (command.kind === "text-size") {
        changeTextSize(command.size);
        return `Conversation text is now ${command.size} pixels on this device. You can change it back with the Text size control.`;
      }
      const { room } = command;
      if (command.kind === "report") {
        if (command.content.length > 2000) return "This report is longer than 2,000 characters. Please shorten it; nothing was saved.";
        const note: OfficeNote = { id: crypto.randomUUID(), kind: "decision", title: `${room.shortLabel} report`,
          detail: command.content, owner: "John", provenance: "john", source: roomReportSource(room.id), createdAt: new Date().toISOString() };
        const saved = await pushShared({ data: { accessToken: token, notes: [note] } });
        if (!saved.ok || saved.data?.saved !== 1) return saved.message || "The report was not saved.";
        const readback = await listShared({ data: { accessToken: token } });
        if (!readback.ok || !readback.data?.some(item => item.id === note.id && item.detail === note.detail))
          return "The save was accepted, but I could not verify it. Check Records before repeating the request.";
        setNotes(readback.data);
        window.dispatchEvent(new CustomEvent("canx:room-reports-changed"));
        await router.navigate({ to: room.route });
        return `Saved and verified your report in ${room.shortLabel}. Record ${note.id}. It is also available in Records.`;
      }
      setDelivery(`Opening and checking ${room.shortLabel}…`);
      await router.navigate({ to: room.route });
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (router.state.location.pathname !== room.route) return "The room changed before inspection. Please ask again in the intended room.";
      const capture = await captureOfficeView(room.route);
      if (!capture.ok) return capture.message;
      if (router.state.location.pathname !== room.route) return "The room changed during inspection. No picture was sent.";
      const reply = await observeRoom({ data: { accessToken: token, path: room.route,
        room: room.label, text: capture.observation.text, image: capture.observation.image } });
      if (!reply.ok) return reply.detail || "The room review did not complete.";
      setRoomReviews(current => ({ ...current, [room.id]: { roomId: room.id, at: new Date(reply.observedAt).toLocaleString(), text: reply.text, thumbnail: capture.observation.image } }));
      return `${room.shortLabel}, checked ${new Date(reply.observedAt).toLocaleTimeString()}:\n${reply.text}`;
    } catch {
      return "The room request could not be confirmed. Check the room before repeating a change.";
    } finally { roomActionLock.current = false; }
  };
  const roomCommandRef = useRef(runRoomCommand);
  roomCommandRef.current = runRoomCommand;
  const realtimeManager = useRealtimeManager(token, managerTeam, saveSpokenMessage,
    useCallback(async (request: string) => {
      if (requestsConversationSave(request)) return saveConversationNow();
      const direct = await roomCommandRef.current(request);
      if (direct !== null) return direct;
      const thread = messagesRef.current.filter(message => message.role !== "office").slice(-20)
        .map(message => ({ role: message.role as "user" | "assistant", content: message.content }));
      if (thread.at(-1)?.role !== "user" || thread.at(-1)?.content !== request)
        thread.push({ role: "user", content: request });
      const reply = await sendChat({ data: { accessToken: token, team: managerTeam, messages: thread } });
      if (reply.ok) voicePairerRef.current.markServerSaved(request);
      const result = reply.text || reply.detail || "The office action did not complete.";
      // The spoken transcript appends the reply once and updates messagesRef.
      // Appending here too created duplicate replies and stale thread history.
      if (reply.actionResults?.some(action => action.status === "done" || action.status === "pending"))
        window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
      return result;
    }, [token, managerTeam, sendChat, saveConversationNow]),
  );

  // One attempt per new completed discussion; a failed save needs an explicit retry.
  // No unload request: never claim a browser shutdown can finish an in-flight save.
  useEffect(() => {
    if (!autoMemory || busy || savingSummary || !session.stepUpComplete || !token) return;
    if (["connecting", "thinking", "speaking"].includes(realtimeManager.phase)) return;
    if (pendingSummaryRef.current || messages.length <= autoAttemptThroughRef.current) return;
    const unsaved = messages.slice(savedThroughRef.current).filter(message => message.role !== "office");
    if (!shouldCheckpointConversation(unsaved)) return;
    const timer = window.setTimeout(() => {
      autoAttemptThroughRef.current = messagesRef.current.length;
      void saveConversationNow();
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [messages, autoMemory, busy, savingSummary, session.stepUpComplete, token, realtimeManager.phase, saveConversationNow]);

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
  }, [session.state, session.aal, token]);

  useEffect(() => {
    if (!open || status) return;
    void fetchStatus({ data: { accessToken: token } })
      .then((result) => {
        setStatus(result);
        // Only a check that actually passed is allowed to set a time.
        setLastCheckLabel(result.connected ? new Date().toLocaleString() : null);
      })

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
    // Voice is the default; do not pull focus into the collapsed text composer.
  }, [open, minimized, tab]);

  // Closing the panel always ends Voice Mode: the microphone never stays on.
  useEffect(() => {
    if (open) return;
    realtimeManager.stop();
    voiceModeRef.current = false;
    setVoiceMode(false);
    cancelVoiceActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, realtimeManager.stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      voiceSessionRef.current += 1;
      speechRequestRef.current += 1;
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const pane = messagesScrollRef.current;
    if (pane && followMessagesRef.current) pane.scrollTop = pane.scrollHeight;
  }, [messages, busy]);

  const addNote = useCallback(
    (note: OfficeNote) => {
      setNotes((current) => {
        const next = [note, ...current];
        saveNotes(next);
        return next;
      });
      if (shared)
        void pushShared({ data: { accessToken: token, notes: [note] } }).catch(() => undefined);
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
    const result = await pushShared({ data: { accessToken: token, notes: deviceNotes } }).catch(
      () => null,
    );
    if (result?.ok) {
      const refreshed = await listShared({ data: { accessToken: token } }).catch(() => null);
      if (refreshed?.ok && refreshed.data) setNotes(refreshed.data);
    }
  }, [shared, token, pushShared, listShared]);

  const send = async (override?: string, handoffId?: string) => {
    const text = (override ?? draft).trim();
    if (!text || sendingRef.current) return;
    if (!session.stepUpComplete || !token) {
      setError("Enter the six-digit authenticator code below before talking with Astra.");
      if (handoffId) reportHandoff(handoffId, { status: "blocked", detail: "Authenticator step not complete. Nothing was sent.", canResend: true });
      return;
    }
    if (handoffId && !historyReady) {
      setError("Wait for conversation memory to load before sending.");
      return;
    }
    if (requestsConversationSave(text)) {
      setDraft("");
      await saveConversationNow();
      return;
    }
    const voiceSession = voiceSessionRef.current;

    // A plain yes or no answers "shall I read the rest?" without going to the
    // provider at all — nothing is spent and nothing is approved by it.
    const pending = pendingFullRef.current;
    if (voiceModeRef.current && pending) {
      if (isAffirmative(text)) {
        pendingFullRef.current = null;
        setAwaitingReadMore(false);
        setDraft("");
        managerVoice.cancelListening();
        void speakAnswer(pending.id, pending.text, resumeListening);
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
    if (voiceModeRef.current) managerVoice.cancelListening();
    setError(null);
    const userMessage: ChatMessage = { id: `m-${Date.now()}`, role: "user", content: text };
    if (!historyReady) { setError("Wait for conversation memory to load before sending."); return; }
    const history = [...messages, userMessage];
    messagesRef.current = history;
    setMessages(history);
    setDraft("");
    sendingRef.current = true;
    setBusy(true);
    setDelivery("Sending message — waiting for the server…");
    if (handoffId) reportHandoff(handoffId, { status: "submitted", detail: "", canResend: false });
    followMessagesRef.current = true;
    try {
      const direct = await roomCommandRef.current(text);
      if (direct !== null) {
        saveSpokenMessage("assistant", direct);
        setDelivery("Room request returned a result — see Astra's answer.");
        if (handoffId) reportHandoff(handoffId, { status: "responded", detail: "Handled as a room request. Not saved to Astra's memory.", canResend: false });
        if (realtimeManager.on) realtimeManager.say(direct);
        return;
      }
      const reply = await sendChat({
        data: {
          accessToken: token,
          team: teamForManager(loadTeam()),
          messages: history
            .filter((m) => m.role !== "office")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        },
      });
      if (handoffId) reportHandoff(handoffId, handoffStatusFromReply(reply));
      if (!mountedRef.current) return;
      if (!reply.ok) {
        setDelivery("Request failed — see the error below. Your message remains in the conversation.");
        setDraft(current => current || text);
        setError(
          reply.code === "auth_not_ready"
            ? "The manager cannot answer: there is no owner sign-in with MFA yet, so paid AI calls are blocked. No request was sent to any provider."
            : reply.code === "not_configured"
              ? "The manager has no AI connection yet, so there is no answer to give. See the setup note below."
              : reply.code === "limit_blocked"
                ? (reply.detail ??
                  "The request was refused by the office's own spending and rate limits.")
                : reply.code === "health_check_failed"
                  ? (reply.detail ??
                    "The live check of the AI connection did not pass, so nothing was asked.")
                  : reply.code === "context_unavailable"
                    ? (reply.detail ??
                      "The office records could not be read just now, so nothing was asked.")
                    : (reply.detail ?? "The AI request could not be completed."),
        );
        if (voiceSession === voiceSessionRef.current) managerVoice.setPhase("error");
      } else {
        setComposerCollapsed(true);
        setDelivery("Received — Astra returned a reply. This does not mean the requested work is complete.");
        const answerId = `m-${Date.now()}-a`;
        const answer = reply.text || "(The provider returned an empty answer.)";
        if (realtimeManager.on) realtimeManager.say(answer);
        setMessages((current) => [
          ...current,
          {
            id: answerId,
            role: "assistant",
            content: answer,
            toolCalls: reply.toolCalls,
            ...(reply.checked ? { checked: reply.checked } : {}),
          },
        ]);
        // A real task change — typed or spoken — reloads the Work Board.
        const changedWork = (reply.actionResults ?? []).some((action) =>
          action.status === "done" || action.status === "pending",
        );
        if (changedWork && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
        }
        // Something real was queued in the approval box — say so out loud.
        const approvalLine = approvalSubmissionNotice(reply.actionResults);
        if (voiceModeRef.current && voiceSession === voiceSessionRef.current) {
          // Short spoken summary by default; the full text stays on screen.
          const shaped = spokenSummary(answer);
          pendingFullRef.current = shaped.truncated ? { id: answerId, text: shaped.full } : null;
          setAwaitingReadMore(shaped.truncated);
          // The microphone stays closed while the attached audio player speaks,
          // then a fresh recording starts only after playback has finished.
          if (approvalLine) suppressBannerSpeechRef.current = true;
          const spoken = [shaped.spoken || answer, approvalLine].filter(Boolean).join(" ");
          void speakAnswer(answerId, spoken, resumeListening);
        }
      }
    } catch (caught) {
      if (!mountedRef.current) return;
      setDelivery("Reply not confirmed — check the conversation and work records before retrying an action.");
      if (handoffId) reportHandoff(handoffId, handoffStatusFromReply(null));
      setDraft(current => current || text);
      setError(caught instanceof Error ? caught.message : "The request could not be completed.");
      if (voiceSession === voiceSessionRef.current) managerVoice.setPhase("error");
    } finally {
      sendingRef.current = false;
      if (!mountedRef.current) return;
      setBusy(false);
      // Keep scroll and focus where the owner left them.
    }
  };
  sendRef.current = send;

  voiceTurnRef.current = async (audioBase64: string, mimeType: string) => {
    const voiceSession = voiceSessionRef.current;
    if (!voiceModeRef.current) return;
    setSpeechError(null);
    const result = await requestTranscription({
      data: { accessToken: token, audioBase64, mimeType },
    }).catch(() => null);
    if (!mountedRef.current || !voiceModeRef.current || voiceSession !== voiceSessionRef.current)
      return;
    if (!result?.ok || !result.text) {
      managerVoice.setPhase("error");
      setSpeechError(
        result?.detail ??
          "The Manager could not understand that recording. Please press Talk and try again.",
      );
      return;
    }
    await sendRef.current(result.text);
  };

  /** Resume only after playback, and never after a later stop or interruption. */
  function resumeListening(delay = 300) {
    if (!voiceModeRef.current) return;
    const voiceSession = voiceSessionRef.current;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      if (
        mountedRef.current &&
        voiceModeRef.current &&
        voiceSession === voiceSessionRef.current &&
        !sendingRef.current
      ) {
        void managerVoice.startListening();
      }
    }, delay);
  }

  function cancelVoiceActivity() {
    voiceSessionRef.current += 1;
    speechRequestRef.current += 1;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = null;
    managerVoice.cancelListening();
    managerVoice.stopPlayback();
  }

  const interruptAndListen = () => {
    cancelVoiceActivity();
    pendingFullRef.current = null;
    setAwaitingReadMore(false);
    setSpeechError(null);
    managerVoice.unlockPlayback();
    void managerVoice.startListening();
  };

  const startVoiceMode = () => {
    if (sendingRef.current) return;
    if (!session.stepUpComplete) {
      setError("Enter the six-digit authenticator code below before talking with Astra.");
      return;
    }
    cancelVoiceActivity();
    setVoiceMode(true);
    voiceModeRef.current = true;
    setError(null);
    setSpeechError(null);
    managerVoice.unlockPlayback();
    void managerVoice.startListening();
  };

  const endVoiceMode = () => {
    setVoiceMode(false);
    voiceModeRef.current = false;
    pendingFullRef.current = null;
    setAwaitingReadMore(false);
    setSpeechError(null);
    cancelVoiceActivity();
  };

  const closeManager = () => {
    realtimeManager.stop();
    endVoiceMode();
    setMinimized(false);
    setOpen(false);
  };

  // The compact companion drives this same voice conversation and work panel.
  // It never starts a second voice engine and never opens the panel on its own.
  const voiceModeOn = voiceMode;

  // Text-only handoff from the companion's Work window: an explicit click
  // prefills a draft here for review. Nothing is sent, saved or approved
  // until John presses Send to Astra.
  useEffect(() => {
    const onHandoff = (event: Event) => {
      const detail = (event as CustomEvent<ManagerHandoff>).detail;
      if (!detail || typeof detail.text !== "string" || !detail.text.trim()) return;
      setOpen(true);
      setMinimized(false);
      setTab("now");
      setDraft(detail.text.slice(0, 4000));
      const id = typeof detail.id === "string" && /^[a-z0-9-]{1,60}$/i.test(detail.id) ? detail.id : newHandoffId();
      setHandoff({
        id,
        source: detail.source === "work_discussion" ? "work_discussion" : "screen_observation",
        status: "drafted",
        detail: "",
        canResend: false,
      });
    };
    window.addEventListener(MANAGER_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(MANAGER_HANDOFF_EVENT, onHandoff);
  }, []);

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
  const liveState =
    realtimeManager.phase === "connecting"
      ? "Connecting Astra…"
      : realtimeManager.phase === "speaking"
        ? "Astra is speaking…"
        : realtimeManager.phase === "thinking"
          ? "Astra is thinking…"
          : realtimeManager.on
            ? "Astra is listening…"
            : "Office Manager";

  const primaryVoiceAction = () => {
    if (realtimeManager.on || !historyReady) return;
    setError(null);
    setSpeechError(null);
    realtimeManager.start();
  };

  return (
    <>
      {!(open && minimized) && (
        <Button
          onClick={() => open ? closeManager() : setOpen(true)}
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
          <span
            role="status"
            aria-live="polite"
            className="truncate text-sm font-medium text-foreground"
          >
            {liveState}
          </span>
          {realtimeManager.on && (
            <Button variant="outline" size="sm" className="h-8" onClick={realtimeManager.stop}>
              <PhoneOff className="mr-1.5 h-3.5 w-3.5" /> End
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
            onClick={closeManager}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {open && (
        <div
          ref={mobileShieldRef}
          data-testid="astra-mobile-overlay"
          data-active={mobileShieldActive ? "true" : "false"}
          className={mobileShieldActive ? "pointer-events-auto fixed inset-0 z-[60] h-screen h-[100svh] h-[100dvh] w-screen overflow-hidden overscroll-none bg-background" : "contents"}
        >
        <aside
          ref={panel.ref as React.RefObject<HTMLElement>}
          id="office-manager-panel"
          aria-label="Office Manager"
          hidden={minimized}
          style={mobileShieldActive ? undefined : fullScreen ? { inset: 8, width: "auto", height: "calc(100dvh - 16px)", maxWidth: "none", maxHeight: "none" } : { ...panel.style, bottom: Math.min(panel.style.bottom, 16) }}
          className={`fixed z-40 ${
            minimized ? "hidden" : "flex"
          } flex-col overflow-hidden overscroll-contain border border-border bg-card shadow-2xl ${
            mobileShieldActive
              ? "inset-0 h-screen h-[100svh] h-[100dvh] w-screen max-h-none max-w-none resize-none rounded-none"
              : "h-[calc(100dvh-32px)] max-h-[960px] w-[min(64rem,calc(100vw-2rem))] max-w-[calc(100vw-16px)] resize rounded-xl"
          }`}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-secondary/60 p-2">
            <div
              {...(isMobile ? {} : panel.handleProps)}
              className="mr-1 flex cursor-move touch-none select-none items-center rounded-md p-1.5 text-muted-foreground hover:bg-background active:bg-secondary"
            >
              <GripVertical className="h-4 w-4" aria-hidden="true" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setFullScreen(value => !value)}>
              <Maximize2 className="mr-1 h-4 w-4" /> {fullScreen ? "Restore window" : "Full screen"}
            </Button>
            <label className="flex items-center gap-2 px-2 text-base">Text size
              <select aria-label="Conversation text size" value={textSize} onChange={event => changeTextSize(Number(event.target.value))} className="rounded border bg-background p-1 text-foreground">
                {[20, 24, 28, 32].map(size => <option key={size} value={size}>{size}px</option>)}
              </select>
            </label>
            {CONSOLE_VIEWS.map((view) => (
              <button
                key={view.id}
                onClick={() => setTab(view.id)}
                aria-current={tab === view.id}
                className={`min-h-9 rounded-md px-2 py-1.5 text-sm font-medium ${
                  tab === view.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-background"
                }`}
              >
                {view.label}
              </button>
            ))}

            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-8 shrink-0"
              onClick={() => setMinimized(true)}
              aria-label="Minimise the Office Manager to a small floating control"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/work-board" onClick={() => setMinimized(true)}>Work Board</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/brain" onClick={() => setMinimized(true)}>Brain</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className={pendingApprovals ? "border-canx-yellow text-canx-yellow" : ""}>
              <Link to="/approvals" onClick={() => setMinimized(true)}>Approvals{pendingApprovals ? ` (${pendingApprovals})` : ""}</Link>
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={closeManager}>
              <X className="mr-1 h-4 w-4" /> Close
            </Button>
          </div>

          {tab === "now" && (
            <>
              <div className="shrink-0 border-b border-border px-3 py-2 text-xs">
                {status === null ? (
                  <span className="text-muted-foreground">Checking the connection…</span>
                ) : (
                  <span className={status.connected ? "text-foreground" : "text-muted-foreground"}>
                    <span
                      className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                        status.connected
                          ? "bg-emerald-500"
                          : status.state === "auth_unavailable"
                            ? "bg-red-500"
                            : "bg-amber-500"
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

              <div
                ref={messagesScrollRef}
                onScroll={(event) => {
                  const pane = event.currentTarget;
                  followMessagesRef.current =
                    pane.scrollHeight - pane.scrollTop - pane.clientHeight < 48;
                }}
                className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4"
                aria-label="Conversation with Astra"
                style={{ fontSize: textSize, lineHeight: 1.5 }}
              >
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Talk to Astra about today's priorities, your projects, or the next task. Ask Astra
                    to create or assign work, then check the Work Board. Spending and protected
                    actions still need your approval.
                  </p>
                )}
                {messages.map((message) => (
                  <div key={message.id} className={message.role === "user" ? "text-right" : ""}>
                    {message.role !== "user" && (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {message.role === "office"
                          ? "Office notice — save and action results"
                          : "Astra — Office Manager"}
                      </p>
                    )}
                    <div
                      className={
                        message.role === "user"
                          ? "inline-block max-w-[95%] break-words whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-left text-primary-foreground"
                          : "whitespace-pre-wrap break-words text-foreground"
                      }
                    >
                      {message.content}
                    </div>
                    {message.checked && <CheckedReceipt receipt={message.checked} />}

                    {message.toolCalls?.map((call, index) => (
                      <ProposalCard
                        key={`${message.id}-${index}`}
                        call={call}
                        onSaveNote={addNote}
                        onOpenAppearance={() => setTab("settings")}
                      />
                    ))}
                  </div>
                ))}
              <div className="border-t border-border pt-3">
                <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={autoMemory} onChange={event => setAutoMemory(event.target.checked)} />
                  Save useful discussion automatically during this session
                </label>
                <p role="status" className="mb-2 text-xs text-muted-foreground">{historyStatus === MEMORY_NOTICE && !autoMemory ? "Automatic saving is paused. Use Save conversation to preserve useful discussion before closing." : historyStatus}</p>
                {autoMemory && historyStatus !== MEMORY_NOTICE && <p className="mb-2 text-xs text-muted-foreground">{MEMORY_NOTICE}</p>}
                <Button size="sm" variant="outline" className="mb-2" disabled={savingSummary || busy || !session.stepUpComplete || !token} onClick={() => void saveConversationNow()}>
                  {savingSummary ? "Saving summary…" : "Save conversation"}
                </Button>
                <p role="status" aria-live="polite" className="mb-2 text-base">{delivery || (draft.trim() ? "Draft — not sent yet." : "")}</p>
                {handoff && (
                  <section
                    data-testid="astra-handoff-card"
                    aria-label="Handoff from the Office Work assistant"
                    className="mb-2 rounded-md border border-border p-2 text-xs"
                  >
                    <p className="font-semibold">
                      {HANDOFF_STATUS_LABEL[handoff.status]}
                    </p>
                    <p className="text-muted-foreground">Source: {HANDOFF_SOURCE_LABEL[handoff.source]}</p>
                    {handoff.detail && <p className="mt-1">{handoff.detail}</p>}
                    <p className="mt-1 text-muted-foreground">
                      The request is in the message box below — edit it if you like. The Work assistant cannot act on its own; only your Send reaches Astra.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(handoff.status === "drafted" || (handoff.status === "blocked" && handoff.canResend)) && (
                        <Button
                          size="sm"
                          data-testid="astra-handoff-send"
                          disabled={busy || !draft.trim()}
                          onClick={() => void send(undefined, handoff.id)}
                        >
                          Send to Astra
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setHandoff(null)}>
                        Dismiss
                      </Button>
                    </div>
                  </section>
                )}
                <section aria-label="Talk with Astra" className="space-y-3">
                  <p role="status" aria-live="polite" className="text-sm font-semibold">
                    {realtimeManager.error || error
                      ? "Astra needs attention — see the message below."
                      : realtimeManager.phase === "connecting"
                        ? "Connecting Astra…"
                        : realtimeManager.phase === "speaking"
                          ? "Astra is speaking… you can interrupt."
                          : realtimeManager.phase === "thinking"
                            ? "Astra is thinking…"
                            : realtimeManager.on
                              ? "Astra is listening — just speak naturally."
                              : "Talk with Astra"}
                  </p>
                  {session.signedIn && !session.stepUpComplete && (
                    <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                      <p className="text-sm font-semibold text-foreground">
                        Confirm your authenticator to talk with Astra
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Enter the current six-digit code from your authenticator app. This completes
                        the secure owner sign-in for this session.
                      </p>
                      <div className="flex gap-2">
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={mfaCode}
                          placeholder="123456"
                          aria-label="Six-digit authenticator code for Astra"
                          onChange={(event) =>
                            setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                          }
                        />
                        <Button
                          disabled={mfaBusy || mfaCode.length !== 6}
                          onClick={() => {
                            setMfaBusy(true);
                            setMfaError(null);
                            void session.submitMfaCode(mfaCode).then((problem) => {
                              if (problem) setMfaError(problem);
                              else {
                                setMfaCode("");
                                setError(null);
                              }
                              setMfaBusy(false);
                            });
                          }}
                        >
                          <ShieldCheck className="mr-1.5 h-4 w-4" /> Verify
                        </Button>
                      </div>
                      {mfaError && (
                        <p role="alert" className="text-xs text-destructive">
                          {mfaError}
                        </p>
                      )}
                    </div>
                  )}
                  {!realtimeManager.on && <Button variant="outline" onClick={() => {
                    managerVoice.unlockPlayback();
                    void speakAnswer("speaker-check", VOICE_CHECK_SENTENCE);
                  }} disabled={!session.stepUpComplete || busy}>Test speaker</Button>}
                  {speechError && <p role="alert" className="text-sm text-destructive">{speechError}</p>}
                  {realtimeManager.playbackBlocked && (
                    <Button variant="outline" className="w-full" onClick={realtimeManager.resumeAudio}>
                      Enable sound
                    </Button>
                  )}
                  {(realtimeManager.error || error) && (
                    <div
                      role="alert"
                      className="rounded-md border border-destructive/40 p-2 text-sm text-destructive"
                    >
                      {realtimeManager.error ?? error}
                    </div>
                  )}
                  {realtimeManager.on && (
                    <p className="text-xs text-muted-foreground">
                      The microphone stays open. Talk back and forth until you press End
                      conversation.
                    </p>
                  )}
                </section>

              </div>
                {busy && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Thinking…
                  </p>
                )}
              </div>

              <div className="shrink-0 border-t border-border bg-card px-3 pb-2">
                <div
                  role="separator" aria-label="Resize writing area" aria-orientation="horizontal"
                  aria-valuemin={60} aria-valuemax={600} aria-valuenow={composerHeight} tabIndex={0}
                  className="flex h-7 cursor-row-resize touch-none items-center justify-center rounded hover:bg-secondary focus:bg-secondary"
                  onPointerDown={event => {
                    setComposerCollapsed(false);
                    dividerDrag.current = { y: event.clientY, height: composerCollapsed ? 60 : composerHeight };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onPointerMove={event => {
                    if (dividerDrag.current) resizeComposer(dividerDrag.current.height + dividerDrag.current.y - event.clientY);
                  }}
                  onPointerUp={() => { dividerDrag.current = null; }}
                  onLostPointerCapture={() => { dividerDrag.current = null; }}
                  onKeyDown={event => {
                    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                      event.preventDefault(); setComposerCollapsed(false);
                      resizeComposer(composerHeight + (event.key === "ArrowUp" ? 30 : -30));
                    }
                  }}
                ><span className="h-1.5 w-20 rounded-full bg-muted-foreground" /></div>
                <div className="flex items-center justify-between gap-2 pb-1">
                  <span className="text-sm">Drag divider: more reading or writing space</span>
                  <Button size="sm" variant="outline" onClick={() => setComposerCollapsed(value => !value)}>
                    {composerCollapsed ? "Show text box" : "Hide text box"}
                  </Button>
                </div>
                <div>

                  {!composerCollapsed && <div className="relative">
                  <Textarea
                    ref={inputRef}
                    rows={4}
                    value={draft}
                    className="min-h-0 max-h-[40dvh] resize-none overflow-y-auto overscroll-contain pr-16 leading-relaxed"
                    style={{ fontSize: textSize, height: composerHeight }}
                    placeholder="Type or paste your message here…"
                    aria-label="Message the Office Manager"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="absolute bottom-2 right-2 h-11 w-11 rounded-full"
                    onClick={() => void send()}
                    disabled={busy || !historyReady || !session.stepUpComplete || !token || !draft.trim()}
                    aria-label={busy ? "Sending message" : "Send message"}
                    title={busy ? "Sending…" : "Send message"}
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
                  </Button>
                  </div>}
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="Message and voice controls">
                  <Button
                    className="h-12 flex-1 text-lg"
                    onClick={primaryVoiceAction}
                    disabled={!session.stepUpComplete || !token || !historyReady || realtimeManager.on || realtimeManager.phase === "connecting"}
                  >
                    <Mic className="mr-2 h-5 w-5" /> Talk to Astra
                  </Button>
                  {realtimeManager.on && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 px-2.5"
                      onClick={realtimeManager.stop}
                      aria-label="End the voice conversation with Astra"
                    >
                      <PhoneOff className="mr-1.5 h-4 w-4" aria-hidden="true" /> End conversation
                    </Button>
                  )}
                  </div>
                  <p role="status" className="mt-2 text-sm">
                    {!session.stepUpComplete ? "Verify your authenticator above to enable text and voice." : !historyReady ? "Loading conversation — controls will be ready shortly." : realtimeManager.phase === "connecting" ? "Connecting microphone…" : realtimeManager.on ? "Voice conversation is active. Press End conversation when you are done." : "Ready: type a message or choose Talk to Astra."}
                  </p>
                </div>
              </div>

            </>
          )}

          {tab === "rooms" && (
            <ManagerRoomsPanel
              accessToken={token}
              recordsReadable={workbenchMemory.memory !== null}
              reviews={roomReviews}
              onRequestReview={(label) => { setTab("now"); void sendRef.current(`Check ${label}`); }}
              onReviewed={(review) =>
                setRoomReviews((current) => ({ ...current, [review.roomId]: review }))
              }
            />
          )}

          {tab === "team" && (
            <ManagerTeamPanel accessToken={token} connected={status?.connected === true} />
          )}

          {tab === "settings" && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    briefing();
                    setTab("now");
                  }}
                >
                  Office briefing
                </Button>
                <Link to="/round-table" className="text-xs text-primary underline">
                  Monday round table
                </Link>
              </div>
              <div className="rounded-lg border border-border p-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Connection and model
                </p>
                <p className="mt-1 text-xs text-foreground">
                  {modelStatusLine(
                    status?.model ?? null,
                    status?.connected ? lastCheckLabel : null,
                  )}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This is the model configured on the CanX server. It is never described as the
                  newest available.
                </p>
              </div>

              <div className="rounded-lg border border-border p-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Money limits
                </p>
                {budgetScopeLines(workbenchMemory.memory !== null).map((line) => (
                  <div key={line.id} className="mt-2">
                    <p className="text-sm font-semibold text-foreground">
                      {line.label} — {line.amount}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{line.scope}</p>
                    <p className="text-[11px] text-muted-foreground">{line.enforcement}</p>
                  </div>
                ))}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  These are two separate limits. They are never added together and neither is a
                  spend total.
                </p>
              </div>

              <MemoryHealthCard accessToken={token} />

              <div className="rounded-lg border border-border p-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Voice check
                </p>
                <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                  <li>Voice turn recorded: {managerVoice.report.recorded ? "yes" : "no"}</li>
                  <li>
                    Phone reported playback started:{" "}
                    {managerVoice.report.playbackStarted ? "yes" : "no"}
                  </li>
                  <li>
                    Phone reported playback finished:{" "}
                    {managerVoice.report.playbackEnded ? "yes" : "no"}
                  </li>
                  <li>Problem reported: {managerVoice.report.error ?? "none"}</li>
                  <li>
                    Browser refusal reported:{" "}
                    {managerVoice.report.blockedReason
                      ? `${managerVoice.report.blockedReason} — the browser would not start sound without a tap`
                      : "none"}
                  </li>
                  <li>
                    Microphone open right now: {managerVoice.phase === "listening" ? "yes" : "no"}
                  </li>
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-9"
                  aria-label="Test the voice with the microphone off"
                  onClick={() => {
                    cancelVoiceActivity();
                    setSpeechError(null);
                    managerVoice.unlockPlayback();
                    void speakAnswer(`voice-check-${Date.now()}`, VOICE_CHECK_SENTENCE);
                  }}
                >
                  <Volume2 className="mr-1.5 h-4 w-4" /> Test voice (microphone off)
                </Button>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Voice audio is temporary and is never added to office records.
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Appearance
                </p>
                <AppearancePanel />
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Saved ({notes.length})
                </p>
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
                {notes.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
                )}
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-border p-2.5">
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">{note.title}</p>
                        {note.detail && (
                          <p className="mt-1 text-sm text-muted-foreground">{note.detail}</p>
                        )}
                        <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {note.kind} · {note.owner || "no owner"} ·{" "}
                          {PROVENANCE_LABELS[note.provenance]}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${note.title}`}
                        onClick={() => removeNote(note.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
        </div>
      )}
    </>
  );
}

/**
 * The visible proof behind an answer: what was read, when, what was missing,
 * and the exact model. Built on the server from the context actually used.
 */
function CheckedReceipt({ receipt }: { receipt: VerificationReceipt }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1.5 text-left">
      <button
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="min-h-8 rounded-md px-2 py-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        {open
          ? "Hide what was checked"
          : `Checked ${receipt.sources.length} source${receipt.sources.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <div className="mt-1 rounded-md border border-border bg-secondary/40 p-2 text-[11px] text-muted-foreground">
          <p className="font-semibold text-foreground">
            Read at {new Date(receipt.checkedAt).toLocaleString()}
          </p>
          <p className="mt-1">
            Provider: {receipt.provider} · Model: {receipt.model}
          </p>
          <p className="mt-1 font-semibold text-foreground">Sources read</p>
          <ul className="list-disc pl-4">
            {receipt.sources.length === 0 && (
              <li>No labelled office records were readable for this answer.</li>
            )}
            {receipt.sources.map((source) => (
              <li key={source}>{source}</li>
            ))}
          </ul>
          <p className="mt-1 font-semibold text-foreground">Gaps and failed reads</p>
          <ul className="list-disc pl-4">
            {receipt.gaps.length === 0 && <li>None reported by the office records this time.</li>}
            {receipt.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
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
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Appearance suggestion
        </p>
        <p className="mt-1 text-sm text-foreground">
          {typeof call.arguments["reason"] === "string"
            ? call.arguments["reason"]
            : "A look-and-feel change."}
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
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Proposed for your list
        </p>
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
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-3">
      <p className="text-xs text-muted-foreground">
        These are the only appearance settings anything in this office can change, and they stay on
        this device.
      </p>

      <Group label="Surface">
        <div className="flex flex-wrap gap-2">
          {THEME_FIELDS.surface.options.map((value: SurfaceLevel) => (
            <Choice
              key={value}
              active={theme.surface === value}
              onClick={() => preview({ surface: value })}
            >
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
            <Choice
              key={value}
              active={theme.accent === value}
              onClick={() => preview({ accent: value })}
            >
              {ACCENT_LABELS[value]}
            </Choice>
          ))}
        </div>
      </Group>

      <Group label="Text density">
        <div className="flex flex-wrap gap-2">
          {THEME_FIELDS.density.options.map((value: DensityName) => (
            <Choice
              key={value}
              active={theme.density === value}
              onClick={() => preview({ density: value })}
            >
              {value}
            </Choice>
          ))}
        </div>
      </Group>

      <Group label="Movement">
        <div className="flex flex-wrap gap-2">
          {THEME_FIELDS.motion.options.map((value: MotionName) => (
            <Choice
              key={value}
              active={theme.motion === value}
              onClick={() => preview({ motion: value })}
            >
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
      {dirty && (
        <p className="text-xs text-muted-foreground">
          Previewing — nothing is kept until you press Apply.
        </p>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
