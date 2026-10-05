import { describe, expect, it, vi } from "vitest";

import {
  createDriveFileWith,
  listDriveFilesWith,
  readDriveFileWith,
  readDriveSettings,
  updateDriveFileWith,
  type DriveSettings,
} from "./google-drive.server";

const settings: DriveSettings = { lovableApiKey: "lovable-key", connectionApiKey: "conn-key" };
const ID = "abc1234567890";
const BASE = "https://connector-gateway.lovable.dev/google_drive";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
type Route = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function mock(route: Route) {
  return vi.fn(async (input: unknown, init?: RequestInit) => route(new URL(String(input)), init));
}
const urls = (f: ReturnType<typeof mock>) => f.mock.calls.map((c) => new URL(String(c[0])));

describe("readDriveSettings", () => {
  it("reports not configured when either key is missing", () => {
    const a = process.env["LOVABLE_API_KEY"];
    const b = process.env["GOOGLE_DRIVE_API_KEY"];
    try {
      delete process.env["LOVABLE_API_KEY"];
      delete process.env["GOOGLE_DRIVE_API_KEY"];
      expect(readDriveSettings()).toBeNull();
      process.env["LOVABLE_API_KEY"] = "x";
      expect(readDriveSettings()).toBeNull();
      process.env["GOOGLE_DRIVE_API_KEY"] = "y";
      expect(readDriveSettings()).toEqual({ lovableApiKey: "x", connectionApiKey: "y" });
    } finally {
      if (a === undefined) delete process.env["LOVABLE_API_KEY"]; else process.env["LOVABLE_API_KEY"] = a;
      if (b === undefined) delete process.env["GOOGLE_DRIVE_API_KEY"]; else process.env["GOOGLE_DRIVE_API_KEY"] = b;
    }
  });
});

describe("gateway URLs are fully normalized", () => {
  it("lists through /google_drive/drive/v3/files with both auth headers", async () => {
    const f = mock(() => json({ files: [] }));
    await listDriveFilesWith(settings, f as unknown as typeof fetch);
    const u = urls(f)[0]!;
    expect(`${u.origin}${u.pathname}`).toBe(`${BASE}/drive/v3/files`);
    expect(u.href).not.toContain("..");
    expect(f.mock.calls[0]![1]!.headers).toMatchObject({ Authorization: "Bearer lovable-key", "X-Connection-Api-Key": "conn-key" });
  });

  it("creates through /google_drive/upload/drive/v3/files, never /drive/upload", async () => {
    const f = mock((u) => (u.searchParams.get("alt") === "media" ? new Response("hello") : json({ id: "new1234567890", name: "n.txt", mimeType: "text/plain" })));
    await createDriveFileWith(settings, "n.txt", "hello", f as unknown as typeof fetch);
    const u = urls(f)[0]!;
    expect(`${u.origin}${u.pathname}`).toBe(`${BASE}/upload/drive/v3/files`);
    expect(u.searchParams.get("uploadType")).toBe("multipart");
    expect(urls(f).every((x) => !x.pathname.includes("/drive/upload") && !x.href.includes(".."))).toBe(true);
  });

  it("updates through /google_drive/upload/drive/v3/files/{id}", async () => {
    const f = mock((u, init) => {
      if (init?.method === "PATCH") return json({ id: ID, name: "n.txt", mimeType: "text/plain" });
      if (u.searchParams.get("alt") === "media") return new Response("new");
      return json({ id: ID, name: "n.txt", mimeType: "text/plain" });
    });
    const r = await updateDriveFileWith(settings, ID, "new", f as unknown as typeof fetch, "n.txt");
    expect(r.ok).toBe(true);
    const patch = f.mock.calls.findIndex((c) => c[1]?.method === "PATCH");
    const u = urls(f)[patch]!;
    expect(`${u.origin}${u.pathname}`).toBe(`${BASE}/upload/drive/v3/files/${ID}`);
    expect(u.searchParams.get("uploadType")).toBe("media");
  });
});

describe("listDriveFilesWith", () => {
  it("labels results as selected-files only", async () => {
    const f = mock(() => json({ files: [{ id: ID, name: "note.txt", mimeType: "text/plain" }] }));
    const r = await listDriveFilesWith(settings, f as unknown as typeof fetch);
    expect(r.ok && r.files).toHaveLength(1);
    expect(r.detail).toContain("selected-files only");
  });

  it("rejects malformed provider JSON instead of claiming an empty Drive", async () => {
    for (const body of ["not json", JSON.stringify({ files: "nope" }), JSON.stringify(null)]) {
      const r = await listDriveFilesWith(settings, mock(() => new Response(body)) as unknown as typeof fetch);
      expect(r.ok).toBe(false);
      expect(r.detail).toContain("unreadable");
    }
  });

  it("drops malformed entries and says so", async () => {
    const f = mock(() => json({ files: [{ id: ID, name: "a", mimeType: "text/plain" }, { id: 5 }] }));
    const r = await listDriveFilesWith(settings, f as unknown as typeof fetch);
    expect(r.ok && r.files).toHaveLength(1);
    expect(r.detail).toContain("1 entry was unreadable");
  });

  it("redacts provider error bodies from results and logs", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await listDriveFilesWith(settings, mock(() => new Response("secret-file-name.pdf owner@x", { status: 403 })) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, providerStatus: 403 });
    expect(JSON.stringify(r)).not.toContain("secret-file-name");
    expect(JSON.stringify(err.mock.calls)).not.toContain("secret-file-name");
    err.mockRestore();
  });
});

describe("readDriveFileWith", () => {
  it("rejects an invalid id before any network call", async () => {
    const f = mock(() => json({}));
    expect((await readDriveFileWith(settings, "../etc", f as unknown as typeof fetch)).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("exports Google Docs as text/plain through the official export route", async () => {
    const f = mock((u) => (u.pathname.endsWith("/export") ? new Response("doc text") : json({ id: ID, name: "Doc", mimeType: "application/vnd.google-apps.document" })));
    const r = await readDriveFileWith(settings, ID, f as unknown as typeof fetch);
    expect(r.ok && r.text).toBe("doc text");
    const u = urls(f)[1]!;
    expect(`${u.origin}${u.pathname}`).toBe(`${BASE}/drive/v3/files/${ID}/export`);
    expect(u.searchParams.get("mimeType")).toBe("text/plain");
  });

  it.each(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "application/vnd.google-apps.presentation"])(
    "never decodes unsupported %s as text and blames this implementation, not the connector",
    async (mimeType) => {
      const f = mock(() => json({ id: ID, name: "f", mimeType }));
      const r = await readDriveFileWith(settings, ID, f as unknown as typeof fetch);
      expect(r.ok).toBe(false);
      expect(r.detail).toContain("This office implementation currently reads only");
      expect(f).toHaveBeenCalledTimes(1);
    },
  );

  it("caps the body while streaming instead of buffering everything", async () => {
    let pulled = 0;
    const big = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled += 1;
        if (pulled > 100) return c.close();
        c.enqueue(new Uint8Array(10_000).fill(97));
      },
    });
    const f = mock((u) => (u.searchParams.get("alt") === "media" ? new Response(big) : json({ id: ID, name: "big.txt", mimeType: "text/plain" })));
    const r = await readDriveFileWith(settings, ID, f as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("safe reading limit");
    expect(pulled).toBeLessThan(30);
  });

  it("rejects invalid UTF-8 instead of mangling it", async () => {
    const f = mock((u) => (u.searchParams.get("alt") === "media" ? new Response(new Uint8Array([0xff, 0xfe, 0x00])) : json({ id: ID, name: "t.txt", mimeType: "text/plain" })));
    expect((await readDriveFileWith(settings, ID, f as unknown as typeof fetch)).ok).toBe(false);
  });

  it("reads plain text", async () => {
    const f = mock((u) => (u.searchParams.get("alt") === "media" ? new Response("hello drive") : json({ id: ID, name: "note.txt", mimeType: "text/plain" })));
    const r = await readDriveFileWith(settings, ID, f as unknown as typeof fetch);
    expect(r.ok && r.text).toBe("hello drive");
  });
});

describe("createDriveFileWith", () => {
  it("validates before any network call", async () => {
    const f = mock(() => json({}));
    expect((await createDriveFileWith(settings, "  ", "t", f as unknown as typeof fetch)).ok).toBe(false);
    expect((await createDriveFileWith(settings, "b", "x".repeat(100_001), f as unknown as typeof fetch)).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("returns the created identity and link, confirmed by one readback, with no duplicate create", async () => {
    const f = mock((u) => (u.searchParams.get("alt") === "media" ? new Response("hello") : json({ id: "new1234567890", name: "n.txt", mimeType: "text/plain", webViewLink: "https://drive.google.com/file/d/new1234567890/view" })));
    const r = await createDriveFileWith(settings, "n.txt", "hello", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, verified: true, file: { id: "new1234567890", webViewLink: "https://drive.google.com/file/d/new1234567890/view" } });
    expect(r.detail).toContain("https://drive.google.com/file/d/new1234567890/view");
    expect(f.mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(1);
  });

  it("reports a readback mismatch instead of claiming saved content", async () => {
    const f = mock((u) => (u.searchParams.get("alt") === "media" ? new Response("other") : json({ id: "new1234567890", name: "n.txt", mimeType: "text/plain" })));
    const r = await createDriveFileWith(settings, "n.txt", "hello", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: true, verified: false });
    expect(r.detail).toContain("did not match");
  });

  it("marks a malformed success reply as uncertain, not nothing-changed", async () => {
    const r = await createDriveFileWith(settings, "n.txt", "hello", mock(() => new Response("garbage")) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, uncertain: true });
    expect(r.detail).not.toContain("Nothing was changed");
  });

  it.each([
    ["network error", () => { throw new TypeError("network"); }],
    ["server error", () => new Response("x", { status: 503 })],
  ])("marks %s outcomes uncertain and never retries", async (_label, route) => {
    const f = mock(route as Route);
    const r = await createDriveFileWith(settings, "n.txt", "hello", f as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, uncertain: true });
    expect(r.detail).toContain("uncertain");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("says nothing changed only for a definite 4xx refusal", async () => {
    const r = await createDriveFileWith(settings, "n.txt", "hello", mock(() => new Response("x", { status: 403 })) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, providerStatus: 403 });
    expect(r.detail).toContain("Nothing was changed");
  });
});

describe("updateDriveFileWith", () => {
  it("rejects an invalid id before any network call", async () => {
    const f = mock(() => json({}));
    expect((await updateDriveFileWith(settings, "bad id", "t", f as unknown as typeof fetch)).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it.each(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.google-apps.document", "application/octet-stream", "text/csv"])(
    "never overwrites a %s file",
    async (mimeType) => {
      const f = mock(() => json({ id: ID, name: "f", mimeType }));
      const r = await updateDriveFileWith(settings, ID, "t", f as unknown as typeof fetch, "f");
      expect(r.ok).toBe(false);
      expect(f.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(false);
    },
  );

  it("refuses when the file name does not match the intended file", async () => {
    const f = mock(() => json({ id: ID, name: "budget.txt", mimeType: "text/plain" }));
    const r = await updateDriveFileWith(settings, ID, "t", f as unknown as typeof fetch, "notes.txt");
    expect(r.ok).toBe(false);
    expect(f.mock.calls.some((c) => c[1]?.method === "PATCH")).toBe(false);
  });

  it("marks a server error during update as uncertain", async () => {
    const f = mock((_u, init) => (init?.method === "PATCH" ? new Response("x", { status: 500 }) : json({ id: ID, name: "n.txt", mimeType: "text/plain" })));
    const r = await updateDriveFileWith(settings, ID, "t", f as unknown as typeof fetch, "n.txt");
    expect(r).toMatchObject({ ok: false, uncertain: true });
    expect(f.mock.calls.filter((c) => c[1]?.method === "PATCH")).toHaveLength(1);
  });

  it("has no delete operation", async () => {
    const mod = await import("./google-drive.server");
    expect(Object.keys(mod).some((n) => /delete|trash|remove/i.test(n))).toBe(false);
  });
});
