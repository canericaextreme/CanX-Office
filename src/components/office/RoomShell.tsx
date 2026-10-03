import { OfficeFiles } from "./OfficeFiles";
import { RoomSkillsLink } from "./RoomSkillsLink";
import { SampleBadge } from "./SampleBadge";
import { roomIdentityForRoute } from "@/lib/office-room-identity";
import { useRouterState } from "@tanstack/react-router";

interface RoomShellProps {
  children: React.ReactNode;
  title?: string;
  purpose?: string;
  showSample?: boolean;
}

export function RoomShell({ children, title, purpose, showSample = true }: RoomShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Exact identity only: an unknown page never borrows Reception's label or files.
  const room = roomIdentityForRoute(pathname);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 border-b border-border pb-5">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              {room && <room.icon className="h-6 w-6" style={{ color: room.color }} aria-hidden="true" />}
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title ?? room?.label ?? "Office page"}
              </h1>
              {showSample && <SampleBadge />}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {purpose ?? room?.purpose ?? ""}
            </p>
          </div>
        </div>
        {room && <OfficeFiles room={room.id} />}
        {pathname !== "/skills" && <RoomSkillsLink route={pathname} />}
        {children}
      </div>
    </main>
  );
}
