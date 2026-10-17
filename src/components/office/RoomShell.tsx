import { OfficeFiles } from "./OfficeFiles";
import { RoomSkillsLink } from "./RoomSkillsLink";
import { SampleBadge } from "./SampleBadge";
import { roomIdentityForRoute } from "@/lib/office-room-identity";
import { roomColourForRoute } from "@/lib/office-room-colours";
import { RoomColourBanner, RoomColourScope } from "./RoomColour";
import { useRouterState } from "@tanstack/react-router";

interface RoomShellProps {
  children: React.ReactNode;
  title?: string;
  purpose?: string;
  showSample?: boolean;
  showFiles?: boolean;
}

export function RoomShell({
  children,
  title,
  purpose,
  showSample = true,
  showFiles = true,
}: RoomShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Exact identity only: an unknown page never borrows Reception's label or files.
  const room = roomIdentityForRoute(pathname);

  // Rooms still plain get their palette colour; rooms with their own makeover have none.
  const colour = roomColourForRoute(room?.route);
  const heading = title ?? room?.label ?? "Office page";
  const body = (
    <>
      {room && showFiles && <OfficeFiles room={room.id} collapseList={room.id === "brain"} />}
      {pathname !== "/skills" && <RoomSkillsLink route={pathname} />}
      {children}
    </>
  );

  if (colour) {
    return (
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <RoomColourBanner
            colour={colour}
            number={room?.number ?? null}
            title={heading}
            purpose={purpose ?? room?.purpose ?? ""}
            icon={room?.icon}
            extra={showSample ? <SampleBadge /> : null}
          />
          <RoomColourScope colour={colour}>{body}</RoomColourScope>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 border-b border-border pb-5">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2">
              {room && (
                <room.icon className="h-6 w-6" style={{ color: room.color }} aria-hidden="true" />
              )}
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {heading}
              </h1>
              {showSample && <SampleBadge />}
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {purpose ?? room?.purpose ?? ""}
            </p>
          </div>
        </div>
        {body}
      </div>
    </main>
  );
}
