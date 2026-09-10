"use client";

import { useEffect, useState } from "react";

export type OfficeViewMode = "3d" | "simple";

// v2 key: the pre-restore build could leave a stale "3d" preference behind.
// Reading a new key means that stale value is ignored exactly once, and the
// office starts in Simple view until the owner chooses otherwise.
const STORAGE_KEY = "canx-office-view-mode-v2";
const LEGACY_STORAGE_KEY = "canx-office-view-mode";
const VIEW_EVENT = "canx-office-view-change";
export const DEFAULT_VIEW_MODE: OfficeViewMode = "simple";

export function readStoredViewMode(storage?: Storage): OfficeViewMode {
  try {
    const store = storage ?? window.localStorage;
    const saved = store.getItem(STORAGE_KEY);
    if (saved === "simple" || saved === "3d") return saved;
    // One-time migration: drop the stale legacy preference without honouring it.
    store.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
  return DEFAULT_VIEW_MODE;
}

export function persistViewMode(mode: OfficeViewMode, storage?: Storage) {
  try {
    (storage ?? window.localStorage).setItem(STORAGE_KEY, mode);
  } catch {
    // ignore storage errors
  }
}

export function useOfficeViewMode() {
  const [mode, setMode] = useState<OfficeViewMode>(DEFAULT_VIEW_MODE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const syncView = (event: Event) => {
      const nextMode = (event as CustomEvent<OfficeViewMode>).detail;
      if (nextMode === "simple" || nextMode === "3d") setMode(nextMode);
    };
    window.addEventListener(VIEW_EVENT, syncView);
    setMode(readStoredViewMode());
    setHydrated(true);
    return () => window.removeEventListener(VIEW_EVENT, syncView);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }, [mode]);

  const updateMode = (nextMode: OfficeViewMode) => {
    setMode(nextMode);
    window.dispatchEvent(new CustomEvent<OfficeViewMode>(VIEW_EVENT, { detail: nextMode }));
  };

  return { mode, setMode: updateMode, hydrated };
}
