import { useManagerMemory } from "@/lib/use-manager-memory";
/** A live count, never a sample or a claim based on a spoken reply. */
export function ApprovalIndicator() {
  const { memory, loading, error } = useManagerMemory();
  if (!memory) return <span className="block text-xs text-muted-foreground">{loading ? "Checking approvals…" : error ? "Approvals unavailable" : "Sign in to check approvals"}</span>;
  const count = memory.approvals.filter(item => item.status === "pending").length;
  return <span role="status" className={count ? "block rounded bg-canx-yellow/15 px-2 py-1 text-xs font-semibold text-canx-yellow" : "block text-xs text-muted-foreground"}>
    {count ? `${count} waiting for your approval` : "No approvals waiting"}
  </span>;
}
