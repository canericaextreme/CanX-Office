import { it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<object>()), useServerFn: () => async () => "" }));
import { SavedFileList } from "./OfficeFiles";
import type { OfficeFile } from "@/lib/office-files";

// Realistic, non-sensitive fixtures (no real owner data).
const files: OfficeFile[] = [
  { id: "f1", filename: "sample-site-plan.pdf", room: "brain", folder: "CanX Projects", object_path: "x/f1", content_hash: "a".repeat(64), size_bytes: 1048576, mime_type: "application/pdf", created_at: "2026-10-01T00:00:00Z" },
  { id: "f2", filename: "Example reference link", room: "brain", folder: "CanX Projects", object_path: "", content_hash: "b".repeat(64), size_bytes: 1, mime_type: "text/uri-list", created_at: "2026-10-01T00:00:00Z", source_url: "https://example.com/" },
];
const render = (room: string) => renderToString(React.createElement(SavedFileList, { files, room, sessionKey: "o:aal2:true", accessToken: "fixture-token", disabled: false, onOpen: () => {}, onDelete: () => {} }));

it("Brain populated saved-files list renders with a Delete button per file (real component path)", () => {
  let html = "";
  expect(() => { html = render("brain"); }).not.toThrow();
  expect(html).toContain("sample-site-plan.pdf");
  expect(html).toContain('aria-label="Delete sample-site-plan.pdf"');
  expect(html).toContain('aria-label="Delete Example reference link"');
  expect(html).toContain("Open link");
});
it("other rooms render the same list without Brain-only Delete", () => {
  const html = render("finance");
  expect(html).toContain("sample-site-plan.pdf");
  expect(html).not.toContain("Delete sample-site-plan.pdf");
});
