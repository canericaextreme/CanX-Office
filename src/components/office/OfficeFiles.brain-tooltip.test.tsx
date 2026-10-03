import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToString } from "react-dom/server";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

const hint = () => React.createElement(Tooltip, null, React.createElement(TooltipTrigger, null, "x"), React.createElement(TooltipContent, null, "Delete"));

it("a Delete hint without its provider crashes the page (root cause of the Brain failure)", () => {
  expect(() => renderToString(hint())).toThrow(/TooltipProvider/);
});
it("the Brain saved-file Delete hint is wrapped in its provider", () => {
  expect(() => renderToString(React.createElement(TooltipProvider, null, hint()))).not.toThrow();
  const src = readFileSync("src/components/office/OfficeFiles.tsx", "utf8");
  expect(src).toContain("room==='brain'&&<TooltipProvider><Tooltip>");
});
