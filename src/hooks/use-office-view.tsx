"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type OfficeViewMode = "3d" | "simple";

export const OFFICE_VIEW_STORAGE_KEY = "canx-office-view-mode";
export const DEFAULT_OFFICE_VIEW_MODE: OfficeViewMode = "3d";

/** Pure helpers so the mode rules can be tested without a DOM. */
export function isOfficeViewMode(value: unknown): value is OfficeViewMode {
  return value === "3d" || value === "simple";
}

export function normalizeOfficeViewMode(value: unknown): OfficeViewMode {
  return isOfficeViewMode(value) ? value : DEFAULT_OFFICE_VIEW_MODE;
}

export function toggleOfficeViewMode(mode: OfficeViewMode): OfficeViewMode {
  return mode === "3d" ? "simple" : "3d";
}

export function readStoredOfficeViewMode(): OfficeViewMode | null {
  try {
    const saved = window.localStorage.getItem(OFFICE_VIEW_STORAGE_KEY);
    return isOfficeViewMode(saved) ? saved : null;
  } catch {
    return null;
  }
}

export function writeStoredOfficeViewMode(mode: OfficeViewMode) {
  try {
    window.localStorage.setItem(OFFICE_VIEW_STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

type OfficeViewContextValue = {
  mode: OfficeViewMode;
  setMode: (mode: OfficeViewMode) => void;
  toggleMode: () => void;
  hydrated: boolean;
};

const OfficeViewModeContext = createContext<OfficeViewContextValue | null>(null);

/**
 * Single canonical view-mode state for the Office layout and every nested
 * office route. Persistence stays in localStorage; the context — not a
 * same-tab custom event — is the link between the header and the pages.
 */
export function OfficeViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<OfficeViewMode>(DEFAULT_OFFICE_VIEW_MODE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = readStoredOfficeViewMode();
    if (saved) setModeState(saved);
    setHydrated(true);
  }, []);

  const setMode = useCallback((next: OfficeViewMode) => {
    setModeState(next);
    writeStoredOfficeViewMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((current) => {
      const next = toggleOfficeViewMode(current);
      writeStoredOfficeViewMode(next);
      return next;
    });
  }, []);

  // Keep other tabs in step without acting as the primary state link.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== OFFICE_VIEW_STORAGE_KEY) return;
      if (isOfficeViewMode(event.newValue)) setModeState(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<OfficeViewContextValue>(
    () => ({ mode, setMode, toggleMode, hydrated }),
    [mode, setMode, toggleMode, hydrated],
  );

  return <OfficeViewModeContext.Provider value={value}>{children}</OfficeViewModeContext.Provider>;
}

export function useOfficeViewMode(): OfficeViewContextValue {
  const context = useContext(OfficeViewModeContext);
  if (!context) {
    throw new Error("useOfficeViewMode must be used inside OfficeViewModeProvider");
  }
  return context;
}
