import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficeNav } from "@/components/office/OfficeNav";
import { RoomReports } from "@/components/office/RoomReports";
import { RoomAccessBar } from "@/components/office/RoomAccessBar";
import { OfficeManager } from "@/components/office/OfficeManager";
import { ApprovalAlert } from "@/components/office/ApprovalAlert";
import { CompanionDock } from "@/components/office/CompanionDock";
import { OfficeGate } from "@/components/office/OfficeGate";
import { OfficeThemeProvider } from "@/lib/office-theme";
import { OwnerSessionProvider } from "@/lib/owner-session";
import { useOfficeViewMode } from "@/hooks/use-office-view";
import { useOwnerSession } from "@/lib/owner-session";

export const Route = createFileRoute("/_office")({
  component: OfficeLayout,
});

function OfficeInterior() {
  const { mode, setMode, hydrated } = useOfficeViewMode();
  // A read-only assistant viewing session: no assistants, alerts or companion are started, so nothing can be spent or asked.
  const readOnlyViewer = useOwnerSession().viewer;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-screen flex-1 flex-col" data-canx-office-backdrop="true">
        <OfficeNav
          viewMode={hydrated ? mode : "3d"}
          onToggleView={() => setMode(mode === "3d" ? "simple" : "3d")}
        />
        {/* The only element an office observation may look at. */}
        <div className="flex-1 pb-20" data-canx-office-view="true">
          <RoomAccessBar />
          <Outlet />
          <RoomReports />
        </div>
      </div>
      {/* Overlays are excluded from every observation. */}
      {readOnlyViewer ? (
        <p data-canx-no-capture="true" data-canx-viewer-badge="true" className="pointer-events-none fixed bottom-2 left-2 z-50 rounded bg-black/70 px-2 py-1 text-xs text-white">
          Read-only view
        </p>
      ) : (
        <>
          <div data-canx-no-capture="true">
            <ApprovalAlert />
          </div>
          <CompanionDock />
          <div data-canx-no-capture="true">
            <OfficeManager />
          </div>
        </>
      )}
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
