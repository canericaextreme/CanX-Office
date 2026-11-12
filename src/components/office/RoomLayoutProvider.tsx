/** Loads and saves John's room layout; the boxes and the Edit tab live in ./RoomLayout. */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useOwnerSession } from "@/lib/owner-session";
import { getRoomLayout, saveRoomLayout } from "@/lib/room-layout.functions";
import {
  EMPTY_HISTORY,
  EMPTY_LAYOUT,
  type BoxOverride,
  type LayoutHistory,
  type RoomLayout,
} from "@/lib/room-layout";
import { LayoutContext, type BoxInfo, type EditMode, type LayoutCtx } from "./RoomLayout";

export function RoomLayoutProvider({ children }: { children: ReactNode }) {
  const session = useOwnerSession();
  const read = useServerFn(getRoomLayout);
  const write = useServerFn(saveRoomLayout);
  const [layout, setLayout] = useState<RoomLayout>(EMPTY_LAYOUT);
  const [history, setHistory] = useState<LayoutHistory>(EMPTY_HISTORY);
  const [version, setVersion] = useState<string | null>(null);
  const [mode, setMode] = useState<EditMode>("locked");
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [boxes, setBoxes] = useState<BoxInfo[]>([]);
  const token = session.accessToken;

  useEffect(() => {
    let active = true;
    if (!token || session.viewer) {
      setLayout(EMPTY_LAYOUT);
      setHistory(EMPTY_HISTORY);
      setVersion(null);
      return;
    }
    void read({ data: { accessToken: token } })
      .then((r) => {
        if (!active) return;
        if (r.ok) {
          setLayout(r.read.layout);
          setHistory(r.read.history);
          setVersion(r.read.version);
        } else setNotice(r.message);
      })
      .catch(() => active && setNotice("The saved layout could not be read. Rooms show as built."));
    return () => {
      active = false;
    };
  }, [token, session.viewer, read]);

  const canEdit = !session.viewer && !!token;

  const save = useCallback(
    async (after: Record<string, BoxOverride | null>, what: string) => {
      if (!token || session.viewer) {
        setNotice("Sign in as John to save room changes.");
        return false;
      }
      if (version === null) {
        setNotice(
          "The saved layout has not loaded yet, so nothing was changed. Try again in a moment.",
        );
        return false;
      }
      setBusy(true);
      setNotice("Saving…");
      try {
        const r = await write({
          data: { accessToken: token, what, after, expectedVersion: version },
        });
        if (r.read) {
          setLayout(r.read.layout);
          setHistory(r.read.history);
          setVersion(r.read.version);
        }
        setNotice(r.ok ? `${what}. Saved and checked.` : r.message);
        return r.ok;
      } catch {
        setNotice("The change was not confirmed. Nothing was assumed saved; refresh to check.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token, session.viewer, version, write],
  );

  const register = useCallback((box: BoxInfo) => {
    setBoxes((list) => [...list.filter((b) => b.id !== box.id), box]);
    return () => setBoxes((list) => list.filter((b) => b.id !== box.id));
  }, []);

  const nameOf = useCallback(
    (id: string) => layout.b[id]?.n ?? boxes.find((b) => b.id === id)?.name ?? id,
    [layout, boxes],
  );

  const value = useMemo<LayoutCtx>(
    () => ({
      layout,
      history,
      mode,
      setMode,
      panelOpen,
      setPanelOpen,
      canEdit,
      busy,
      notice,
      save,
      register,
      boxes,
      nameOf,
    }),
    [layout, history, mode, panelOpen, canEdit, busy, notice, save, register, boxes, nameOf],
  );
  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>;
}
