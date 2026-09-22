import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  allowObserveRequest,
  observeWith,
  OBSERVE_REQUEST_LIMIT,
  OBSERVE_SYSTEM_PROMPT,
  sanitizeObserveInput,
  sanitizedObserveDetail,
  validImage,
  type ObserveDeps,
  type ObservePayload,
} from "./office-observe.functions";
import {
  managerDraft,
  officeRoomLabel,
  validRealtimeImage,
  OFFICE_VIEW_ATTR,
  NO_CAPTURE_ATTR,
  REALTIME_MAX_IMAGE_CHARS,
} from "./office-observe";
import { CHAT_SYSTEM_PROMPT } from "./realtime-voice.functions";

const clientSource = readFileSync("src/lib/office-observe.ts", "utf8");
const serverSource = readFileSync("src/lib/office-observe.functions.ts", "utf8");
const panelSource = readFileSync("src/components/office/CompanionWorkPanel.tsx", "utf8");
const dockSource = readFileSync("src/components/office/CompanionDock.tsx", "utf8");
const managerSource = readFileSync("src/components/office/OfficeManager.tsx", "utf8");
const layoutSource = readFileSync("src/routes/_office.tsx", "utf8");
const bridgeSource = readFileSync("src/lib/companion-bridge.ts", "utf8");
const chatSource = readFileSync("src/lib/use-realtime-chat.ts", "utf8");

const validPng = "data:image/png;base64,AAAABBBB";

const payload = (over: Partial<ObservePayload> = {}): ObservePayload => ({
  accessToken: "t",
  path: "/finance",
  room: "Finance",
  text: "Receipts 12",
  image: validPng,
  ...over,
});

const baseDeps = (over: Partial<ObserveDeps> = {}): ObserveDeps => ({
  verifySignedIn: async () => ({ ok: true, aal: "aal1", userId: "u1", email: "j@x" }) as never,
  allowRequest: () => true,
  fetchImpl: (async () =>
    new Response(JSON.stringify({ output_text: "Office observation: Finance." }), {
      status: 200,
    })) as unknown as typeof fetch,
  openaiKey: "sk-test",
  model: "gpt-test",
  ...over,
});

describe("Office observation is opt-in and scoped to the marked office view", () => {
  it("only looks at the marked office root, which the layout provides", () => {
    expect(layoutSource).toContain('data-canx-office-view="true"');
    expect(clientSource).toContain("[${OFFICE_VIEW_ATTR}]");
    expect(OFFICE_VIEW_ATTR).toBe("data-canx-office-view");
  });

  it("runs only from John's explicit See Office Screen press", () => {
    expect(panelSource).toContain("See Office Screen");
    expect(panelSource).toContain("take one protected snapshot of this CanX Office page");
    expect(panelSource).toContain("not a live feed");
    expect(panelSource).toContain("Press it again when the screen changes");
    expect(panelSource).not.toContain("Observe Office");
    expect(panelSource).toContain("onClick={() => void runObserve()}");
    // No timers, intervals or automatic observation anywhere in the path.
    for (const source of [clientSource, panelSource]) {
      expect(source).not.toContain("setInterval");
      expect(source).not.toContain("requestAnimationFrame");
    }
    expect(clientSource).not.toContain("useEffect");
  });

  it("never uses a camera, screen sharing or any capture API", () => {
    for (const source of [clientSource, panelSource, dockSource, serverSource]) {
      expect(source).not.toContain("getDisplayMedia");
      expect(source).not.toContain("getUserMedia({ video");
      expect(source).not.toContain("MediaDevices");
      expect(source).not.toContain("captureStream");
      expect(source).not.toContain("ImageCapture");
      expect(source).not.toContain("video:");
    }
    // The office view renders itself from the DOM; there is no wider fallback.
    expect(clientSource).toContain("html2canvas-pro");
    expect(clientSource).not.toContain("document.body");
  });

  it("excludes overlays and sensitive fields from the picture and the text", () => {
    expect(NO_CAPTURE_ATTR).toBe("data-canx-no-capture");
    expect(layoutSource).toContain('data-canx-no-capture="true"');
    expect(panelSource).toContain('data-canx-no-capture="true"');
    expect(dockSource).toContain('data-canx-no-capture="true"');
    expect(clientSource).toContain("ignoreElements");
    expect(clientSource).toContain("isExcludedElement");
    expect(clientSource).toMatch(/pass\|pwd\|token\|key\|secret/);
    expect(clientSource).toContain('"INPUT", "TEXTAREA", "SELECT"');
    expect(clientSource).toContain("isContentEditable");
  });

  it("keeps the observation in memory only — never storage, records or logs", () => {
    for (const source of [clientSource, panelSource]) {
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
      expect(source).not.toContain("rest/v1");
    }
    // The dock keeps it in a React ref, never in storage.
    expect(dockSource).toContain("observationRef");
    expect(dockSource).not.toContain('localStorage.setItem("canx.observation');
    expect(serverSource).not.toContain("insert");
    expect(serverSource).not.toContain("rest/v1");
  });

  it("names the current path and room", () => {
    expect(officeRoomLabel("/")).toContain("Reception");
    expect(officeRoomLabel("/finance")).toContain("Finance");
    expect(panelSource).toContain("useRouterState");
    expect(serverSource).toContain("Room or page:");
    expect(serverSource).toContain("Path:");
  });
});

describe("Observe server function safety", () => {
  it("verifies the signed-in owner before anything else", async () => {
    const denied = await observeWith(
      baseDeps({
        verifySignedIn: async () => ({ ok: false, message: "Please sign in." }) as never,
      }),
      payload(),
    );
    expect(denied.code).toBe("auth_not_ready");
    expect(denied.text).toBe("");
  });

  it("enforces strict image type and size bounds", async () => {
    expect(validImage(validPng)).toBe(true);
    expect(validImage("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(validImage("https://example.com/x.png")).toBe(false);
    expect(validImage(`data:image/jpeg;base64,${"A".repeat(2_000_000)}`)).toBe(false);
    const bad = await observeWith(baseDeps(), payload({ image: "not-an-image" }));
    expect(bad.code).toBe("bad_input");
  });

  it("bounds the incoming text and path", () => {
    const cleaned = sanitizeObserveInput({
      accessToken: 1,
      path: "/x".padEnd(500, "y"),
      text: "a".repeat(99999),
    });
    expect(cleaned.accessToken).toBe("");
    expect(cleaned.path.length).toBe(200);
    expect(cleaned.text.length).toBe(6000);
    expect(cleaned.image).toBe("");
  });

  it("uses its own conservative rate limit", async () => {
    for (let i = 0; i < OBSERVE_REQUEST_LIMIT; i += 1)
      expect(allowObserveRequest("obs-user")).toBe(true);
    expect(allowObserveRequest("obs-user")).toBe(false);
    const limited = await observeWith(baseDeps({ allowRequest: () => false }), payload());
    expect(limited.code).toBe("too_many_requests");
    expect(limited.detail).not.toContain("spending limit");
  });

  it("keeps the key on the server and sanitizes provider failures", async () => {
    expect(panelSource).not.toContain("OPENAI_API_KEY");
    expect(serverSource).toContain('process.env["OPENAI_API_KEY"]');
    expect(serverSource).toContain('process.env["OPENAI_WORK_MODEL"]');
    expect(serverSource).toContain('process.env["OPENAI_MODEL"]');
    const refused = await observeWith(
      baseDeps({
        fetchImpl: (async () =>
          new Response("secret body", { status: 403 })) as unknown as typeof fetch,
      }),
      payload(),
    );
    expect(refused.code).toBe("provider_error");
    expect(refused.detail).toBe("The AI provider connection needs attention.");
    for (const status of [undefined, 401, 404, 429, 500]) {
      expect(sanitizedObserveDetail(status)).not.toContain("Bearer");
      expect(sanitizedObserveDetail(status)).not.toContain("spending limit");
    }
  });

  it("declares no tools and answers as a short factual observation", async () => {
    expect(serverSource).not.toContain("tools:");
    expect(serverSource).not.toContain('"tools"');
    expect(OBSERVE_SYSTEM_PROMPT).toContain("Office observation");
    expect(OBSERVE_SYSTEM_PROMPT).toContain("NOT the Office Manager");
    const reply = await observeWith(baseDeps(), payload());
    expect(reply.ok).toBe(true);
    expect(reply.room).toBe("Finance");
    expect(reply.path).toBe("/finance");
  });
});

describe("Send to Manager is a deliberate, harmless handoff", () => {
  it("only prefills a labelled draft and never sends or saves", () => {
    expect(managerDraft("Finance", "/finance", "Twelve receipts")).toContain(
      "ChatGPT observation for review — Finance (/finance)",
    );
    expect(panelSource).toContain('data-testid="canx-send-to-manager"');
    expect(panelSource).toContain("sendManagerHandoff");
    expect(panelSource).toContain("Nothing was sent or saved");
    expect(bridgeSource).toContain('MANAGER_HANDOFF_EVENT = "canx:manager-handoff"');
    expect(managerSource).toContain("MANAGER_HANDOFF_EVENT");
    expect(managerSource).toContain("setDraft(detail.text.slice(0, 4000))");
    // The Manager must not auto-send, approve or create anything on receipt.
    const handoff = managerSource.slice(
      managerSource.indexOf("const onHandoff"),
      managerSource.indexOf("window.addEventListener(MANAGER_HANDOFF_EVENT"),
    );
    expect(handoff).not.toContain("send(");
    expect(handoff).not.toContain("approve");
    expect(handoff).not.toContain("saveTask");
    // The Manager console is now Now / Rooms / Team / Settings; a handoff
    // lands in the Now conversation as a draft only.
    expect(handoff).toContain('setTab("now")');

    expect(handoff).toContain("setMinimized(false)");
  });

  it("does not restore the old Work-opens-Manager bridge", () => {
    expect(bridgeSource).not.toContain("COMPANION_WORK_EVENT");
    expect(dockSource).not.toContain("MANAGER_HANDOFF_EVENT");
    expect(panelSource).not.toContain("OfficeManager");
  });
});

describe("Voice context and Manager Talk stay in their own pipelines", () => {
  it("shares the actual bounded picture and text with a live Chat session", () => {
    expect(chatSource).toContain("shareOfficeContext");
    expect(chatSource).toContain("Context only, do not reply yet");
    expect(chatSource).toContain('type: "input_text"');
    expect(chatSource).toContain('type: "input_image"');
    expect(chatSource).toContain("image_url: observation.voiceImage");
    expect(chatSource).toContain("validRealtimeImage(observation.voiceImage)");
    expect(chatSource).toContain('type: "conversation.item.create"');
    expect(dockSource).toContain("chat.shareOfficeContext(pending)");
  });

  it("never asks the voice model to answer by itself", () => {
    // "response.created" is an incoming event name, so the check is exact.
    const asks = /response\.create(?!d)/;
    expect(asks.test(chatSource)).toBe(false);
    expect(asks.test(dockSource)).toBe(false);
    expect(asks.test(panelSource)).toBe(false);
  });

  it("wraps the data-channel send so a failure is reported honestly", () => {
    const share = chatSource.slice(chatSource.indexOf("const shareOfficeContext"));
    expect(share).toContain("try {");
    expect(share).toContain("} catch {");
    expect(share).toContain("return false;");
  });

  it("gives the Manager its own plainly labelled continuous conversation control", () => {
    expect(managerSource).toContain('Talk to Data');
    expect(managerSource).toContain("const primaryVoiceAction");
    expect(managerSource).toContain("useRealtimeManager");
    expect(managerSource).toContain("realtimeManager.stop");
    // Manager voice has its own realtime session, not the companion's Chat/Work session.
    expect(managerSource).not.toContain("use-realtime-chat");
    expect(managerSource).not.toContain("companion-work");
    expect(managerSource).not.toContain("useDictation");
  });
});

describe("The shared Office picture stays bounded, private and text-only to the Manager", () => {
  it("accepts only a small JPEG or PNG data URL for the voice connection", () => {
    expect(validRealtimeImage("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(validRealtimeImage("data:image/png;base64,AAAA")).toBe(true);
    expect(validRealtimeImage("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(validRealtimeImage("https://example.com/x.jpg")).toBe(false);
    expect(validRealtimeImage(undefined)).toBe(false);
    expect(
      validRealtimeImage(`data:image/jpeg;base64,${"A".repeat(REALTIME_MAX_IMAGE_CHARS)}`),
    ).toBe(false);
    expect(REALTIME_MAX_IMAGE_CHARS).toBeLessThanOrEqual(200_000);
  });

  it("steps the picture down in size and quality rather than sending something huge", () => {
    expect(clientSource).toContain("shrinkForVoice");
    expect(clientSource).toContain("[1024, 880, 760, 640, REALTIME_MIN_WIDTH]");
    expect(clientSource).toContain("[0.6, 0.45, 0.35]");
    // Lazy loading of the renderer is preserved.
    expect(clientSource).toContain('await import("html2canvas-pro")');
  });

  it("keeps the picture in memory only — never storage, logs or the database", () => {
    for (const source of [clientSource, panelSource, dockSource, chatSource]) {
      expect(source).not.toContain("sessionStorage");
      expect(source).not.toContain("console.log");
      expect(source).not.toContain("rest/v1");
      // Nothing the snapshot touches is ever written to browser storage.
      for (const [, stored] of source.matchAll(/localStorage\.setItem\(([^)]*)\)/g)) {
        expect(stored).not.toContain("observation");
        expect(stored).not.toContain("voiceImage");
        expect(stored).not.toContain("image");
      }
    }
    expect(dockSource).toContain("observationRef");
  });

  it("never lets the picture reach the Office Manager", () => {
    expect(bridgeSource).not.toContain("voiceImage");
    expect(bridgeSource).not.toContain("image:");
    expect(bridgeSource).not.toContain("image_url");
    const handoffCall = panelSource.slice(panelSource.indexOf("sendManagerHandoff({"));
    expect(handoffCall.slice(0, 300)).not.toContain("voiceImage");
    expect(managerSource).not.toContain("voiceImage");
    expect(managerSource).not.toContain("input_image");
  });

  it("clears a stale observation before a fresh attempt", () => {
    const observe = clientPanelObserve();
    expect(observe).toContain("setObservation(null)");
    expect(observe).toContain("onObservation?.(null)");
    expect(observe.indexOf("setObservation(null)")).toBeLessThan(
      observe.indexOf("captureOfficeView"),
    );
  });

  it("offers a talk-about-this-screen control that never touches the Manager", () => {
    expect(panelSource).toContain('data-testid="canx-talk-about-screen"');
    expect(panelSource).toContain("Talk with ChatGPT about this screen");
    expect(dockSource).toContain("onTalkAboutScreen");
    expect(dockSource).toContain("setWorkOpen(false)");
    expect(dockSource).toContain("chat.start()");
    expect(dockSource).not.toContain("OfficeManager");
  });

  it("refuses to send anything when the picture is missing or invalid", () => {
    const share = chatSource.slice(chatSource.indexOf("const shareOfficeContext"));
    // The hard gate sits BEFORE any data-channel send.
    expect(share).toContain("if (!validRealtimeImage(observation.voiceImage)) return false;");
    expect(share.indexOf("return false;")).toBeLessThan(share.indexOf("channel.send("));
    // No text-only fallback: the image is always part of the one message sent.
    expect(share).toContain(
      'content.push({ type: "input_image", image_url: observation.voiceImage });',
    );
    expect(share).not.toContain("if (validRealtimeImage(observation.voiceImage))");
  });

  it("tells John plainly when the picture could not be handed to voice, and clears it after success", () => {
    expect(dockSource).toContain(
      "The Office picture could not be shared. Press See Office Screen again.",
    );
    expect(dockSource).toContain('data-testid="canx-companion-share-error"');
    expect(dockSource).toContain('role="alert"');
    expect(dockSource).toContain("setShareError(null)");
    const handoff = dockSource.slice(dockSource.indexOf("chat.shareOfficeContext(pending)"));
    expect(handoff).toContain("sharedRef.current = pending;");
    expect(handoff.indexOf("setShareError(null)")).toBeLessThan(
      handoff.indexOf("Press See Office Screen again."),
    );
  });

  it("tells the voice model honestly what it can and cannot see", () => {
    expect(CHAT_SYSTEM_PROMPT).toContain("See Office Screen");
    expect(CHAT_SYSTEM_PROMPT).toContain("not a live feed");
    expect(CHAT_SYSTEM_PROMPT).toContain("You are not the Office Manager");
    expect(CHAT_SYSTEM_PROMPT).toContain("does NOT open the Office Manager");
    expect(CHAT_SYSTEM_PROMPT).not.toContain("Work button to open the Office Manager");
  });
});

function clientPanelObserve(): string {
  const start = panelSource.indexOf("const runObserve");
  return panelSource.slice(start, panelSource.indexOf("const stateTone"));
}
