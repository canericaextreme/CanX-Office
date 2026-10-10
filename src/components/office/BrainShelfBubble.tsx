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
}: {
  children: ReactNode;
  contents: ReactNode;
  name: string;
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  number: number;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerFocus = useRef(false);
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  useEffect(() => cancelClose, []);
  const enter = () => {
    cancelClose();
    onOpenChange(true);
  };
  // Allow the pointer to cross the small gap between the anchor and portal.
  const leave = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => onOpenChange(false), 120);
  };
  const blur = (target: EventTarget | null) => {
    if (
      target instanceof Node &&
      (anchor.current?.contains(target) || bubble.current?.contains(target))
    )
      return;
    leave();
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          ref={anchor}
          className="relative"
          data-shelf={number}
          onPointerEnter={(e) => {
            if (e.pointerType !== "touch") enter();
          }}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") leave();
          }}
          onPointerDown={() => {
            pointerFocus.current = true;
          }}
          onPointerUp={() => {
            pointerFocus.current = false;
          }}
          onPointerCancel={() => {
            pointerFocus.current = false;
          }}
          onFocus={() => {
            if (!pointerFocus.current) enter();
          }}
          onBlur={(e) => blur(e.relatedTarget)}
        >
          {children}
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`About ${name}`}
              aria-controls={open ? id : undefined}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--brain-line)] bg-[var(--brain-card)] text-sm font-bold focus-visible:outline-2"
            >
              i
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={bubble}
        id={id}
        aria-label={`${name} contents`}
        side="top"
        sideOffset={4}
        collisionPadding={12}
        className="w-[min(36rem,calc(100vw-24px))] max-h-[min(28rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain break-words border-[var(--brain-line)] bg-[var(--brain-card)] text-[var(--brain-room-ink)]"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          if (e.pointerType !== "touch") enter();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== "touch") leave();
        }}
        onFocus={cancelClose}
        onBlur={(e) => blur(e.relatedTarget)}
        onEscapeKeyDown={cancelClose}
      >
        {contents}
      </PopoverContent>
    </Popover>
  );
}
