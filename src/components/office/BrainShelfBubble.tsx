import { useRef, useState, type ReactNode } from "react";

/** The synopsis stays inside its shelf; entry coordinates never follow pointer movement. */
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
  const pointerFocus = useRef(false);
  const [origin, setOrigin] = useState("50% 50%");
  return (
    <div
      className="brain-shelf group/shelf relative"
      data-open={open}
      data-shelf={number}
      onPointerEnter={(e) => {
        if (e.pointerType === "touch") return;
        const box = e.currentTarget.getBoundingClientRect();
        setOrigin(
          `${Math.max(0, Math.min(box.width, e.clientX - box.left))}px ${Math.max(0, Math.min(box.height, e.clientY - box.top))}px`,
        );
        onOpenChange(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch" && !e.currentTarget.contains(document.activeElement))
          onOpenChange(false);
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
      onFocus={(e) => {
        if (!pointerFocus.current && !e.currentTarget.contains(e.relatedTarget as Node)) {
          setOrigin("50% 50%");
          onOpenChange(true);
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onOpenChange(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if ((e.target as HTMLElement).closest(".brain-shelf-bubble"))
            e.currentTarget.querySelector<HTMLButtonElement>(".brain-shelf-face")?.focus();
          onOpenChange(false);
        }
      }}
    >
      {children}
      <button
        type="button"
        aria-label={`About ${name}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="brain-shelf-info absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--brain-line)] bg-[var(--brain-card)] text-sm font-bold focus-visible:outline-2"
        onClick={() => onOpenChange(!open)}
      >
        i
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={`${name} synopsis`}
          className="brain-shelf-bubble absolute inset-0 z-10 overflow-y-auto overscroll-contain break-words rounded-xl border border-[var(--brain-line)] bg-[var(--brain-card)] p-3 pr-12 text-[var(--brain-room-ink)]"
          style={{ transformOrigin: origin }}
          onClick={(e) => {
            if (!(e.target as HTMLElement).closest("button")) onSelect();
          }}
        >
          {contents}
        </div>
      )}
    </div>
  );
}
