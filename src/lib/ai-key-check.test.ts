import { describe, expect, it, vi } from "vitest";
import { checkOfficeAnthropicKey, checkVaultAnthropicKey, keyCheckRow } from "./ai-key-check";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("checkOfficeAnthropicKey", () => {
  it("uses the free models list, never the paid messages endpoint", async () => {
    const f = vi.fn(async () => json({ data: [] }));
    const r = await checkOfficeAnthropicKey(f as unknown as typeof fetch, "secret-key");
    expect(r.result).toBe("accepted");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/models?limit=1");
    expect(init.method).toBe("GET");
    expect(JSON.stringify(r)).not.toContain("secret-key");
  });
  it("reports an expired or deleted key as refused (red)", async () => {
    const r = await checkOfficeAnthropicKey((async () => json({}, 401)) as unknown as typeof fetch, "old");
    expect(r.result).toBe("refused");
    expect(keyCheckRow(r).status).toBe("red");
  });
  it("is red when no key is set and sends nothing", async () => {
    const f = vi.fn();
    const r = await checkOfficeAnthropicKey(f as unknown as typeof fetch, " ");
    expect(r.result).toBe("missing");
    expect(f).not.toHaveBeenCalled();
    expect(keyCheckRow(r).status).toBe("red");
  });
  it("never turns a network failure or odd status into green", async () => {
    const down = await checkOfficeAnthropicKey((async () => { throw new Error("x"); }) as unknown as typeof fetch, "k");
    const busy = await checkOfficeAnthropicKey((async () => json({}, 529)) as unknown as typeof fetch, "k");
    expect(keyCheckRow(down).status).toBe("unverified");
    expect(keyCheckRow(busy).status).toBe("unverified");
  });
});

describe("checkVaultAnthropicKey", () => {
  it("calls the owner-only claude-chat health action with John's session", async () => {
    const f = vi.fn(async () => json({ ok: true, models: [] }));
    const r = await checkVaultAnthropicKey(f as unknown as typeof fetch, "https://b.example", "pub", "tok");
    expect(r.result).toBe("accepted");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://b.example/functions/v1/claude-chat");
    expect(init.body).toBe(JSON.stringify({ action: "models" }));
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });
  it("maps provider refusal to red and missing Vault key to yellow", async () => {
    const refused = await checkVaultAnthropicKey((async () => json({ ok: false, code: "provider_unavailable" }, 502)) as unknown as typeof fetch, "u", "p", "t");
    const missing = await checkVaultAnthropicKey((async () => json({ ok: false, code: "vault_unavailable" }, 503)) as unknown as typeof fetch, "u", "p", "t");
    const noAuth = await checkVaultAnthropicKey((async () => json({ ok: false, code: "owner_verification_required" }, 401)) as unknown as typeof fetch, "u", "p", "t");
    expect(keyCheckRow(refused).status).toBe("red");
    expect(keyCheckRow(missing).status).toBe("yellow");
    expect(keyCheckRow(noAuth).status).toBe("unverified");
  });
});
