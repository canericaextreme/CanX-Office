import { describe, expect, it } from "vitest";

import {
  createDriveFileWith,
  listDriveFilesWith,
  readDriveFileWith,
  readDriveSettings,
  updateDriveFileWith,
  type DriveSettings,
} from "./google-drive.server";

const settings: DriveSettings = { lovableApiKey: "lovable-key", connectionApiKey: "conn-key" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("readDriveSettings", () => {
  it("reports not configured when either key is missing, without exposing values", () => {
    const savedLovable = process.env["LOVABLE_API_KEY"];
    const savedDrive = process.env["GOOGLE_DRIVE_API_KEY"];
    try {
      delete process.env["LOVABLE_API_KEY"];
      delete process.env["GOOGLE_DRIVE_API_KEY"];
      expect(readDriveSettings()).toBeNull();
      process.env["LOVABLE_API_KEY"] = "x";
      expect(readDriveSettings()).toBeNull();
      process.env["GOOGLE_DRIVE_API_KEY"] = "y";
      const result = readDriveSettings();
      expect(result).toEqual({ lovableApiKey: "x", connectionApiKey: "y" });
    } finally {
      if (savedLovable === undefined) delete process.env["LOVABLE_API_KEY"];
      else process.env["LOVABLE_API_KEY"] = savedLovable;
      if (savedDrive === undefined) delete process.env["GOOGLE_DRIVE_API_KEY"];
      else process.env["GOOGLE_DRIVE_API_KEY"] = savedDrive;
    }
  });
});

describe("listDriveFilesWith", () => {
  it("labels results as selected-files only, never the whole Drive", async () => {
    const fetchImpl = async () =>
      jsonResponse({ files: [{ id: "abc1234567890", name: "note.txt", mimeType: "text/plain" }] });
    const result = await listDriveFilesWith(settings, fetchImpl as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toHaveLength(1);
      expect(result.detail).toContain("selected-files only");
      expect(result.detail).toContain("not your whole Drive");
    }
  });

  it("says honestly when nothing is visible", async () => {
    const fetchImpl = async () => jsonResponse({ files: [] });
    const result = await listDriveFilesWith(settings, fetchImpl as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.detail).toContain("No files are visible");
  });

  it("surfaces provider failures without claiming success", async () => {
    const fetchImpl = async () => new Response("insufficient permissions", { status: 403 });
    const result = await listDriveFilesWith(settings, fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.providerStatus).toBe(403);
      expect(result.detail).toContain("Nothing was changed");
    }
  });
});

describe("readDriveFileWith", () => {
  it("rejects an invalid file id before any network call", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return jsonResponse({});
    };
    const result = await readDriveFileWith(settings, "../etc", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    expect(called).toBe(0);
  });

  it("refuses Google Docs-style files instead of pretending to read them", async () => {
    const fetchImpl = async () =>
      jsonResponse({ id: "abc1234567890", name: "Sheet", mimeType: "application/vnd.google-apps.spreadsheet" });
    const result = await readDriveFileWith(settings, "abc1234567890", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain("cannot export");
  });

  it("reads a plain text file", async () => {
    const fetchImpl = async (input: unknown) => {
      const url = String(input);
      if (url.includes("alt=media")) return new Response("hello drive", { status: 200 });
      return jsonResponse({ id: "abc1234567890", name: "note.txt", mimeType: "text/plain" });
    };
    const result = await readDriveFileWith(settings, "abc1234567890", fetchImpl as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("hello drive");
  });
});

describe("createDriveFileWith", () => {
  it("requires a name and never creates silently", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return jsonResponse({});
    };
    const result = await createDriveFileWith(settings, "   ", "text", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    expect(called).toBe(0);
  });

  it("rejects oversized text before any network call", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return jsonResponse({});
    };
    const result = await createDriveFileWith(settings, "big.txt", "x".repeat(100_001), fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    expect(called).toBe(0);
  });

  it("requires Drive to confirm the new file id", async () => {
    const fetchImpl = async () => jsonResponse({});
    const result = await createDriveFileWith(settings, "note.txt", "hello", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detail).toContain("did not confirm");
  });

  it("reports the created file with its id", async () => {
    const fetchImpl = async () => jsonResponse({ id: "new1234567890", name: "note.txt", mimeType: "text/plain" });
    const result = await createDriveFileWith(settings, "note.txt", "hello", fetchImpl as typeof fetch);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.detail).toContain("new1234567890");
  });
});

describe("updateDriveFileWith", () => {
  it("rejects an invalid file id before any network call", async () => {
    let called = 0;
    const fetchImpl = async () => {
      called += 1;
      return jsonResponse({});
    };
    const result = await updateDriveFileWith(settings, "bad id", "text", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    expect(called).toBe(0);
  });

  it("requires Drive to confirm the update", async () => {
    const fetchImpl = async () => jsonResponse({});
    const result = await updateDriveFileWith(settings, "abc1234567890", "text", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
  });

  it("has no delete operation", async () => {
    const mod = await import("./google-drive.server");
    const names = Object.keys(mod);
    expect(names.some((name) => /delete|trash|remove/i.test(name))).toBe(false);
  });
});
