/**
 * Office Manager server adapter.
 *
 * Preferred provider: OpenAI Responses API, called directly with a CanX-owned
 * key (`OPENAI_API_KEY`). The key is read inside the handler and never leaves
 * the server. If no key is configured the manager reports an honest
 * disconnected state — it never fabricates an AI reply.
 *
 * An optional Lovable AI Gateway path exists but is OFF unless
 * `CANX_AI_GATEWAY_ENABLED=true` is set deliberately, because that route is
 * billed and keyed through Lovable rather than a CanX-owned account.
 */

import { createServerFn } from "@tanstack/react-start";

export interface ManagerStatus {
  provider: "openai" | "lovable-gateway" | "none";
  connected: boolean;
  model: string | null;
  detail: string;
  gatewayAvailable: boolean;
  gatewayEnabled: boolean;
}

export type ManagerToolArgs = Record<string, string | number | boolean>;

export interface ManagerToolCall {
  name: string;
  arguments: ManagerToolArgs;
}

function toolArgs(raw: string | undefined): ManagerToolArgs {
  const out: ManagerToolArgs = {};
  try {
    const parsed = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[key] = value;
      }
    }
  } catch {
    /* ignore malformed tool arguments */
  }
  return out;
}

export interface ManagerReply {
  ok: boolean;
  code: "ok" | "not_configured" | "provider_error" | "invalid_input";
  provider: ManagerStatus["provider"];
  model: string | null;
  text: string;
  toolCalls: ManagerToolCall[];
  detail?: string;
}

const MAX_MESSAGES = 20;
const MAX_CHARS = 6000;

function readConfig() {
  const openaiKey = process.env["OPENAI_API_KEY"];
  const gatewayKey = process.env["LOVABLE_API_KEY"];
  const gatewayEnabled = process.env["CANX_AI_GATEWAY_ENABLED"] === "true";
  const model = process.env["OPENAI_MODEL"] ?? "gpt-4.1-mini";
  return { openaiKey, gatewayKey, gatewayEnabled, model };
}

function statusFrom(): ManagerStatus {
  const { openaiKey, gatewayKey, gatewayEnabled, model } = readConfig();
  if (openaiKey) {
    return {
      provider: "openai",
      connected: true,
      model,
      detail: "Connected to OpenAI with a CanX-owned key held on the server.",
      gatewayAvailable: Boolean(gatewayKey),
      gatewayEnabled,
    };
  }
  if (gatewayEnabled && gatewayKey) {
    return {
      provider: "lovable-gateway",
      connected: true,
      model: "openai/gpt-6-astra",
      detail: "Connected through the Lovable AI Gateway (billed to the Lovable workspace, not a CanX-owned account).",
      gatewayAvailable: true,
      gatewayEnabled,
    };
  }
  return {
    provider: "none",
    connected: false,
    model: null,
    detail: "No CanX-owned AI key is configured on the server, so the manager cannot answer with AI.",
    gatewayAvailable: Boolean(gatewayKey),
    gatewayEnabled,
  };
}

export const getManagerStatus = createServerFn({ method: "GET" }).handler(async (): Promise<ManagerStatus> =>
  statusFrom(),
);

const TOOLS = [
  {
    type: "function" as const,
    name: "preview_appearance",
    description:
      "Preview allowlisted CanX Office appearance settings. Preview only — John applies or undoes it himself.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        surface: { type: "string", enum: ["graphite", "charcoal", "slate"] },
        transparency: { type: "number", minimum: 0, maximum: 80 },
        accent: { type: "string", enum: ["canx-red", "amber", "blue", "green"] },
        density: { type: "string", enum: ["comfortable", "compact"] },
        motion: { type: "string", enum: ["full", "reduced"] },
        reason: { type: "string" },
      },
    },
  },
  {
    type: "function" as const,
    name: "propose_task",
    description: "Propose an internal office task or decision for John to save. Saving is always John's action.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["title"],
      properties: {
        title: { type: "string" },
        detail: { type: "string" },
        kind: { type: "string", enum: ["task", "decision"] },
        owner: { type: "string" },
      },
    },
  },
];

const SYSTEM_PROMPT = `You are the CanX Office Manager for John Cantlon's CanX Office.

Hard rules:
- Never claim live data, measured performance, real worker activity, or completed external actions. The office has no live connections.
- All office records you are given are labelled demonstration data. Say so when you quote them.
- You cannot run code, deploy, send messages, spend money, or touch Safe Highways, Trail Tales, or any other project.
- Your only actions are the two provided tools: previewing allowlisted appearance settings, and proposing a task or decision for John to save.
- Never impersonate Claude or any other reviewer.
- Be brief, plain, and practical. Short paragraphs or short lists. No jargon.`;

interface ChatInput {
  messages: { role: "user" | "assistant"; content: string }[];
  context: string;
}

function validate(input: unknown): ChatInput {
  const raw = input as Partial<ChatInput> | undefined;
  const messages = Array.isArray(raw?.messages) ? raw!.messages : [];
  const clean = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  return { messages: clean, context: typeof raw?.context === "string" ? raw.context.slice(0, MAX_CHARS) : "" };
}

async function callOpenAI(key: string, model: string, data: ChatInput): Promise<ManagerReply> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      instructions: `${SYSTEM_PROMPT}\n\nCurrent office context:\n${data.context}`,
      input: data.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: TOOLS,
      max_output_tokens: 900,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      code: "provider_error",
      provider: "openai",
      model,
      text: "",
      toolCalls: [],
      detail: `OpenAI request failed [${response.status}]: ${body.slice(0, 500)}`,
    };
  }

  const payload = (await response.json()) as {
    output?: { type: string; name?: string; arguments?: string; content?: { type: string; text?: string }[] }[];
    output_text?: string;
  };

  const text =
    payload.output_text ??
    (payload.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();

  const toolCalls: ManagerToolCall[] = (payload.output ?? [])
    .filter((item) => item.type === "function_call" && item.name)
    .map((item) => ({ name: item.name!, arguments: toolArgs(item.arguments) }));

  return { ok: true, code: "ok", provider: "openai", model, text, toolCalls };
}

async function callGateway(key: string, data: ChatInput): Promise<ManagerReply> {
  const model = "openai/gpt-6-astra";
  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      instructions: `${SYSTEM_PROMPT}\n\nCurrent office context:\n${data.context}`,
      input: data.messages.map((m) => ({ role: m.role, content: m.content })),
      tools: TOOLS,
      reasoning: { effort: "low" },
      max_output_tokens: 900,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      code: "provider_error",
      provider: "lovable-gateway",
      model,
      text: "",
      toolCalls: [],
      detail: `Gateway request failed [${response.status}]: ${body.slice(0, 500)}`,
    };
  }

  const payload = (await response.json()) as {
    output?: { type: string; name?: string; arguments?: string; content?: { type: string; text?: string }[] }[];
    output_text?: string;
  };
  const text =
    payload.output_text ??
    (payload.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();
  const toolCalls: ManagerToolCall[] = (payload.output ?? [])
    .filter((item) => item.type === "function_call" && item.name)
    .map((item) => ({ name: item.name!, arguments: toolArgs(item.arguments) }));
  return { ok: true, code: "ok", provider: "lovable-gateway", model, text, toolCalls };
}

export const managerChat = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }): Promise<ManagerReply> => {
    if (!data.messages.length) {
      return {
        ok: false,
        code: "invalid_input",
        provider: "none",
        model: null,
        text: "",
        toolCalls: [],
        detail: "No message was sent.",
      };
    }

    const { openaiKey, gatewayKey, gatewayEnabled, model } = readConfig();

    try {
      if (openaiKey) return await callOpenAI(openaiKey, model, data);
      if (gatewayEnabled && gatewayKey) return await callGateway(gatewayKey, data);
    } catch (error) {
      return {
        ok: false,
        code: "provider_error",
        provider: openaiKey ? "openai" : "lovable-gateway",
        model: openaiKey ? model : "openai/gpt-6-astra",
        text: "",
        toolCalls: [],
        detail: error instanceof Error ? error.message : "Unknown provider error.",
      };
    }

    return {
      ok: false,
      code: "not_configured",
      provider: "none",
      model: null,
      text: "",
      toolCalls: [],
      detail: "No CanX-owned AI key is configured on the server.",
    };
  });
