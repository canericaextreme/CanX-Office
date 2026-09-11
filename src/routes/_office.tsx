import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficeNav } from "@/components/office/OfficeNav";
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
      <div className="flex-1 pb-20">
        <Outlet />
      </div>
      <ApprovalAlert />
      <CompanionDock />
      <OfficeManager />
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
