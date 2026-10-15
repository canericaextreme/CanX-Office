import { describe, expect, it, vi } from "vitest";
import { observeRoomWith, sanitizeManagerObserveInput, MANAGER_OBSERVE_SYSTEM_PROMPT, type ManagerObserveDeps } from "./manager-observe.functions";

describe("Elsie's fresh room visual questions", () => {
  const payload = { accessToken: "test", path: "/legal", room: "Legal", text: "Topic folders", image: "data:image/png;base64,AAAABBBB", question: "How many blue cards?" };
  const deps = (): ManagerObserveDeps => ({
    verifySignedIn: async () => ({ ok: true, userId: "owner" }) as never,
    allowRequest: () => true,
    reserve: async () => ({ allowed: true, reservationId: "test" }) as never,
    settle: vi.fn(async () => undefined),
    fetchImpl: vi.fn(async () => new Response(JSON.stringify({ output_text: "Three blue cards are visible." }))) as unknown as typeof fetch,
    openaiKey: "test", model: "test",
  });
  it("sends the owner's exact bounded question with the current picture instead of forcing a generic review", async () => {
    const d = deps();
    const reply = await observeRoomWith(d, sanitizeManagerObserveInput(payload));
    const body = JSON.parse(String(vi.mocked(d.fetchImpl).mock.calls[0]![1]!.body));
    expect(reply.ok).toBe(true);
    expect(body.input[0].content).toContainEqual({ type: "input_text", text: "John's visual question: How many blue cards?" });
    expect(body.input[0].content).toContainEqual({ type: "input_image", image_url: payload.image });
    expect(body.instructions).toContain("Count only visible items");
    expect(sanitizeManagerObserveInput({ ...payload, question: "x".repeat(2000) }).question).toHaveLength(1000);
  });
  it("keeps the existing general review when there is no visual question", async () => {
    const d = deps();
    const { question: _question, ...generalPayload } = payload;
    await observeRoomWith(d, generalPayload);
    const body = JSON.parse(String(vi.mocked(d.fetchImpl).mock.calls[0]![1]!.body));
    expect(body.instructions).toBe(MANAGER_OBSERVE_SYSTEM_PROMPT);
  });
  it("never answers a visual question without a valid fresh picture", async () => {
    const d = deps();
    const reply = await observeRoomWith(d, { ...payload, image: "" });
    expect(reply.code).toBe("no_image");
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
});
