/**
 * Room colours from John's 28-colour neon palette (17 Oct 2026).
 *
 * Only rooms that were still plain are listed. Rooms with their own makeover
 * (Reception, Approvals, Blueprint, Systems, Safe Highways, Legal, Analytics),
 * the Brain (its own coloured shelf design) and Finance are deliberately absent,
 * so they render exactly as before.
 * Removing one line here returns that room to the plain look.
 *
 * bright: the palette colour itself (banner, card stripe).
 * soft:   the same colour lightened until it reads on the dark cards (links, buttons).
 * ink:    text on the bright banner — dark ink, or white on the deep colours.
 * button: dark ink for text on soft buttons.
 * from/to: banner gradient ends; ink keeps at least 3:1 contrast on both.
 */
export interface RoomColour {
  name: string;
  bright: string;
  soft: string;
  ink: string;
  button: string;
  from: string;
  to: string;
}

export const ROOM_COLOURS: Record<string, RoomColour> = {
  "/owner-desk": { name: "Taxi Gold", bright: "#FFC300", soft: "#FFC300", ink: "#241B00", button: "#241B00", from: "#FFD859", to: "#E0AC00" },
  "/idea-garage": { name: "Electric Yellow", bright: "#FFF000", soft: "#FFF000", ink: "#242200", button: "#242200", from: "#FFF559", to: "#E0D300" },
  "/office-team": { name: "Neon Tangerine", bright: "#FF8C1A", soft: "#FFAE5F", ink: "#241404", button: "#241404", from: "#FFB46A", to: "#E07B17" },
  "/records": { name: "Electric Blue", bright: "#2E5BFF", soft: "#A1B5FF", ink: "#FFFFFF", button: "#060D24", from: "#5479FF", to: "#19328C" },
  "/health": { name: "Toxic Mint", bright: "#00FFAA", soft: "#00FFAA", ink: "#002418", button: "#002418", from: "#59FFC8", to: "#00E096" },
  "/communications": { name: "Electric Cyan", bright: "#00F0FF", soft: "#00F0FF", ink: "#002224", button: "#002224", from: "#59F5FF", to: "#00D3E0" },
  "/subscriptions": { name: "Hot Pink", bright: "#FF1493", soft: "#FF95CE", ink: "#240315", button: "#240315", from: "#FF66B9", to: "#E01281" },
  "/work-board": { name: "Molten Coral", bright: "#FF5F45", soft: "#FFA799", ink: "#240D0A", button: "#240D0A", from: "#FF9786", to: "#E0543D" },
  "/build-testing": { name: "Fire Red", bright: "#FF1E1E", soft: "#FF9A9A", ink: "#240404", button: "#240404", from: "#FF6D6D", to: "#E01A1A" },
  "/research": { name: "Ultramarine Volt", bright: "#3D1BFF", soft: "#B1A4FF", ink: "#FFFFFF", button: "#090424", from: "#6044FF", to: "#220F8C" },
  "/family-continuity": { name: "Bubblegum Neon", bright: "#FF4FD8", soft: "#FF9EEA", ink: "#240B1E", button: "#240B1E", from: "#FF8DE6", to: "#E046BE" },
  "/future": { name: "Ultra Magenta", bright: "#FF00FF", soft: "#FF8CFF", ink: "#240024", button: "#240024", from: "#FF59FF", to: "#E000E0" },
  "/projects": { name: "Neon Lime", bright: "#39FF14", soft: "#39FF14", ink: "#082403", button: "#082403", from: "#7EFF66", to: "#32E012" },
  "/skills": { name: "Electric Green", bright: "#00FF66", soft: "#00FF66", ink: "#00240E", button: "#00240E", from: "#59FF9C", to: "#00E05A" },
  "/round-table": { name: "Grape Volt", bright: "#6A0DAD", soft: "#CBAAE2", ink: "#FFFFFF", button: "#0F0218", from: "#8539BC", to: "#3A075F" },
};

export function roomColourForRoute(route: string | null | undefined): RoomColour | null {
  return route ? ROOM_COLOURS[route] ?? null : null;
}
