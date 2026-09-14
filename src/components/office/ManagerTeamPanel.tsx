"use client";

/**
 * Office Manager — Team view.
 *
 * Each seat is a bounded read-only adviser with its own room, scope and its own
 * separate conversation. A seat card never implies a live worker: a seat is
 * "Available" only when the Manager's own AI connection is verified, and
 * "Planned / not connected" otherwise. Nothing here approves, spends, sends or
 * changes a record, and no worker runs on its own.
 */

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_WORKER_QUESTION,
  WORKER_SEATS,
  WORKER_STATE_LABELS,
  appendWorkerTurn,
  threadKey,
  type WorkerConnectionState,
  type WorkerTurn,
} from "@/lib/manager-workers";
import { consultRoomWorker, type ConsultReply } from "@/lib/manager-workers.functions";

const STATE_DOT: Record<WorkerConnectionState, string> = {
  available: "bg-emerald-500",
  working: "bg-sky-500",
  waiting: "bg-amber-500",
  completed: "bg-emerald-500",
  planned: "bg-muted-foreground",
};

export interface ManagerTeamPanelProps {
  accessToken: string;
  /** The Manager's own live-checked AI connection. No verified path, no worker. */
  connected: boolean;
}

export function ManagerTeamPanel({ accessToken, connected }: ManagerTeamPanelProps) {
  const consult = useServerFn(consultRoomWorker);
  const [openSeat, setOpenSeat] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  /** Each seat keeps its own bounded thread, in memory only. */
  const [threads, setThreads] = useState<Record<string, WorkerTurn[]>>({});
  const [answers, setAnswers] = useState<Record<string, ConsultReply>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ask = async (seatId: string, roomId: string) => {
    const text = question.trim();
    if (!text || runningId) return;
    const key = threadKey(seatId, roomId);
    setRunningId(seatId);
    setErrors((current) => ({ ...current, [seatId]: "" }));
    try {
      const reply = await consult({
        data: { accessToken, workerId: seatId, room: roomId, question: text, taskId: null, thread: threads[key] ?? [] },
      });
      setAnswers((current) => ({ ...current, [seatId]: reply }));
      if (reply.ok && reply.answer) {
        setThreads((current) => ({ ...current, [key]: reply.thread }));
        setQuestion("");
      } else {
        setErrors((current) => ({ ...current, [seatId]: reply.detail || "No usable answer came back." }));
      }
    } catch {
      setErrors((current) => ({ ...current, [seatId]: "The consultation could not be completed." }));
    } finally {
      setRunningId(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <p className="text-xs text-muted-foreground">
        Every seat below is a read-only adviser you consult on demand. None of them can approve, spend, send, deploy or
        change a record, and none of them do anything unless you ask. Each keeps its own separate conversation.
      </p>

      {WORKER_SEATS.map((seat) => {
        const state: WorkerConnectionState =
          runningId === seat.id ? "working" : !connected || !accessToken ? "planned" : answers[seat.id]?.ok ? "completed" : "available";
        const reply = answers[seat.id];
        const key = threadKey(seat.id, seat.roomId);
        const thread = threads[key] ?? [];
        const expanded = openSeat === seat.id;

        return (
          <div key={seat.id} className="rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[state]}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{seat.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{seat.role}</p>
              </div>
              <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                {WORKER_STATE_LABELS[state]}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Can look at: {seat.scope}</p>

            <Button
              size="sm"
              variant="outline"
              className="mt-2 h-8"
              aria-expanded={expanded}
              onClick={() => setOpenSeat(expanded ? null : seat.id)}
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              {expanded ? "Close" : thread.length ? `Continue (${thread.length})` : "Ask a question"}
            </Button>

            {expanded && (
              <div className="mt-2 space-y-2">
                {thread.map((turn, index) => (
                  <p
                    key={`${key}-${index}`}
                    className={
                      turn.role === "question"
                        ? "whitespace-pre-wrap rounded-md bg-primary/10 p-2 text-xs text-foreground"
                        : "whitespace-pre-wrap text-xs text-foreground"
                    }
                  >
                    {turn.role === "question" ? "You: " : `${seat.name}: `}
                    {turn.content}
                  </p>
                ))}

                {reply?.ok && reply.answer && (
                  <div className="rounded-md border border-border bg-secondary/40 p-2 text-xs">
                    <p className="font-semibold text-foreground">{reply.answer.conclusion}</p>
                    <p className="mt-1 text-muted-foreground">
                      Evidence used: {reply.answer.evidenceUsed.join("; ") || "none stated"}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Confidence: {reply.answer.confidence} · Missing evidence:{" "}
                      {reply.answer.missingEvidence.join("; ") || "none stated"}
                    </p>
                    <p className="mt-1 text-muted-foreground">Suggested next step: {reply.answer.nextStep}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Answered {new Date(reply.answeredAt).toLocaleString()} · {reply.model ?? "model not stated"} · advice
                      only, nothing was changed.
                    </p>
                  </div>
                )}

                {errors[seat.id] && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors[seat.id]}
                  </p>
                )}

                <Textarea
                  rows={2}
                  value={openSeat === seat.id ? question : ""}
                  maxLength={MAX_WORKER_QUESTION}
                  aria-label={`Ask ${seat.name} a question`}
                  placeholder={`Ask ${seat.name} about ${seat.roomId}…`}
                  onChange={(event) => setQuestion(event.target.value)}
                />
                <Button
                  size="sm"
                  className="h-9"
                  disabled={!question.trim() || runningId !== null || !connected || !accessToken}
                  onClick={() => void ask(seat.id, seat.roomId)}
                >
                  {runningId === seat.id ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}
                  Ask {seat.name}
                </Button>
                {(!connected || !accessToken) && (
                  <p className="text-[11px] text-muted-foreground">
                    This seat is planned only until the owner is signed in and the Manager's AI connection passes its
                    live check. Nothing is sent meanwhile.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
