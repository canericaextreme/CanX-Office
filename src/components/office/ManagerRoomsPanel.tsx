"use client";

/**
 * Office Manager — Rooms view.
 *
 * "See this room" takes ONE picture of the CanX Office room that is currently
 * open, using the same marked-root capture the office already uses. There is
 * no camera, no screen sharing, no other tab and no unseen room. The picture is
 * held in memory for this page session only: nothing is stored, logged or
 * written to any record.
 */

import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureOfficeView, officeRoomLabel } from "@/lib/office-observe";
import { observeCurrentRoom } from "@/lib/manager-observe.functions";
import {
  OBSERVE_SCOPE_NOTICE,
  ROOM_STATE_LABELS,
  roomStatuses,
  type RoomReview,
} from "@/lib/manager-console";
import { roomByRoute, type RoomId } from "@/lib/office-data";

const STATE_DOT: Record<string, string> = {
  verified: "bg-emerald-500",
  prepared: "bg-sky-500",
  unknown: "bg-amber-500",
  "not-connected": "bg-muted-foreground",
};

export interface ManagerRoomsPanelProps {
  accessToken: string;
  /** True only when the shared office records were actually read this session. */
  recordsReadable: boolean;
  reviews: Record<string, RoomReview | undefined>;
  onReviewed: (review: RoomReview) => void;
  onRequestReview?: (roomLabel: string) => void;
}

export function ManagerRoomsPanel({ accessToken, recordsReadable, reviews, onReviewed, onRequestReview }: ManagerRoomsPanelProps) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const observe = useServerFn(observeCurrentRoom);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentRoom = roomByRoute(path);
  const currentLabel = officeRoomLabel(path);
  const currentReview = currentRoom ? reviews[currentRoom.id] : undefined;
  const statuses = roomStatuses({ reviews, recordsReadable });

  const seeThisRoom = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // One capture of the marked office root only. A failed capture is
      // reported plainly; there is never a written fallback pretending to see.
      const capture = await captureOfficeView(path);
      if (!capture.ok) {
        setError(capture.message);
        return;
      }
      const reply = await observe({
        data: {
          accessToken,
          path,
          room: capture.observation.room,
          text: capture.observation.text,
          image: capture.observation.image,
        },
      });
      if (!reply.ok || !reply.text) {
        setError(reply.detail || "The Manager could not review this room just now.");
        return;
      }
      if (currentRoom) {
        onReviewed({
          roomId: currentRoom.id as RoomId,
          at: new Date(reply.observedAt).toLocaleString(),
          text: reply.text,
          thumbnail: capture.observation.image,
        });
      }
    } catch {
      setError("The Manager could not review this room just now.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="rounded-lg border border-border bg-secondary/40 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Room open now</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{currentLabel}</p>
        <p className="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <MonitorSmartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {OBSERVE_SCOPE_NOTICE}
        </p>
        <Button size="sm" className="mt-2 h-9" disabled={busy || !accessToken} onClick={() => onRequestReview && currentRoom ? onRequestReview(currentRoom.shortLabel) : void seeThisRoom()}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
          {busy ? "Looking…" : "See this room"}
        </Button>
        {!accessToken && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Sign in as the owner first. Nothing is looked at while signed out.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {currentReview && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Looked at {currentReview.at}
          </p>
          <div className="mt-2 flex gap-3">
            <img
              src={currentReview.thumbnail}
              alt={`The ${currentLabel} room as the Manager saw it`}
              className="h-20 w-28 shrink-0 rounded-md border border-border object-cover object-top"
            />
            <p className="whitespace-pre-wrap text-sm text-foreground">{currentReview.text}</p>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            One picture of this room only. The Manager changed nothing; every improvement above is a suggestion for you
            to apply. This review is kept in memory for this visit and is not saved anywhere.
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Every room, and what the Manager actually knows
        </p>
        <ul className="space-y-1.5">
          {statuses.map((status) => (
            <li key={status.room.id} className="rounded-lg border border-border/70 p-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[status.state]}`} aria-hidden="true" />
                <Link to={status.room.route} className="text-sm font-medium text-foreground underline-offset-2 hover:underline">
                  {status.room.label}
                </Link>
                <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">
                  {ROOM_STATE_LABELS[status.state]}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{status.source}</p>
              {onRequestReview && <Button size="sm" variant="outline" className="mt-2" disabled={!accessToken} onClick={() => onRequestReview(status.room.shortLabel)}>Inspect {status.room.shortLabel}</Button>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ask Astra to check any named room, or use its Inspect button. Astra opens the room and returns a fresh review. A directory entry is never a visual inspection.
        </p>
      </div>
    </div>
  );
}
