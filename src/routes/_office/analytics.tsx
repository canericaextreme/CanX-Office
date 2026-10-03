import { OfficeFiles } from "@/components/office/OfficeFiles";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_office/analytics")({ component: AnalyticsRoom });

function AnalyticsRoom() {
  return <main className="min-h-screen bg-background px-4 py-8"><div className="mx-auto max-w-6xl rounded-2xl border-2 border-orange-500/70 bg-card p-6 shadow-xl shadow-orange-950/20"><div className="flex items-center gap-3"><BarChart3 className="h-8 w-8 text-orange-400" /><div><h1 className="text-3xl font-bold text-foreground">Analytics</h1><p className="text-muted-foreground">Revenue, expenses, profit and loss, progress, workload, growth, subscriptions and Safe Highways.</p></div></div><OfficeFiles room="analytics" /><div className="mt-8 rounded-xl border border-orange-500/30 bg-background/60 p-5"><h2 className="font-semibold text-foreground">Separate from Office Health</h2><p className="mt-2 text-sm text-muted-foreground">Analytics holds graphs and trends. Office Health continues to hold reliability, warnings, uptime, backup and recovery. Live charts will be connected during the room-by-room skills and data phase.</p></div></div></main>;
}
