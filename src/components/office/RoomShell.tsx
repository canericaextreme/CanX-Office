import { Link } from "@tanstack/react-router";
import { SampleBadge } from "./SampleBadge";
import { ROOMS, roomByRoute, type RoomDef } from "@/lib/office-data";
import { useRouterState } from "@tanstack/react-router";

interface RoomShellProps {
  children: React.ReactNode;
  title?: string;
  purpose?: string;
  showSample?: boolean;
}

export function RoomShell({ children, title, purpose, showSample = true }: RoomShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const room: RoomDef = roomByRoute(pathname) ?? ROOMS[0];

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 border-b border-border pb-5">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              <room.icon className="h-6 w-6" style={{ color: room.color }} aria-hidden="true" />
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title ?? room.label}
              </h1>
              {showSample && <SampleBadge />}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {purpose ?? room.purpose}
            </p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
