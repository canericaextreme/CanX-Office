import { createServerFn } from "@tanstack/react-start";
import { historyDeps, type HistoryDeps } from "./manager-history.functions";
import type { ManagerTask } from "./manager-work.functions";

export const SAFE_HIGHWAYS_TASK_ID = "43da2350-e1aa-4d22-a1da-9885295888be";

/** Read only the canonical Work Board record through the existing owner/MFA gate. */
export async function readSafeHighwaysProgressWith(
  deps: Pick<HistoryDeps, "verify" | "read">,
  accessToken: string,
) {
  const owner = await deps.verify(accessToken);
  if (!owner.ok) return { ok: false as const, message: owner.message };
  const reply = await deps.read(
    accessToken,
    `manager_tasks?owner_id=eq.${encodeURIComponent(owner.userId)}&id=eq.${SAFE_HIGHWAYS_TASK_ID}&select=*&limit=1`,
  );
  if (!reply.ok || !Array.isArray(reply.body)) {
    return {
      ok: false as const,
      message: "The assignment could not be read. Progress is unavailable.",
    };
  }
  const task = reply.body[0] as ManagerTask | undefined;
  if (!task || task.id !== SAFE_HIGHWAYS_TASK_ID || task.owner_id !== owner.userId) {
    return { ok: false as const, message: "The canonical Work Board assignment is unavailable." };
  }
  return { ok: true as const, task };
}

export const getSafeHighwaysProgress = createServerFn({ method: "POST" })
  .inputValidator((raw: { accessToken: string }) => ({
    accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "",
  }))
  .handler(async ({ data }) => readSafeHighwaysProgressWith(await historyDeps(), data.accessToken));
