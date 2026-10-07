import React from "react";
import { renderToString } from "react-dom/server";
import { it, expect } from "vitest";
import { LegalPaper } from "./LegalRoom";
import { EMPTY_LEGAL_FILING } from "@/lib/legal-room";
it("renders a populated paper with long names, persisted labels and editable date/question fields", () => {
  const html = renderToString(
    <LegalPaper
      file={{
        id: "f",
        filename: "Long contract & renewal.pdf",
        room: "legal",
        folder: "CanX Projects",
        object_path: "",
        content_hash: "",
        size_bytes: 200,
        mime_type: "application/pdf",
        created_at: "2026-10-07",
      }}
      filing={{
        ...EMPTY_LEGAL_FILING,
        topic: "privacy",
        status: "Under review",
        question: "Who holds this data?",
        dueDate: "2026-11-01",
      }}
      labelsReady
      onOpen={() => {}}
      onSave={async () => {}}
    />,
  );
  expect(html).toContain("Long contract &amp; renewal.pdf");
  expect(html).toContain("Who holds this data?");
  expect(html).toContain("2026-11-01");
  expect(html).toContain("Save filing");
  expect(html).toContain("Open paper");
  expect(html).toContain('value="privacy" selected=""');
});
