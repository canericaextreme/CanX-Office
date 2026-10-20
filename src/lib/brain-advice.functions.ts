import { createServerFn } from "@tanstack/react-start";
import type { Advice, FactSheet, FactSheetGitHub } from "./brain-advice";

const OFFICE_REPO = "canericaextreme/CanX-Office";
const ESTIMATED_CENTS = 3;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdviceRest = (
  path: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; body: unknown }>;
/** Read-only GitHub reader limited to one draft change or one build run of the Office repository. */
export type AdviceGitHub = (
  path: string,
) => Promise<{ ok: boolean; status: number; body: unknown }>;

export type AdviceResult =
  | { ok: true; advice: Advice; facts: FactSheet; advisedAt: string }
  | { ok: false; message: string; facts?: FactSheet };

const rowsOf = (r: { ok: boolean; body: unknown } | null) =>
  r?.ok && Array.isArray(r.body) ? (r.body as Array<Record<string, unknown>>) : null;

/** Narrow GitHub reader: only one draft change, one build run, or the draft change a build produced, on the Office repository. */
export function adviceGitHubReader(
  token: string | undefined,
  fetchImpl: typeof fetch = fetch,
): AdviceGitHub | null {
  const credential = token?.trim();
  if (!credential) return null;
  return async (path) => {
    if (
      !/^\/(pulls\/\d{1,6}|actions\/runs\/\d{8,12}|pulls\?state=all&head=canericaextreme:(claude|codex)\/office-\d{8,12}&per_page=5)$/.test(
        path,
      )
    )
      return { ok: false, status: 400, body: null };
    const res = await fetchImpl(`https://api.github.com/repos/${OFFICE_REPO}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${credential}`,
        "User-Agent": "CanX-Office-brain-advice",
      },
    });
    return {
      ok: res.ok,
      status: res.status,
      body: res.ok ? await res.json().catch(() => null) : null,
    };
  };
}

/** Build the fact sheet from fresh owner reads. Returns null when the item itself can't be found. */
export async function readFactSheetWith(
  deps: { rest: AdviceRest; github: AdviceGitHub | null; now: Date },
  kind: "task" | "approval",
  id: string,
): Promise<FactSheet | null> {
  const { buildFactSheet, githubRefs, changeState, runState } = await import("./brain-advice");
  const get = (p: string) => deps.rest(p).catch(() => null);
  const enc = encodeURIComponent(id);
  const main = rowsOf(
    await get(
      kind === "task"
        ? `manager_tasks?select=id,title,detail,status,worker,risk,result,evidence,waiting_reason,project,created_at,updated_at&id=eq.${enc}&limit=1`
        : `manager_approvals?select=id,title,detail,cost_cents,risk,status,task_id,created_at,decided_at&id=eq.${enc}&limit=1`,
    ),
  );
  const row = main?.[0];
  if (!row) return null;
  const taskId = kind === "task" ? id : typeof row["task_id"] === "string" ? row["task_id"] : null;
  const [linked, approvals, events, changes] = await Promise.all([
    kind === "approval" && taskId
      ? get(
          `manager_tasks?select=id,title,detail,status,worker,risk,result,evidence,waiting_reason,project,created_at,updated_at&id=eq.${encodeURIComponent(taskId)}&limit=1`,
        )
      : Promise.resolve(null),
    taskId
      ? get(
          `manager_approvals?select=title,status,cost_cents,created_at,decided_at&task_id=eq.${encodeURIComponent(taskId)}&order=created_at.desc&limit=10`,
        )
      : Promise.resolve({ ok: true, status: 200, body: [] }),
    taskId
      ? get(
          `office_work_events?select=occurred_at,from_room,to_room,from_stage,to_stage,source&subject_id=eq.${encodeURIComponent(taskId)}&order=occurred_at.desc&limit=15`,
        )
      : Promise.resolve({ ok: true, status: 200, body: [] }),
    get(`manager_changes?select=at,action,after&entity_id=eq.${enc}&order=at.desc&limit=10`),
  ]);
  const linkedTask = rowsOf(linked)?.[0] ?? null;
  const task = kind === "task" ? row : linkedTask;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  // The task's build receipt (JSON in evidence) names its run; read it the same way the Work Board does.
  const { taskExecutionEvidence } = await import("./task-execution-evidence");
  const receipt = taskExecutionEvidence(text(task?.["evidence"]));
  const refs = githubRefs(
    text(row["title"]),
    text(row["detail"]),
    text(task?.["waiting_reason"]),
    text(task?.["result"]),
    text(task?.["evidence"]),
    text(task?.["detail"]),
    receipt?.url ?? "",
  );
  let github: FactSheetGitHub[] | null = [];
  if (refs.changes.length || refs.runs.length) {
    if (!deps.github) github = null;
    else {
      const gh = deps.github;
      const reads = await Promise.all([
        ...refs.changes.map(async (n) => {
          const r = await gh(`/pulls/${n}`).catch(() => null);
          return r?.ok && r.body && typeof r.body === "object"
            ? {
                ref: `#${n}`,
                kind: "change" as const,
                state: changeState(r.body as Record<string, unknown>),
              }
            : {
                ref: `#${n}`,
                kind: "change" as const,
                state:
                  r?.status === 404 ? "not found in the Office repository" : "could not be read",
              };
        }),
        ...refs.runs.map(async (n) => {
          const r = await gh(`/actions/runs/${n}`).catch(() => null);
          if (!(r?.ok && r.body && typeof r.body === "object"))
            return { ref: `run ${n}`, kind: "run" as const, state: "could not be read" };
          const run = r.body as Record<string, unknown>;
          let state = runState(run);
          // A passing build made a draft change: say what happened to it.
          if (state === "build passed") {
            const who = /codex/i.test(String(run["path"] ?? run["name"] ?? ""))
              ? "codex"
              : "claude";
            const prs = await gh(
              `/pulls?state=all&head=canericaextreme:${who}/office-${n}&per_page=5`,
            ).catch(() => null);
            const pr =
              prs?.ok && Array.isArray(prs.body)
                ? (prs.body[0] as Record<string, unknown> | undefined)
                : undefined;
            state +=
              pr && typeof pr["number"] === "number"
                ? `; its draft change #${pr["number"]} is ${changeState(pr)}`
                : "; no draft change was found for it";
          }
          return { ref: `run ${n}`, kind: "run" as const, state };
        }),
      ]);
      github = reads;
    }
  }
  return buildFactSheet({
    kind,
    row,
    linkedTask,
    approvals: rowsOf(approvals),
    events: rowsOf(events),
    changes: rowsOf(changes),
    github,
    now: deps.now,
  });
}

export interface AdviceDeps {
  rest: AdviceRest;
  github: AdviceGitHub | null;
  reserve: (
    cents: number,
  ) => Promise<{ allowed: true; reservationId: string } | { allowed: false; message: string }>;
  settle: (reservationId: string, outcome: "ok" | "failed") => Promise<void>;
  ask: (
    instructions: string,
    input: string,
  ) => Promise<{ ok: true; text: string } | { ok: false; status: number }>;
  now: () => Date;
}

/** One advice request: fresh facts → budget reservation → one Elsie call → checked JSON. Never changes any record. */
export async function adviseWith(
  deps: AdviceDeps,
  kind: "task" | "approval",
  id: string,
): Promise<AdviceResult> {
  const { factSheetText, ADVISOR_INSTRUCTIONS, parseAdvice } = await import("./brain-advice");
  const facts = await readFactSheetWith(
    { rest: deps.rest, github: deps.github, now: deps.now() },
    kind,
    id,
  );
  if (!facts)
    return {
      ok: false,
      message: "That item could not be found just now, so Elsie has nothing to advise on.",
    };
  const reservation = await deps.reserve(ESTIMATED_CENTS);
  if (!reservation.allowed) return { ok: false, message: reservation.message, facts };
  let outcome: "ok" | "failed" = "failed";
  try {
    const reply = await deps.ask(ADVISOR_INSTRUCTIONS, `FACT SHEET\n${factSheetText(facts)}`);
    if (!reply.ok)
      return {
        ok: false,
        message: `Elsie couldn't be reached just now (provider status ${reply.status}). The facts are shown so you can decide.`,
        facts,
      };
    const advice = parseAdvice(reply.text);
    if (!advice)
      return {
        ok: false,
        message:
          "Elsie's answer didn't follow the advice format, so it isn't shown rather than guessed at. The facts are shown so you can decide.",
        facts,
      };
    // Red-risk tasks never get a one-tap approve recommendation.
    if (facts.risk === "red" && advice.verdict === "approve") {
      advice.summary = `${advice.summary} Because it is red risk, approve it in the Approvals room.`;
    }
    outcome = "ok";
    return { ok: true, advice, facts, advisedAt: deps.now().toISOString() };
  } catch {
    return {
      ok: false,
      message: "Elsie's advice could not be completed. Nothing was changed.",
      facts,
    };
  } finally {
    await deps.settle(reservation.reservationId, outcome).catch(() => undefined);
  }
}

/** Server function: owner-only, read-only, one budgeted Elsie call. */
export const getBrainAdvice = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => {
    const raw = (v ?? {}) as { accessToken?: unknown; kind?: unknown; id?: unknown };
    return {
      accessToken: typeof raw.accessToken === "string" ? raw.accessToken.slice(0, 4000) : "",
      kind: raw.kind === "approval" ? ("approval" as const) : ("task" as const),
      id: typeof raw.id === "string" ? raw.id.slice(0, 80) : "",
    };
  })
  .handler(async ({ data }): Promise<AdviceResult> => {
    if (!UUID.test(data.id)) return { ok: false, message: "That item isn't recognised." };
    const b = await import("./canx-backend.server");
    const config = b.readBackendConfig();
    if (!config) return { ok: false, message: b.DENY_MESSAGES.backend_not_configured };
    const owner = await b.verifyOwner(data.accessToken);
    if (!owner.ok) return { ok: false, message: owner.message };
    const { readSetting } = await import("./manager.functions");
    const key = readSetting(process.env["OPENAI_API_KEY"]);
    const model = readSetting(process.env["OPENAI_MODEL"]);
    if (!key || !model)
      return {
        ok: false,
        message:
          "Elsie's connection isn't configured on the Office server, so no advice was requested.",
      };
    return adviseWith(
      {
        rest: (p, i) => b.restRequest(config, data.accessToken, p, i),
        github: adviceGitHubReader(process.env["CANX_CODEX_GITHUB_TOKEN"]),
        reserve: async (cents) => {
          const r = await b.reserveAiCallWith(config, data.accessToken, cents);
          return r.allowed
            ? { allowed: true, reservationId: r.reservationId }
            : { allowed: false, message: r.message };
        },
        settle: (id, outcome) => b.settleAiCallWith(config, data.accessToken, id, outcome),
        ask: async (instructions, input) => {
          const res = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(30000),
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              model,
              store: false,
              instructions,
              input: [{ role: "user", content: input }],
              max_output_tokens: 600,
            }),
          });
          if (!res.ok) return { ok: false, status: res.status };
          const body = (await res.json().catch(() => null)) as {
            output_text?: unknown;
            output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
          } | null;
          const text =
            typeof body?.output_text === "string"
              ? body.output_text
              : (body?.output ?? [])
                  .flatMap((o) => o.content ?? [])
                  .filter((c) => c.type === "output_text")
                  .map((c) => c.text ?? "")
                  .join("");
          return { ok: true, text };
        },
        now: () => new Date(),
      },
      data.kind,
      data.id,
    );
  });
