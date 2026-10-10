import { useEffect, useRef, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** A shelf and its portalled contents share one hover/focus boundary. */
export function BrainShelfBubble({
  children,
  contents,
  name,
  id,
  open,
  onOpenChange,
  number,
  onSelect,
}: {
  children: ReactNode;
  contents: ReactNode;
  name: string;
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number: number;
  onSelect: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerFocus = useRef(false);
  const keyboardFocus = useRef(false);
  const hovered = useRef({ shelf: false, bubble: false });
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => cancelClose, []);
  useEffect(() => {
    // A dismissed portal may unmount without emitting pointerleave.
    if (!open) hovered.current.bubble = false;
  }, [open]);
  const enter = () => {
    cancelClose();
    onOpenChange(true);
  };
  // Allow the pointer to cross the small gap between the anchor and portal.
  const leave = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      const focused = document.activeElement;
      if (hovered.current.shelf || hovered.current.bubble) return;
      if (keyboardFocus.current && (anchor.current?.contains(focused) || bubble.current?.contains(focused))) return;
      onOpenChange(false);
    }, 200);
  };
  const blur = (target: EventTarget | null) => {
    if (
      target instanceof Node &&
      (anchor.current?.contains(target) || bubble.current?.contains(target))
    )
      return;
    keyboardFocus.current = false;
    leave();
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          ref={anchor}
          className="brain-shelf group/shelf relative"
          data-open={open}
          data-shelf={number}
          onPointerEnter={(e) => {
            if (e.pointerType !== "touch") {
              hovered.current.shelf = true;
              enter();
            }
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") {
              hovered.current.shelf = false;
              leave();
            }
          }}
          onPointerDown={() => {
            pointerFocus.current = true;
            keyboardFocus.current = false;
          }}
          onPointerUp={() => {
            pointerFocus.current = false;
          }}
          onPointerCancel={() => {
            pointerFocus.current = false;
          }}
          onFocus={() => {
            if (!pointerFocus.current) {
              keyboardFocus.current = true;
              enter();
            }
          }}
          onBlur={(e) => blur(e.relatedTarget)}
        >
          {children}
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`About ${name}`}
              aria-controls={open ? id : undefined}
              className="brain-shelf-info absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--brain-line)] bg-[var(--brain-card)] text-sm font-bold focus-visible:outline-2"
            >
              i
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={bubble}
        id={id}
        aria-label={`${name} synopsis`}
        side="top"
        sideOffset={12}
        collisionPadding={12}
        className="brain-shelf-bubble w-[min(20rem,calc(100vw-24px))] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain break-words border-[var(--brain-line)] bg-[var(--brain-card)] text-[var(--brain-room-ink)] cursor-pointer"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") {
            hovered.current.bubble = true;
            enter();
          }
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") {
            hovered.current.bubble = false;
            leave();
          }
        }}
        onFocusOutside={(event) => {
          if (hovered.current.shelf || hovered.current.bubble) event.preventDefault();
        }}
        onClick={onSelect}
        onFocus={() => {
          keyboardFocus.current = true;
          cancelClose();
        }}
        onBlur={(e) => blur(e.relatedTarget)}
        onEscapeKeyDown={cancelClose}
      >
        {contents}
      </PopoverContent>
    </Popover>
  );
}
