import { Link } from "@tanstack/react-router";
import { ChevronLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SampleBadge } from "./SampleBadge";
import { roomByRoute, type RoomDef } from "@/lib/office-data";
import { useRouterState } from "@tanstack/react-router";

interface RoomShellProps {
  children: React.ReactNode;
  title?: string;
  purpose?: string;
  showSample?: boolean;
}

export function RoomShell({ children, title, purpose, showSample = true }: RoomShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const room: RoomDef = roomByRoute(pathname);

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/">
                <Home className="mr-1 h-4 w-4" />
                Office home
              </Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
