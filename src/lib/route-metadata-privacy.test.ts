/**
 * CanX Office is a private, owner-only workspace. Page metadata is the one
 * part of a room that can travel outside sign-in (browser history, tabs,
 * bookmarks, link previews), so it must never describe the room, the owner,
 * or what the room holds.
 *
 * This test reads the route sources directly: it enumerates every route file
 * that declares head metadata and proves the four public-facing fields are
 * exactly the generic values.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const GENERIC_TITLE = "CanX Office";
const GENERIC_DESCRIPTION = "Owner-only CanX operations workspace.";

/** Words that would reveal a person, a room, or what a room holds. */
const LEAKING_WORDS = [
  "john",
  "cantlon",
  "health",
  "wellbeing",
  "finance",
  "receipt",
  "approval",
  "decision",
  "password",
  "sign-in",
  "legal",
  "records",
  "subscription",
  "projects",
  "safe highways",
  "trail tales",
  "brain",
  "round table",
  "idea",
  "skills",
  "team",
  "communications",
  "blueprint",
  "systems",
  "work board",
  "owner desk",
  "daily overview",
];

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

const candidates = [...routeFiles("src/routes/_office"), "src/routes/auth/reset-password.tsx"];

interface HeadRoute {
  path: string;
  head: string;
}

function headBlock(source: string): string | null {
  const start = source.indexOf("head:");
  if (start === -1) return null;
  const open = source.indexOf("({", start) + 1;
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]!;
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

const headRoutes: HeadRoute[] = candidates.flatMap((path) => {
  const head = headBlock(readFileSync(path, "utf8"));
  return head ? [{ path, head }] : [];
});

function field(head: string, pattern: RegExp): string[] {
  return [...head.matchAll(pattern)].map((match) => match[1]!);
}

describe("route head metadata never exposes private detail", () => {
  it("finds the route files that declare head metadata", () => {
    expect(headRoutes.length).toBeGreaterThanOrEqual(20);
    expect(headRoutes.map((route) => route.path)).toContain("src/routes/_office/health.tsx");
    expect(headRoutes.map((route) => route.path)).toContain("src/routes/_office/index.tsx");
    expect(headRoutes.map((route) => route.path)).toContain("src/routes/auth/reset-password.tsx");
  });

  it.each(headRoutes.map((route) => [route.path, route.head] as const))(
    "%s uses only the generic four fields",
    (_path, head) => {
      const titles = [
        ...field(head, /title:\s*"([^"]*)"/g).filter((_value, index) => index >= 0),
      ].filter((value) => value.length > 0);
      const descriptions = [
        ...field(head, /name:\s*"description",\s*content:\s*"([^"]*)"/g),
        ...field(head, /property:\s*"og:description",\s*content:\s*"([^"]*)"/g),
      ];

      expect(titles.length).toBeGreaterThan(0);
      for (const title of titles) expect(title).toBe(GENERIC_TITLE);
      for (const description of descriptions) expect(description).toBe(GENERIC_DESCRIPTION);
    },
  );

  it.each(headRoutes.map((route) => [route.path, route.head] as const))(
    "%s leaks no personal, room, or purpose wording",
    (_path, head) => {
      const values = [
        ...field(head, /title:\s*"([^"]*)"/g),
        ...field(head, /name:\s*"description",\s*content:\s*"([^"]*)"/g),
        ...field(head, /property:\s*"og:description",\s*content:\s*"([^"]*)"/g),
      ].join(" | ").toLowerCase();

      for (const word of LEAKING_WORDS) expect(values).not.toContain(word);
    },
  );
});
