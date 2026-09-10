import { createFileRoute } from "@tanstack/react-router";
import { RoomShell } from "@/components/office/RoomShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SAMPLE_WORK_ITEMS } from "@/lib/office-data";
import { StatusBadge } from "@/components/office/StatusBadge";
import { useOwnerSession } from "@/lib/owner-session";
import { loadManagerMemory, type ManagerTask } from "@/lib/manager-work.functions";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/_office/work-board")({
  head: () => ({
    meta: [
      { title: "CanX Office — Work Board" },
      { name: "description", content: "Canonical work queue for CanX Office." },
      { property: "og:title", content: "CanX Office — Work Board" },
      { property: "og:description", content: "Canonical work queue for CanX Office." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkBoard,
});

function WorkBoard() {
  const { state, accessToken, shared, message } = useOwnerSession();
  const loadMemory = useServerFn(loadManagerMemory);
  const [memory, setMemory] = useState<{ tasks: ManagerTask[]; error?: string } | null>(null);

  useEffect(() => {
    if (state !== "owner" || !accessToken) {
      setMemory(null);
      return;
    }
    let cancelled = false;
    loadMemory({ data: { accessToken } })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setMemory({ tasks: result.tasks });
        } else {
          setMemory({ tasks: [], error: result.message });
        }
      })
      .catch(() => {
        if (!cancelled) setMemory({ tasks: [], error: "Could not load the workbench." });
      });
    return () => {
      cancelled = true;
    };
  }, [state, accessToken, loadMemory]);

  const items = memory?.tasks ?? SAMPLE_WORK_ITEMS;

  return (
    <RoomShell>
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Canonical queue</CardTitle>
            {!shared && (
              <span className="text-xs text-muted-foreground">
                {state === "owner" ? "Shared memory unavailable" : "Sign in as owner for shared memory"}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {state === "owner" && memory?.error && (
            <p className="text-xs text-canx-yellow">{memory.error}</p>
          )}
          {state !== "owner" && state !== "checking" && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={"status" in item ? item.status : "open"} />
                <span className="font-medium">{item.title}</span>
                {"worker" in item && item.worker ? (
                  <span className="text-xs text-muted-foreground">· {item.worker}</span>
                ) : null}
              </div>
              {"detail" in item && item.detail ? (
                <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Project: {(item as { project?: string }).project}</p>
              )}
              {"blocker" in item && item.blocker && (
                <p className="mt-1 text-xs text-canx-yellow">Blocker: {item.blocker}</p>
              )}
              {"evidence" in item && item.evidence && (
                <p className="mt-1 text-xs text-canx-green">Evidence: {item.evidence}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </RoomShell>
  );
}
