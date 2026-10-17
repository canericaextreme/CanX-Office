import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { RoomColour } from "@/lib/office-room-colours";

/**
 * Paints a room in its palette colour without touching what the room does.
 * The outer box remembers the theme's own card and border colours, so the
 * inner box can tint them (a self-referencing CSS variable would be invalid).
 * Styling lives in styles.css under .room-colour.
 */
export function RoomColourScope({ colour, children }: { colour: RoomColour; children: ReactNode }) {
  const base = {
    "--room-base-card": "var(--card)",
    "--room-base-border": "var(--border)",
  } as CSSProperties;
  const vars = {
    "--room-bright": colour.bright,
    "--room-soft": colour.soft,
    "--room-button": colour.button,
  } as CSSProperties;
  return (
    <div style={base}>
      <div className="room-colour" style={vars}>
        {children}
      </div>
    </div>
  );
}

interface BannerProps {
  colour: RoomColour;
  /** Office map number ("01".."20"), or null for auxiliary pages. */
  number: string | null;
  title: string;
  purpose: string;
  icon?: LucideIcon | undefined;
  /** Small chips shown beside the title, such as the sample-data badge. */
  extra?: ReactNode;
  /** h2 when the page already has its own h1 (Round Table). */
  headingLevel?: "h1" | "h2";
}

export function RoomColourBanner({
  colour,
  number,
  title,
  purpose,
  icon: Icon,
  extra,
  headingLevel = "h1",
}: BannerProps) {
  const Heading = headingLevel;
  return (
    <header
      className="mb-6 rounded-xl border p-6 sm:p-8"
      style={{
        borderColor: colour.to,
        background: `linear-gradient(135deg, ${colour.from} 0%, ${colour.bright} 50%, ${colour.to} 100%)`,
        color: colour.ink,
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[.2em]">
        CanX Office / {number ? `Room ${number}` : title}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {Icon && <Icon className="h-8 w-8" aria-hidden="true" />}
        <Heading className="font-serif text-3xl font-semibold sm:text-4xl">{title}</Heading>
        {extra && <span style={{ "--foreground": colour.ink } as CSSProperties}>{extra}</span>}
      </div>
      {purpose && <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed">{purpose}</p>}
    </header>
  );
}
