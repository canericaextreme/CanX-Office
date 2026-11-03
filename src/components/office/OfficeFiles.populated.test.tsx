import { it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
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
it("a room with many saved links shows the newest few and folds the rest behind Show all", () => {
  const many: OfficeFile[] = Array.from({ length: 32 }, (_, i) => ({ ...files[1]!, id: `l${i}`, filename: `Email link ${i}`, room: "work-board" }));
  const html = renderToString(React.createElement(SavedFileList, { files: many, room: "work-board", sessionKey: "o:aal2:true", accessToken: "fixture-token", disabled: false, onOpen: () => {}, onDelete: () => {}, preview: 5 }));
  expect(html).toContain("Email link 4");
  expect(html).not.toContain("Email link 5<");
  expect(html).toContain("Show all <!-- -->32<!-- --> saved files and links (<!-- -->27<!-- --> more)");
});
it("a short list shows every entry with no Show all button", () => {
  const six: OfficeFile[] = Array.from({ length: 6 }, (_, i) => ({ ...files[1]!, id: `s${i}`, filename: `Short ${i}` }));
  const html = renderToString(React.createElement(SavedFileList, { files: six, room: "finance", sessionKey: "o:aal2:true", accessToken: "fixture-token", disabled: false, onOpen: () => {}, onDelete: () => {}, preview: 5 }));
  expect(html).toContain("Short 5");
  expect(html).not.toContain("Show all");
});
