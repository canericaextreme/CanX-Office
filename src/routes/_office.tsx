import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficeNav } from "@/components/office/OfficeNav";
import { RoomReports } from "@/components/office/RoomReports";
import { RoomAccessBar } from "@/components/office/RoomAccessBar";
import { OfficeManager } from "@/components/office/OfficeManager";
import { ApprovalAlert } from "@/components/office/ApprovalAlert";
import { CompanionDock } from "@/components/office/CompanionDock";
import { SecondEyesPanel } from "@/components/office/SecondEyesPanel";
import { DailyPreTripStarter } from "@/components/office/PreTripCard";
import { canBrowseOfficeWithoutSignIn } from "@/lib/office-development-access";
import { OfficeGate } from "@/components/office/OfficeGate";
import { OfficeThemeProvider } from "@/lib/office-theme";
import { OwnerSessionProvider } from "@/lib/owner-session";
import { useOwnerSession } from "@/lib/owner-session";

export const Route = createFileRoute("/_office")({
  component: OfficeLayout,
});

function OfficeInterior() {
  // A read-only assistant viewing session: no assistants, alerts or companion are started, so nothing can be spent or asked.
  const readOnlyViewer = useOwnerSession().viewer;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="flex min-h-screen flex-1 flex-col" data-canx-office-backdrop="true">
        <OfficeNav />
        {!readOnlyViewer && <p className="canx-mobile-orientation-hint" data-canx-no-capture="true">
          For a wider Office, turn your phone sideways. Enable Auto rotate if it stays upright.
        </p>}
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
          {/* Elsie's once-a-day pre-trip: runs beside her, never inside a reply. */}
          <DailyPreTripStarter />
          {/* Work with Claude tab, beside the Chatbot tab, reachable from every room. */}
          <SecondEyesPanel />
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
        {canBrowseOfficeWithoutSignIn(import.meta.env.DEV)
          ? <OfficeInterior />
          : <OfficeGate><OfficeInterior /></OfficeGate>}
      </OwnerSessionProvider>
    </OfficeThemeProvider>
  );
}
