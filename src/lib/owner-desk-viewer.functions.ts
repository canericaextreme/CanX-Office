/**
 * The Owner's Desk as an assistant's read-only viewer sees it — READ ONLY.
 *
 * Room pictures are taken by each assistant's own viewing identity, which the
 * owner workbench (loadManagerMemory) refuses. This reads the same tasks,
 * approvals and change log with the viewer's own token, so the database's
 * viewing grant (office_view_read) decides every row. Nothing here writes, the
 * AI budget is never shared with a viewer, and an owner session is refused so
 * the owner keeps using loadManagerMemory unchanged.
 */

import { createServerFn } from "@tanstack/react-start";
import type { OwnerVerification } from "@/lib/canx-backend.server";
import type { ManagerApproval, ManagerChange, ManagerTask, ManagerWorkError } from "@/lib/manager-work.functions";

export interface ViewerDeskMemory {
  ok: true;
  readOnly: true;
  tasks: ManagerTask[];
  approvals: ManagerApproval[];
  changes: ManagerChange[];
}

export interface ViewerDeskDeps {
  verifyRead: (token: string) => Promise<OwnerVerification>;
  get: <T>(token: string, path: string) => Promise<{ ok: boolean; data?: T; error?: string }>;
}

function fail(code: ManagerWorkError["code"], message: string): ManagerWorkError {
  return { ok: false, code, message };
}

export async function loadViewerDeskMemoryWith(deps: ViewerDeskDeps, token: string): Promise<ViewerDeskMemory | ManagerWorkError> {
  const v = await deps.verifyRead(token);
  if (!v.ok) return fail("auth_not_ready", v.message);
  if (v.aal !== "viewer") return fail("forbidden", "This read-only copy is only for an assistant's viewing session.");

  const owner = encodeURIComponent(v.userId);
  const [tasks, approvals, changes] = await Promise.all([
    deps.get<ManagerTask[]>(token, `manager_tasks?owner_id=eq.${owner}&order=created_at.desc`),
    deps.get<ManagerApproval[]>(token, `manager_approvals?owner_id=eq.${owner}&order=created_at.desc`),
    deps.get<ManagerChange[]>(token, `manager_changes?owner_id=eq.${owner}&entity=neq.manager_conversation&order=at.desc&limit=50`),
  ]);

  if (!tasks.ok) return fail("context_unavailable", tasks.error ?? "Could not read tasks.");
  if (!approvals.ok) return fail("context_unavailable", approvals.error ?? "Could not read approvals.");
  if (!changes.ok) return fail("context_unavailable", changes.error ?? "Could not read change log.");

  return { ok: true, readOnly: true, tasks: tasks.data ?? [], approvals: approvals.data ?? [], changes: changes.data ?? [] };
}

export const loadViewerDeskMemory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const raw = input as { accessToken?: unknown } | undefined;
    return { accessToken: typeof raw?.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "" };
  })
  .handler(async ({ data }) => {
    const backend = await import("@/lib/canx-backend.server");
    const viewer = await import("@/lib/canx-viewer.server");
    const config = backend.readBackendConfig();
    return loadViewerDeskMemoryWith(
      {
        verifyRead: (token) => viewer.verifyOwnerOrViewerReadWith(config, token, true),
        get: async <T>(token: string, path: string) => {
          if (!config) return { ok: false, error: "No CanX-owned database is configured." };
          const result = await backend.restRequest(config, token, path, { method: "GET" });
          if (!result.ok) return { ok: false, error: `Request failed (${result.status}).` };
          return { ok: true, data: result.body as unknown as T };
        },
      },
      data.accessToken,
    );
  });
