import { createFileRoute, Outlet } from "@tanstack/react-router";
import { OfficeNav } from "@/components/office/OfficeNav";
import { useOfficeViewMode } from "@/hooks/use-office-view";

export const Route = createFileRoute("/_office")({
  component: OfficeLayout,
});

function OfficeLayout() {
  const { mode, setMode, hydrated } = useOfficeViewMode();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <OfficeNav
        viewMode={hydrated ? mode : "3d"}
        onToggleView={() => setMode(mode === "3d" ? "simple" : "3d")}
      />
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
