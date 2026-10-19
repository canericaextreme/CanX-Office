import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelManagerTask,
  decideManagerApproval,
  updateManagerTask,
} from "@/lib/manager-work.functions";
import type { BrainTaskInfo, NeedsItem } from "@/lib/brain-view";
import {
  canQuickApprove,
  confirmText,
  type NeedsAction as Action,
} from "@/lib/brain-needs-actions";
import { brainRoomLabel } from "@/lib/brain-view-layout";
import { sendManagerHandoff } from "@/lib/companion-bridge";

const KIND_LABEL: Record<NeedsItem["kind"], string> = {
  approval: "Approval box",
  waiting: "On hold",
  quiet: "No change for a week",
};

const KIND_TONE: Record<NeedsItem["kind"], string> = {
  approval: "border-[#3987e5]/60 text-[#9cc3f2]",
  waiting: "border-[#d95926]/60 text-[#f0a37f]",
  quiet: "border-slate-500/60 text-slate-300",
};

function money(cents: number | null) {
  return cents == null ? "" : ` · est. ${(cents / 100).toFixed(2)}`;
}

/**
 * "Needs you": everything waiting on John, in plain words, each with
 * Approve and Archive. Uses the Office's existing owner-checked actions
 * (the same ones as the Approvals room and the Work Board), and always
 * asks before acting.
 */
export function BrainNeedsYou({
  items,
  tasks,
  token,
  canAct,
  onDone,
}: {
  items: NeedsItem[] | null;
  /** The saved tasks, so a resume sends back their exact title, detail and project. */
  tasks: BrainTaskInfo[];
  token: string | null;
  canAct: boolean;
  onDone: () => void;
}) {
  const decide = useServerFn(decideManagerApproval);
  const update = useServerFn(updateManagerTask);
  const cancel = useServerFn(cancelManagerTask);
  const [pending, setPending] = useState<{ id: string; action: Action } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Same call as the Work Board's own buttons: title, detail, project and risk go back unchanged
  // (the server would otherwise blank them); only the status changes.
  async function resume(item: NeedsItem) {
    const t = tasks.find((x) => x.id === item.id);
    if (!t)
      return {
        ok: false as const,
        message: "That task could not be found on the Work Board just now. Nothing changed.",
      };
    return update({
      data: {
        accessToken: token!,
        taskId: item.id,
        title: t.saved.title,
        detail: t.saved.detail,
        project: t.saved.project,
        risk: t.risk as "green" | "yellow" | "red",
        status: "in_progress",
      },
    });
  }

  async function run(item: NeedsItem, action: Action) {
    if (!token) return;
    setBusy(item.id);
    setNotice(null);
    try {
      const result =
        item.kind === "approval"
          ? await decide({
              data: {
                accessToken: token,
                approvalId: item.id,
                decision: action === "approve" ? "approved" : "declined",
              },
            })
          : action === "approve"
            ? await resume(item)
            : await cancel({
                data: {
                  accessToken: token,
                  taskId: item.id,
                  reason: "Archived by John from the Brain room (live Brain view).",
                },
              });
      const failed =
        result &&
        typeof result === "object" &&
        "ok" in result &&
        (result as { ok: unknown }).ok === false;
      if (failed) {
        setNotice({
          id: item.id,
          ok: false,
          text: (result as { message?: string }).message ?? "That was not saved. Nothing changed.",
        });
      } else {
        setNotice({
          id: item.id,
          ok: true,
          text:
            action === "archive"
              ? `Archived “${item.title}”.`
              : item.kind === "approval"
                ? `Approved “${item.title}”.`
                : `Resumed “${item.title}”.`,
        });
        window.dispatchEvent(new CustomEvent("canx:workbench-changed"));
        onDone();
      }
    } catch {
      setNotice({
        id: item.id,
        ok: false,
        text: "That could not be confirmed. Check the Work Board before trying again.",
      });
    } finally {
      setBusy(null);
      setPending(null);
    }
  }

  return (
    <section
      aria-labelledby="needs-you-title"
      className="space-y-2 rounded-lg border border-border p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="needs-you-title" className="text-sm font-semibold">
          Needs you{items ? ` (${items.length})` : ""}
        </h3>
        <span className="text-xs text-muted-foreground">
          Approve to move it forward, or archive it. Nothing is deleted.
        </span>
      </div>
      {notice && !items?.some((i) => i.id === notice.id) ? (
        <p role="status" className={`text-xs ${notice.ok ? "text-[#7fd1ad]" : "text-[#f0a37f]"}`}>
          {notice.text}
        </p>
      ) : null}
      {items === null ? (
        <p className="text-sm text-muted-foreground">
          The Work Board or approval box could not be read just now, so this list isn't shown rather
          than guessing.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const confirming = pending?.id === item.id;
            const quick = canQuickApprove(item);
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${KIND_TONE[item.kind]}`}
                    >
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {brainRoomLabel(item.room)}
                      {item.risk === "red"
                        ? " · red risk"
                        : item.risk === "yellow"
                          ? " · yellow risk"
                          : ""}
                      {money(item.costCents)}
                    </span>
                  </div>
                  <p className="break-words text-sm font-medium text-foreground">{item.title}</p>
                  <p className="break-words text-xs text-muted-foreground">{item.why}</p>
                  {confirming ? (
                    <p role="alert" className="pt-1 text-xs text-foreground">
                      {confirmText(item, pending.action)}
                    </p>
                  ) : null}
                  {notice?.id === item.id ? (
                    <p
                      role="status"
                      className={`text-xs ${notice.ok ? "text-[#7fd1ad]" : "text-[#f0a37f]"}`}
                    >
                      {notice.text}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {!canAct ? (
                    <span className="text-xs text-muted-foreground">Read-only view</span>
                  ) : confirming ? (
                    <>
                      <button
                        type="button"
                        disabled={busy === item.id}
                        onClick={() => void run(item, pending.action)}
                        className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
                      >
                        {busy === item.id
                          ? "Saving…"
                          : pending.action === "archive"
                            ? "Yes, archive"
                            : "Yes, approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending(null)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {quick ? (
                        <button
                          type="button"
                          aria-label={`Approve: ${item.title}`}
                          onClick={() => setPending({ id: item.id, action: "approve" })}
                          className="rounded-md border border-[#199e70] px-3 py-1.5 text-xs font-semibold text-[#7fd1ad] hover:bg-[#199e70]/15"
                        >
                          {item.kind === "approval" ? "Approve" : "Approve & resume"}
                        </button>
                      ) : (
                        <a
                          href="/approvals"
                          className="rounded-md border border-[#199e70] px-3 py-1.5 text-xs font-semibold text-[#7fd1ad]"
                        >
                          Approve in Approvals
                        </a>
                      )}
                      <button
                        type="button"
                        aria-label={`Archive: ${item.title}`}
                        onClick={() => setPending({ id: item.id, action: "archive" })}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Archive
                      </button>
                      <button
                        type="button"
                        aria-label={`Ask Elsie about: ${item.title}`}
                        onClick={() =>
                          sendManagerHandoff({
                            text: `Explain this item from the Brain room's Needs-you list and what you'd recommend (approve or archive), using the work logbook and Work Board: "${item.title}" — ${item.why}`,
                            room: "brain",
                            path: "/brain",
                            source: "room_button",
                          })
                        }
                        className="rounded-md px-2 py-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        Ask Elsie
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
