/**
 * Room Edit tab (John, 12 Nov 2026): Unlock, Edit, Lock.
 *
 * Locked (the default): every room looks exactly as built plus John's saved changes.
 * Unlocked: every box shows a small bar to drag it, move it up or down, rename it, or move it to
 *   another room.
 * Edit: a list of every box in this room with the same controls, plus the change list with
 *   "Put back" for each change (works on a phone, where dragging does not).
 * Lock: hides the controls again. Changes are saved the moment they are made.
 *
 * Nothing in a box is changed or deleted. A move only changes WHERE the box shows; a rename
 * only changes the name shown on it.
 */
import {
  Component,
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, GripVertical, Lock, Pencil, Undo2, Unlock } from "lucide-react";
import {
  EMPTY_HISTORY,
  EMPTY_LAYOUT,
  NAME_MAX,
  boxesMovedInto,
  cleanName,
  homeRoomIdOf,
  orderChange,
  placeBefore,
  reorder,
  roomOfBox,
  type BoxOverride,
  type LayoutChangeEntry,
  type LayoutHistory,
  type RoomLayout,
} from "@/lib/room-layout";
import {
  OFFICE_ROOM_IDENTITIES,
  cleanRoute,
  roomIdentityForRoute,
} from "@/lib/office-room-identity";

export type EditMode = "locked" | "unlocked";

export function homeRouteOfBox(boxId: string): string | null {
  const id = homeRoomIdOf(boxId);
  return OFFICE_ROOM_IDENTITIES.find((r) => r.id === id)?.route ?? null;
}

const roomLabel = (route: string | null | undefined) =>
  OFFICE_ROOM_IDENTITIES.find((r) => r.route === route)?.label ?? "another room";

export interface BoxInfo {
  id: string;
  name: string;
  home: string;
}

export interface LayoutCtx {
  layout: RoomLayout;
  history: LayoutHistory;
  mode: EditMode;
  setMode: (m: EditMode) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  canEdit: boolean;
  busy: boolean;
  notice: string;
  save: (after: Record<string, BoxOverride | null>, what: string) => Promise<boolean>;
  register: (box: BoxInfo) => () => void;
  boxes: BoxInfo[];
  /** Names of boxes, for plain-words history entries. */
  nameOf: (id: string) => string;
}

export const LayoutContext = createContext<LayoutCtx | null>(null);
const FALLBACK: LayoutCtx = {
  layout: EMPTY_LAYOUT,
  history: EMPTY_HISTORY,
  mode: "locked",
  setMode: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
  canEdit: false,
  busy: false,
  notice: "",
  save: async () => false,
  register: () => () => {},
  boxes: [],
  nameOf: (id) => id,
};

export function useRoomLayout(): LayoutCtx {
  return useContext(LayoutContext) ?? FALLBACK;
}

/** Which room a component is drawn for. A box shown in another room still belongs to its own. */
const RoomRouteCtx = createContext<string | null>(null);
export function useRoomPath(): string {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return useContext(RoomRouteCtx) ?? pathname;
}

/** Set while a room is drawn only to lend some of its boxes to the room John is in. */
const IsolateCtx = createContext<{ targets: Record<string, HTMLElement | null> } | null>(null);

/* ------------------------------------------------------------------ */
/* Helpers that act on one box                                          */
/* ------------------------------------------------------------------ */

/** The boxes sharing this box's shelf, in the order they show. */
function shelfIds(wrapper: HTMLElement | null): string[] {
  if (!wrapper) return [];
  const slot = wrapper.closest("[data-canx-moved-slot]");
  const group = slot ? slot.parentElement : wrapper.parentElement;
  if (!group) return [];
  const selector = slot ? ":scope > [data-canx-moved-slot]" : ":scope > [data-room-box]";
  const attr = slot ? "data-canx-moved-slot" : "data-room-box";
  return Array.from(group.querySelectorAll<HTMLElement>(selector))
    .map((el, index) => ({
      id: el.getAttribute(attr) ?? "",
      order: Number(getComputedStyle(el).order) || 0,
      index,
    }))
    .filter((x) => x.id)
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((x) => x.id);
}

function useBoxActions(id: string, home: string) {
  const ctx = useRoomLayout();
  const current = ctx.layout.b[id] ?? {};
  const name = ctx.nameOf(id);
  return {
    rename: (next: string) => {
      const n = cleanName(next);
      const { n: _old, ...rest } = current;
      return ctx.save(
        { [id]: n ? { ...rest, n } : rest },
        n ? `Renamed "${name}" to "${n}"` : `Gave "${name}" back its built name`,
      );
    },
    moveTo: (route: string) =>
      ctx.save(
        { [id]: route === home ? { ...current, r: route } : { ...current, r: route, o: 9000 } },
        route === home
          ? `Brought "${name}" back to ${roomLabel(home)}`
          : `Moved "${name}" to ${roomLabel(route)}`,
      ),
    step: (wrapper: HTMLElement | null, dir: -1 | 1) => {
      const seq = reorder(shelfIds(wrapper), id, dir);
      if (!seq) return Promise.resolve(false);
      return ctx.save(orderChange(ctx.layout, seq), `Moved "${name}" ${dir < 0 ? "up" : "down"}`);
    },
    dropBefore: (wrapper: HTMLElement | null, moving: string) => {
      const seq = placeBefore(shelfIds(wrapper), moving, id);
      if (!seq) return Promise.resolve(false);
      return ctx.save(
        orderChange(ctx.layout, seq),
        `Moved "${ctx.nameOf(moving)}" above "${name}"`,
      );
    },
    reset: () => ctx.save({ [id]: null }, `Put "${name}" back as built`),
  };
}

/* ------------------------------------------------------------------ */
/* RoomBox                                                              */
/* ------------------------------------------------------------------ */

interface RoomBoxProps {
  /** "room-id.part", e.g. "owner-desk.priorities". Never change an id once shipped: saved moves use it. */
  id: string;
  /** The name shown on the box as built. Used to find its heading when John renames it. */
  name: string;
  children: ReactNode;
  className?: string | undefined;
}

/** One movable, renamable box. Locked with nothing saved, it draws its contents unchanged. */
export function RoomBox({ id, name, children, className }: RoomBoxProps) {
  const ctx = useRoomLayout();
  const iso = useContext(IsolateCtx);
  const home = homeRouteOfBox(id) ?? "";
  const where = roomOfBox(ctx.layout, id, home);
  const override = ctx.layout.b[id];
  const wrapper = useRef<HTMLDivElement>(null);
  const { register } = ctx;

  useEffect(() => register({ id, name, home }), [register, id, name, home]);

  // Show John's name on the box's own heading (no change to the box's code or data).
  const renamed = override?.n;
  useLayoutEffect(() => {
    const root = wrapper.current;
    if (!root) return;
    let marked: HTMLElement | null = null;
    const apply = () => {
      if (marked) {
        marked.removeAttribute("data-canx-renamed");
        marked.style.removeProperty("--canx-renamed-size");
        marked = null;
      }
      if (!renamed) return;
      const heading = findHeading(root, name);
      if (!heading) return;
      const size = getComputedStyle(heading).fontSize;
      heading.style.setProperty("--canx-renamed-size", size);
      heading.setAttribute("data-canx-renamed", renamed);
      marked = heading;
    };
    apply();
    if (!renamed) return;
    const watcher = new MutationObserver(() => {
      if (!marked || !root.contains(marked)) apply();
    });
    watcher.observe(root, { childList: true, subtree: true });
    return () => {
      watcher.disconnect();
      if (marked) marked.removeAttribute("data-canx-renamed");
    };
  });

  // CSS order only works on a flex or grid shelf. Turn a plain shelf into a column only when needed.
  const order = override?.o;
  useLayoutEffect(() => {
    const parent = wrapper.current?.parentElement;
    if (!parent || order === undefined || iso) return;
    if (getComputedStyle(parent).display === "block")
      parent.setAttribute("data-canx-layout-flex", "");
  }, [order, iso]);

  if (iso) {
    const target = iso.targets[id];
    if (!target) return null;
    return createPortal(
      <BoxFrame
        id={id}
        name={name}
        home={home}
        wrapperRef={wrapper}
        className={className}
        renamedName={renamed}
        moved
      >
        {children}
      </BoxFrame>,
      target,
    );
  }

  if (where !== home) {
    if (ctx.mode !== "unlocked") return null;
    return <MovedAwayNote id={id} name={ctx.nameOf(id)} home={home} where={where} />;
  }

  return (
    <BoxFrame
      id={id}
      name={name}
      home={home}
      wrapperRef={wrapper}
      className={className}
      order={order}
      renamedName={renamed}
    >
      {children}
    </BoxFrame>
  );
}

function findHeading(root: HTMLElement, name: string): HTMLElement | null {
  const want = name.trim();
  const candidates = root.querySelectorAll<HTMLElement>(
    "h1,h2,h3,h4,h5,h6,div,p,span,strong,summary,legend",
  );
  for (const el of candidates) {
    if (el.closest("[data-canx-box-bar]")) continue;
    if ((el.textContent ?? "").trim() !== want) continue;
    // Deepest element that holds exactly the name.
    const inner = Array.from(el.querySelectorAll<HTMLElement>("*")).find(
      (c) => (c.textContent ?? "").trim() === want,
    );
    return inner ?? el;
  }
  return null;
}

function BoxFrame({
  id,
  name,
  home,
  wrapperRef,
  className,
  order,
  renamedName,
  moved,
  children,
}: {
  id: string;
  name: string;
  home: string;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  className?: string | undefined;
  order?: number | undefined;
  renamedName?: string | undefined;
  moved?: boolean;
  children: ReactNode;
}) {
  const ctx = useRoomLayout();
  const editing = ctx.mode === "unlocked";
  const actions = useBoxActions(id, home);
  const [over, setOver] = useState(false);
  return (
    <div
      ref={wrapperRef}
      data-room-box={id}
      data-room-box-name={name}
      data-room-box-home={home}
      data-room-box-renamed={renamedName || undefined}
      className={`canx-room-box${editing ? " canx-room-box-editing" : ""}${over ? " canx-room-box-over" : ""}${className ? ` ${className}` : ""}`}
      style={order !== undefined && !moved ? { order } : undefined}
      onDragOver={
        editing
          ? (e) => {
              if (e.dataTransfer.types.includes("application/x-canx-box")) {
                e.preventDefault();
                setOver(true);
              }
            }
          : undefined
      }
      onDragLeave={editing ? () => setOver(false) : undefined}
      onDrop={
        editing
          ? (e) => {
              setOver(false);
              const moving = e.dataTransfer.getData("application/x-canx-box");
              if (moving && moving !== id) {
                e.preventDefault();
                void actions.dropBefore(wrapperRef.current, moving);
              }
            }
          : undefined
      }
    >
      {editing && <BoxBar id={id} name={renamedName ?? name} home={home} wrapperRef={wrapperRef} />}
      {renamedName && !editing && (
        <RenameFallback root={wrapperRef} name={name} renamed={renamedName} />
      )}
      {children}
    </div>
  );
}

/** If the box has no heading that matches its built name, show John's name as a small label. */
function RenameFallback({
  root,
  name,
  renamed,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  name: string;
  renamed: string;
}) {
  const [needed, setNeeded] = useState(false);
  useEffect(() => {
    const el = root.current;
    setNeeded(!!el && !el.querySelector("[data-canx-renamed]") && !findHeading(el, name));
  }, [root, name, renamed]);
  return needed ? (
    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {renamed}
    </p>
  ) : null;
}

function BoxBar({
  id,
  name,
  home,
  wrapperRef,
}: {
  id: string;
  name: string;
  home: string;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ctx = useRoomLayout();
  const actions = useBoxActions(id, home);
  const where = roomOfBox(ctx.layout, id, home);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const disabled = ctx.busy || !ctx.canEdit;
  return (
    <div data-canx-box-bar="true" data-canx-no-capture="true" className="canx-box-bar">
      <span
        className="canx-box-grip"
        draggable={!disabled}
        title="Drag onto another box to place it above that box"
        aria-label={`Drag ${name}`}
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-canx-box", id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </span>
      {naming ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void actions.rename(draft).then((ok) => ok && setNaming(false));
          }}
        >
          <input
            aria-label={`New name for ${name}`}
            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            value={draft}
            maxLength={NAME_MAX}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className="canx-box-btn" disabled={disabled}>
            Save
          </button>
          <button type="button" className="canx-box-btn" onClick={() => setNaming(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      )}
      {!naming && (
        <>
          <button
            type="button"
            className="canx-box-btn"
            aria-label={`Move ${name} up`}
            disabled={disabled}
            onClick={() => void actions.step(wrapperRef.current, -1)}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="canx-box-btn"
            aria-label={`Move ${name} down`}
            disabled={disabled}
            onClick={() => void actions.step(wrapperRef.current, 1)}
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="canx-box-btn"
            disabled={disabled}
            onClick={() => {
              setDraft(name);
              setNaming(true);
            }}
          >
            Rename
          </button>
          <MoveToSelect
            name={name}
            value={where}
            disabled={disabled}
            onChange={(r) => void actions.moveTo(r)}
          />
        </>
      )}
    </div>
  );
}

function MoveToSelect({
  name,
  value,
  disabled,
  onChange,
}: {
  name: string;
  value: string;
  disabled: boolean;
  onChange: (route: string) => void;
}) {
  return (
    <select
      aria-label={`Move ${name} to another room`}
      className="canx-box-select"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {OFFICE_ROOM_IDENTITIES.map((r) => (
        <option key={r.route} value={r.route}>
          {r.route === value ? `In ${r.label}` : `Move to ${r.label}`}
        </option>
      ))}
    </select>
  );
}

function MovedAwayNote({
  id,
  name,
  home,
  where,
}: {
  id: string;
  name: string;
  home: string;
  where: string;
}) {
  const ctx = useRoomLayout();
  const actions = useBoxActions(id, home);
  return (
    <div data-canx-no-capture="true" className="canx-moved-away" data-room-box-away={id}>
      <span>
        "{name}" now lives in <strong>{roomLabel(where)}</strong>.
      </span>
      <button
        type="button"
        className="canx-box-btn"
        disabled={ctx.busy || !ctx.canEdit}
        onClick={() => void actions.moveTo(home)}
      >
        Bring it back here
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Boxes moved INTO the room John is in                                 */
/* ------------------------------------------------------------------ */

class QuietBoundary extends Component<{ children: ReactNode; label: string }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <p className="text-sm text-muted-foreground">
        The boxes from {this.props.label} could not be shown here. They are safe in their own room.
      </p>
    ) : (
      this.props.children
    );
  }
}

/** Draws a room out of sight so the boxes John moved here can appear in this room. */
function BorrowedRoom({
  route,
  targets,
}: {
  route: string;
  targets: Record<string, HTMLElement | null>;
}) {
  const router = useRouter();
  const routes = router.routesByPath as unknown as Record<
    string,
    { options?: { component?: React.ComponentType } } | undefined
  >;
  const RoomComponent = routes[route]?.options?.component;
  const iso = useMemo(() => ({ targets }), [targets]);
  if (!RoomComponent) return null;
  return (
    <IsolateCtx.Provider value={iso}>
      <RoomRouteCtx.Provider value={route}>
        <div hidden aria-hidden="true" data-canx-borrowed-room={route}>
          <QuietBoundary label={roomLabel(route)}>
            <Suspense fallback={null}>
              <RoomComponent />
            </Suspense>
          </QuietBoundary>
        </div>
      </RoomRouteCtx.Provider>
    </IsolateCtx.Provider>
  );
}

export function MovedInBoxes() {
  const ctx = useRoomLayout();
  const path = useRoomPath();
  const iso = useContext(IsolateCtx);
  const route = roomIdentityForRoute(path)?.route ?? null;
  const [slots, setSlots] = useState<Record<string, HTMLElement | null>>({});
  const homes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of Object.keys(ctx.layout.b)) {
      const h = homeRouteOfBox(id);
      if (h) out[id] = h;
    }
    return out;
  }, [ctx.layout]);
  const ids = route && path !== "/" && !iso ? boxesMovedInto(ctx.layout, route, homes) : [];
  const groups = useMemo(() => {
    const g: Record<string, Record<string, HTMLElement | null>> = {};
    for (const id of ids) {
      const h = homes[id]!;
      (g[h] ??= {})[id] = slots[id] ?? null;
    }
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|"), homes, slots]);
  // One stable ref callback per slot; a new function each render would loop (null, element, null...).
  const slotRefs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const slotRef = (id: string) => {
    let fn = slotRefs.current.get(id);
    if (!fn) {
      fn = (el: HTMLElement | null) => setSlots((s) => (s[id] === el ? s : { ...s, [id]: el }));
      slotRefs.current.set(id, fn);
    }
    return fn;
  };
  if (!ids.length) return null;
  return (
    <section aria-label="Boxes moved into this room" className="mx-auto max-w-6xl px-4 pb-6">
      <div className="flex flex-col gap-4" data-canx-moved-in="true">
        {ids.map((id) => (
          <div
            key={id}
            data-canx-moved-slot={id}
            style={{ order: ctx.layout.b[id]?.o ?? 0 }}
            ref={slotRef(id)}
          >
            {ctx.mode === "unlocked" && (
              <p data-canx-no-capture="true" className="mb-1 text-xs text-muted-foreground">
                Moved here from {roomLabel(homes[id])}
              </p>
            )}
          </div>
        ))}
      </div>
      {Object.entries(groups).map(([home, targets]) => (
        <BorrowedRoom key={home} route={home} targets={targets} />
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The Edit tab                                                         */
/* ------------------------------------------------------------------ */

export function RoomEditTab() {
  const ctx = useRoomLayout();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const room = pathname === "/" ? null : roomIdentityForRoute(cleanRoute(pathname));
  const [menu, setMenu] = useState(false);
  if (!room) return null;
  const unlocked = ctx.mode === "unlocked";
  return (
    <div className="canx-edit-tab-row" data-canx-edit-tab="true">
      <div className="relative">
        <button
          type="button"
          className={`canx-edit-tab${unlocked ? " canx-edit-tab-on" : ""}`}
          aria-expanded={menu}
          aria-haspopup="menu"
          onClick={() => setMenu((m) => !m)}
        >
          {unlocked ? (
            <Unlock className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Lock className="h-4 w-4" aria-hidden="true" />
          )}
          Edit
          <span className="canx-edit-tab-state">{unlocked ? "Unlocked" : "Locked"}</span>
        </button>
        {menu && (
          <div role="menu" className="canx-edit-menu" data-canx-no-capture="true">
            {!ctx.canEdit && (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                Only John, signed in, can change rooms. You can look.
              </p>
            )}
            <button
              type="button"
              role="menuitem"
              className="canx-edit-menu-item"
              disabled={!ctx.canEdit}
              onClick={() => {
                ctx.setMode("unlocked");
                setMenu(false);
              }}
            >
              <Unlock className="h-4 w-4" aria-hidden="true" /> Unlock{" "}
              <span className="text-xs text-muted-foreground">drag, rename, move boxes</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="canx-edit-menu-item"
              disabled={!ctx.canEdit}
              onClick={() => {
                ctx.setMode("unlocked");
                ctx.setPanelOpen(true);
                setMenu(false);
              }}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit{" "}
              <span className="text-xs text-muted-foreground">
                list of this room's boxes + undo
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="canx-edit-menu-item"
              onClick={() => {
                ctx.setMode("locked");
                ctx.setPanelOpen(false);
                setMenu(false);
              }}
            >
              <Lock className="h-4 w-4" aria-hidden="true" /> Lock{" "}
              <span className="text-xs text-muted-foreground">hide the controls</span>
            </button>
          </div>
        )}
      </div>
      {unlocked && ctx.notice && (
        <p role="status" className="canx-edit-notice" data-canx-no-capture="true">
          {ctx.notice}
        </p>
      )}
      {ctx.panelOpen && <RoomEditPanel route={room.route} label={room.label} />}
    </div>
  );
}

function PanelRow({ box, route }: { box: BoxInfo; route: string }) {
  const ctx = useRoomLayout();
  const actions = useBoxActions(box.id, box.home);
  const name = ctx.nameOf(box.id);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const where = roomOfBox(ctx.layout, box.id, box.home);
  const disabled = ctx.busy || !ctx.canEdit;
  const el = () => document.querySelector<HTMLElement>(`[data-room-box="${CSS.escape(box.id)}"]`);
  return (
    <li className="canx-panel-row">
      <form
        className="flex w-full min-w-0 items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim() !== name) void actions.rename(draft.trim() === box.name ? "" : draft);
        }}
      >
        <input
          aria-label={`Name of ${name}`}
          className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
          value={draft}
          maxLength={NAME_MAX}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="canx-box-btn" disabled={disabled || draft.trim() === name}>
          Save name
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-1">
        {where === route && (
          <>
            <button
              type="button"
              className="canx-box-btn"
              aria-label={`Move ${name} up`}
              disabled={disabled}
              onClick={() => void actions.step(el(), -1)}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="canx-box-btn"
              aria-label={`Move ${name} down`}
              disabled={disabled}
              onClick={() => void actions.step(el(), 1)}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        )}
        <MoveToSelect
          name={name}
          value={where}
          disabled={disabled}
          onChange={(r) => void actions.moveTo(r)}
        />
        {ctx.layout.b[box.id] && (
          <button
            type="button"
            className="canx-box-btn"
            disabled={disabled}
            onClick={() => void actions.reset()}
          >
            As built
          </button>
        )}
      </div>
      {where !== route && (
        <p className="w-full text-xs text-muted-foreground">
          Now in {roomLabel(where)}
          {box.home !== route ? ` (built in ${roomLabel(box.home)})` : ""}.
        </p>
      )}
    </li>
  );
}

function HistoryRow({ entry }: { entry: LayoutChangeEntry }) {
  const ctx = useRoomLayout();
  const when = new Date(entry.at);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
      <span className="min-w-0 flex-1">
        {entry.what}
        <span className="block text-xs text-muted-foreground">
          {Number.isNaN(when.getTime()) ? entry.at : when.toLocaleString()}
        </span>
      </span>
      <button
        type="button"
        className="canx-box-btn"
        disabled={ctx.busy || !ctx.canEdit}
        onClick={() => void ctx.save(entry.before, `Put back: ${entry.what}`.slice(0, 160))}
      >
        <Undo2 className="h-4 w-4" aria-hidden="true" /> Put back
      </button>
    </li>
  );
}

function RoomEditPanel({ route, label }: { route: string; label: string }) {
  const ctx = useRoomLayout();
  // Boxes drawn on this screen (built here, or moved here), plus ones built here but moved away.
  const here = ctx.boxes.filter(
    (b) => b.home === route || roomOfBox(ctx.layout, b.id, b.home) === route,
  );
  const away = Object.keys(ctx.layout.b)
    .filter(
      (id) =>
        homeRouteOfBox(id) === route &&
        ctx.layout.b[id]?.r &&
        ctx.layout.b[id]?.r !== route &&
        !here.some((b) => b.id === id),
    )
    .map((id) => ({ id, name: ctx.nameOf(id), home: route }));
  const list = [...here, ...away];
  const domOrder = (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-room-box="${CSS.escape(id)}"]`);
    return el ? Array.from(document.querySelectorAll("[data-room-box]")).indexOf(el) : 9999;
  };
  list.sort((a, b) => domOrder(a.id) - domOrder(b.id));
  return (
    <aside aria-label={`Edit ${label}`} className="canx-edit-panel" data-canx-no-capture="true">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Edit {label}</h2>
        <button type="button" className="canx-box-btn" onClick={() => ctx.setPanelOpen(false)}>
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Rename a box, move it up or down, or move it to another room. Nothing inside a box is
        changed or deleted, and every change can be put back below.
      </p>
      {list.length ? (
        <ul className="space-y-2">
          {list.map((b) => (
            <PanelRow key={b.id} box={b} route={route} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">This room has no movable boxes yet.</p>
      )}
      <h3 className="pt-2 text-sm font-semibold">Recent changes (all rooms)</h3>
      {ctx.history.h.length ? (
        <ul>
          {ctx.history.h.slice(0, 20).map((e, i) => (
            <HistoryRow key={`${e.at}-${i}`} entry={e} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No changes yet.</p>
      )}
    </aside>
  );
}

export { RoomRouteCtx };
