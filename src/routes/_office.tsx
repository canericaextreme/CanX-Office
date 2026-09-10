import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficeNav } from "@/components/office/OfficeNav";
import { OfficeManager } from "@/components/office/OfficeManager";
import { OfficeThemeProvider } from "@/lib/office-theme";
import { OwnerSessionProvider } from "@/lib/owner-session";
import {
  OfficeViewModeProvider,
  useOfficeViewMode,
  DEFAULT_OFFICE_VIEW_MODE,
} from "@/hooks/use-office-view";

export const Route = createFileRoute("/_office")({
  component: OfficeLayout,
});

function OfficeLayout() {
  return (
    <OfficeThemeProvider>
      <OwnerSessionProvider>
        <OfficeViewModeProvider>
          <OfficeChrome />
        </OfficeViewModeProvider>
      </OwnerSessionProvider>
    </OfficeThemeProvider>
  );
}

function OfficeChrome() {
  const { mode, toggleMode, hydrated } = useOfficeViewMode();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OfficeNav
        viewMode={hydrated ? mode : DEFAULT_OFFICE_VIEW_MODE}
        onToggleView={toggleMode}
      />
      <div className="flex-1 pb-20">
        <Outlet />
      </div>
      <OfficeManager />
    </div>
  );
}
