"use client";

/**
 * CanX Office — allowlisted appearance settings.
 *
 * The Office Manager may PREVIEW these settings and nothing else. There is no
 * code execution, no file writing, no deployment. Apply persists to this
 * device; Undo restores the previously applied settings.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SurfaceLevel = "graphite" | "charcoal" | "slate";
export type AccentName = "canx-red" | "amber" | "blue" | "green";
export type DensityName = "comfortable" | "compact";
export type MotionName = "full" | "reduced";

export interface OfficeTheme {
  surface: SurfaceLevel;
  transparency: number;
  accent: AccentName;
  density: DensityName;
  motion: MotionName;
}

export const DEFAULT_THEME: OfficeTheme = {
  surface: "charcoal",
  transparency: 35,
  accent: "canx-red",
  density: "comfortable",
  motion: "full",
};

export const THEME_FIELDS = {
  surface: { label: "Grey surface", options: ["graphite", "charcoal", "slate"] as SurfaceLevel[] },
  accent: { label: "Accent", options: ["canx-red", "amber", "blue", "green"] as AccentName[] },
  density: { label: "Text density", options: ["comfortable", "compact"] as DensityName[] },
  motion: { label: "Movement", options: ["full", "reduced"] as MotionName[] },
} as const;

const SURFACE_L: Record<SurfaceLevel, number> = { graphite: 0.27, charcoal: 0.32, slate: 0.38 };

const ACCENTS: Record<AccentName, { primary: string; ring: string; label: string }> = {
  "canx-red": { primary: "oklch(0.58 0.21 25)", ring: "oklch(0.7 0.17 25 / 0.75)", label: "CanX red" },
  amber: { primary: "oklch(0.74 0.15 72)", ring: "oklch(0.8 0.13 72 / 0.75)", label: "Amber" },
  blue: { primary: "oklch(0.62 0.16 250)", ring: "oklch(0.72 0.14 250 / 0.75)", label: "Blue" },
  green: { primary: "oklch(0.65 0.15 150)", ring: "oklch(0.74 0.13 150 / 0.75)", label: "Green" },
};

export const ACCENT_LABELS: Record<AccentName, string> = {
  "canx-red": ACCENTS["canx-red"].label,
  amber: ACCENTS.amber.label,
  blue: ACCENTS.blue.label,
  green: ACCENTS.green.label,
};

const STORAGE_KEY = "canx-office-theme";

function grey(l: number, chroma = 0.014) {
  return `oklch(${l.toFixed(3)} ${chroma} 260)`;
}

export function themeVariables(theme: OfficeTheme): Record<string, string> {
  const l = SURFACE_L[theme.surface];
  const accent = ACCENTS[theme.accent];
  return {
    "--background": grey(l),
    "--card": grey(l + 0.07),
    "--popover": grey(l + 0.07),
    "--secondary": grey(l + 0.13),
    "--muted": grey(l + 0.12),
    "--border": grey(l + 0.24, 0.012),
    "--input": grey(l + 0.24, 0.012),
    "--canx-black": grey(Math.max(0.2, l - 0.02)),
    "--canx-charcoal": grey(l + 0.06),
    "--canx-panel": grey(l + 0.14, 0.012),
    "--office-floor": grey(l + 0.04),
    "--office-wall": grey(l + 0.08),
    "--primary": accent.primary,
    "--ring": accent.ring,
    "--accent": grey(l + 0.14, 0.05),
    "--canx-panel-alpha": String(theme.transparency / 100),
    "--canx-density-gap": theme.density === "compact" ? "0.75rem" : "1.25rem",
    "--canx-density-text": theme.density === "compact" ? "0.8125rem" : "0.875rem",
  };
}

function sanitize(input: unknown): OfficeTheme {
  const raw = (input ?? {}) as Partial<OfficeTheme>;
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  const transparency = typeof raw.transparency === "number" && Number.isFinite(raw.transparency)
    ? Math.min(80, Math.max(0, Math.round(raw.transparency)))
    : DEFAULT_THEME.transparency;
  return {
    surface: pick(raw.surface, THEME_FIELDS.surface.options, DEFAULT_THEME.surface),
    accent: pick(raw.accent, THEME_FIELDS.accent.options, DEFAULT_THEME.accent),
    density: pick(raw.density, THEME_FIELDS.density.options, DEFAULT_THEME.density),
    motion: pick(raw.motion, THEME_FIELDS.motion.options, DEFAULT_THEME.motion),
    transparency,
  };
}

/** Only these keys can ever be changed by the Office Manager. */
export const ALLOWED_THEME_KEYS: (keyof OfficeTheme)[] = [
  "surface",
  "transparency",
  "accent",
  "density",
  "motion",
];

export function sanitizeThemePatch(patch: unknown): Partial<OfficeTheme> {
  if (!patch || typeof patch !== "object") return {};
  const source = patch as Record<string, unknown>;
  const full = sanitize({ ...DEFAULT_THEME, ...source });
  const out: Partial<OfficeTheme> = {};
  for (const key of ALLOWED_THEME_KEYS) {
    if (key in source) (out as Record<string, unknown>)[key] = full[key];
  }
  return out;
}

interface ThemeContextValue {
  theme: OfficeTheme;
  saved: OfficeTheme;
  dirty: boolean;
  canUndo: boolean;
  preview: (patch: Partial<OfficeTheme>) => void;
  apply: () => void;
  discard: () => void;
  undo: () => void;
  reset: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function OfficeThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<OfficeTheme>(DEFAULT_THEME);
  const [theme, setTheme] = useState<OfficeTheme>(DEFAULT_THEME);
  const [undoStack, setUndoStack] = useState<OfficeTheme[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const next = sanitize(JSON.parse(raw));
        setSaved(next);
        setTheme(next);
      }
    } catch {
      /* ignore storage errors */
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const vars = themeVariables(theme);
    for (const [key, value] of Object.entries(vars)) root.style.setProperty(key, value);
    root.dataset["canxMotion"] = theme.motion;
    return () => undefined;
  }, [theme]);

  const preview = useCallback((patch: Partial<OfficeTheme>) => {
    setTheme((current) => sanitize({ ...current, ...sanitizeThemePatch(patch) }));
  }, []);

  const apply = useCallback(() => {
    setTheme((current) => {
      setUndoStack((stack) => [...stack.slice(-9), saved]);
      setSaved(current);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch {
        /* ignore storage errors */
      }
      return current;
    });
  }, [saved]);

  const persist = useCallback((next: OfficeTheme) => {
    setSaved(next);
    setTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const discard = useCallback(() => setTheme(saved), [saved]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      persist(previous);
      return stack.slice(0, -1);
    });
  }, [persist]);

  const reset = useCallback(() => {
    setUndoStack((stack) => [...stack.slice(-9), saved]);
    persist(DEFAULT_THEME);
  }, [persist, saved]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      saved,
      dirty: JSON.stringify(theme) !== JSON.stringify(saved),
      canUndo: undoStack.length > 0,
      preview,
      apply,
      discard,
      undo,
      reset,
    }),
    [theme, saved, undoStack.length, preview, apply, discard, undo, reset],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useOfficeTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useOfficeTheme must be used inside OfficeThemeProvider");
  return context;
}

export function useReducedMotion() {
  const [system, setSystem] = useState(false);
  const context = useContext(ThemeContext);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystem(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return system || context?.theme.motion === "reduced";
}
