import type { NeedsItem } from "./brain-view";

export type NeedsAction = "approve" | "archive";

/** What each button will really do, said plainly before John confirms. */
export function confirmText(item: NeedsItem, action: NeedsAction): string {
  if (action === "archive") {
    return item.kind === "approval"
      ? "Archive this request? It is recorded as declined. Nothing is deleted, and it stays in the approval history."
      : "Archive this task? It is set aside as cancelled with a note that you archived it from the Brain. Nothing is deleted; its history stays.";
  }
  if (item.kind === "approval")
    return `Approve this request${item.costCents ? ` (estimated cost ${(item.costCents / 100).toFixed(2)})` : ""}? It goes onto the Work Board as approved work. This does not publish or merge anything by itself.`;
  return "Approve and resume? This records your go-ahead and puts the task back in progress. It does not start a paid build, merge or publish anything by itself.";
}

/** Red-risk tasks go through the approval box, never a one-tap resume. */
export const canQuickApprove = (item: NeedsItem) => item.kind === "approval" || item.risk !== "red";
