/**
 * Shared "Claude — Second Eyes" state for the whole office.
 *
 * Session only, on purpose: the latest review stays visible while John moves
 * between rooms in this browser tab, and it disappears when the tab closes.
 * Nothing here is written to a database, to browser storage, or to a file, and
 * nothing here ever starts a review — a paid Claude call only ever happens
 * because John pressed a button.
 */

import {
  REVIEW_AREAS,
  type ClaudeAreaFinding,
  type ClaudeReviewReply,
  type ReviewArea,
} from "@/lib/claude-review.functions";

/** Shown when Claude returned no usable finding for one of the six areas. */
export const UNREVIEWED_AREA_TEXT =
  "No completed Claude finding was returned for this area; treat it as unreviewed.";

/**
 * A whole-office result always shows all six areas, in the fixed order, using
 * the first finding Claude gave for each. A missing or duplicated area is
 * reported as unreviewed — never filled in with an invented finding.
 */
export function sixAreaFindings(findings: ClaudeAreaFinding[] | undefined): {
  area: ReviewArea;
  finding: string;
  reviewed: boolean;
}[] {
  const first = new Map<ReviewArea, string>();
  for (const item of findings ?? []) {
    const text = typeof item?.finding === "string" ? item.finding.trim() : "";
    if (!text) continue;
    const area = REVIEW_AREAS.find((option) => option === item.area);
    if (!area || first.has(area)) continue;
    first.set(area, text);
  }
  return REVIEW_AREAS.map((area) => {
    const finding = first.get(area);
    return finding
      ? { area, finding, reviewed: true }
      : { area, finding: UNREVIEWED_AREA_TEXT, reviewed: false };
  });
}

export interface SecondEyesPrefill {
  subject: string;
  primaryRecommendation: string;
  evidence: string;
  question: string;
  /** Where this material came from, shown plainly above the form. */
  evidenceSource: string;
}

export interface SecondEyesState {
  /** Latest completed review, kept for this browser session only. */
  lastReview: ClaudeReviewReply | null;
  /** Room label the last review was taken from. */
  lastRoom: string | null;
  prefill: SecondEyesPrefill | null;
  /** Bumped whenever something asks for the panel to open. */
  openRequests: number;
}

let state: SecondEyesState = { lastReview: null, lastRoom: null, prefill: null, openRequests: 0 };
const listeners = new Set<() => void>();

function emit() {
  state = { ...state };
  for (const listener of listeners) listener();
}

export function getSecondEyesState(): SecondEyesState {
  return state;
}

export function subscribeSecondEyes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Records a review that actually completed. Never called for a refusal. */
export function rememberReview(reply: ClaudeReviewReply, room: string): void {
  state.lastReview = reply;
  state.lastRoom = room;
  emit();
}

export function clearRemembered(): void {
  state.lastReview = null;
  state.lastRoom = null;
  emit();
}

/**
 * Opens the shared panel, optionally filling the manual form. This never sends
 * anything to Claude: John still presses the review button himself.
 */
export function openSecondEyes(prefill?: SecondEyesPrefill): void {
  state.prefill = prefill ?? null;
  state.openRequests += 1;
  emit();
}

export function consumePrefill(): SecondEyesPrefill | null {
  const value = state.prefill;
  if (value) {
    state.prefill = null;
    emit();
  }
  return value;
}

/** Turns an Office Manager answer into review material, without sending it. */
export function managerRecommendationPrefill(answer: string): SecondEyesPrefill {
  return {
    subject: "Office Manager recommendation",
    primaryRecommendation: answer.slice(0, 6000),
    evidence: "",
    question: "Is this recommendation sound? Say plainly where you disagree and what evidence is missing.",
    evidenceSource: "Taken from an Office Manager answer in this browser session.",
  };
}
