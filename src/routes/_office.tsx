import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficeNav } from "@/components/office/OfficeNav";
import { RoomReports } from "@/components/office/RoomReports";
import { OfficeManager } from "@/components/office/OfficeManager";
import { ApprovalAlert } from "@/components/office/ApprovalAlert";
import { CompanionDock } from "@/components/office/CompanionDock";
import { OfficeGate } from "@/components/office/OfficeGate";
import { OfficeThemeProvider } from "@/lib/office-theme";
import { OwnerSessionProvider } from "@/lib/owner-session";
import { useOfficeViewMode } from "@/hooks/use-office-view";

export const Route = createFileRoute("/_office")({
  component: OfficeLayout,
});

function OfficeInterior() {
  const { mode, setMode, hydrated } = useOfficeViewMode();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OfficeNav
        viewMode={hydrated ? mode : "3d"}
        onToggleView={() => setMode(mode === "3d" ? "simple" : "3d")}
      />
      {/* The only element an office observation may look at. */}
      <div className="flex-1 pb-20" data-canx-office-view="true">
        <Outlet />
        <RoomReports />
      </div>
      {/* Overlays are excluded from every observation. */}
      <div data-canx-no-capture="true">
        <ApprovalAlert />
      </div>
      <CompanionDock />
      <div data-canx-no-capture="true">
        <OfficeManager />
      </div>
    </div>
  );
}

function OfficeLayout() {
  return (
    <OfficeThemeProvider>
      <OwnerSessionProvider>
        <OfficeGate>
          <OfficeInterior />
        </OfficeGate>
      </OwnerSessionProvider>
    </OfficeThemeProvider>
  );
}
