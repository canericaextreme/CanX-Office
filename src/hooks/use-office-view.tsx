"use client";

import { useEffect, useState } from "react";

export type OfficeViewMode = "3d" | "simple";

const STORAGE_KEY = "canx-office-view-mode";

export function useOfficeViewMode() {
  const [mode, setMode] = useState<OfficeViewMode>("3d");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "simple" || saved === "3d") {
        setMode(saved);
      }
    } catch {
      // ignore storage errors
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore storage errors
    }
  }, [mode]);

  return { mode, setMode, hydrated };
}
