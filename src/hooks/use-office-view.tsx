"use client";

import { useEffect, useState } from "react";

export type OfficeViewMode = "3d" | "simple";

const STORAGE_KEY = "canx-office-view-mode";
const VIEW_EVENT = "canx-office-view-change";

export function useOfficeViewMode() {
  const [mode, setMode] = useState<OfficeViewMode>("3d");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const syncView = (event: Event) => {
      const nextMode = (event as CustomEvent<OfficeViewMode>).detail;
      if (nextMode === "simple" || nextMode === "3d") setMode(nextMode);
    };
    window.addEventListener(VIEW_EVENT, syncView);
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "simple" || saved === "3d") {
        setMode(saved);
      }
    } catch {
      // ignore storage errors
    }
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
