import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOwnerSession } from "@/lib/owner-session";
import { CAPTURE_ROOM_LABELS } from "@/lib/room-capture-meta";
import { getViewAccess, revokeViewAccess, setViewAccess } from "@/lib/office-view-owner.functions";
import { SCOPE_WORDS, VIEW_ASSISTANTS, VIEW_SCOPES, describeGrant, protectedRoomsIn, type GrantRow, type HistoryRow, type ViewScope } from "@/lib/office-view-owner";

type Loaded = { grants: GrantRow[]; history: HistoryRow[] } | { error: string } | null;
const NAMES: Record<string, string> = { claude: "Claude", chatgpt: "ChatGPT", elsie: "Elsie" };

/** Owner control for the view-only delegation: who may look, at which rooms, until when; revoke one at a time. */
export function ViewAccessPanel() {
  const session = useOwnerSession();
  const read = useServerFn(getViewAccess);
  const save = useServerFn(setViewAccess);
  const revoke = useServerFn(revokeViewAccess);
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [assistant, setAssistant] = useState<string>("claude");
  const [viewerUserId, setViewerUserId] = useState("");
  const [rooms, setRooms] = useState<string[]>([]);
  const [scopes, setScopes] = useState<ViewScope[]>(["view_room_images", "read_room_information"]);
  const [days, setDays] = useState(30);
  const [refresh, setRefresh] = useState(0);
  const [mfaCode, setMfaCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [mfaError, setMfaError] = useState("");
  const [mfaOpen, setMfaOpen] = useState(false);

  const verify = async () => {
    if (verifying || mfaCode.length !== 6) return;
    setVerifying(true);
    setMfaError("");
    try {
      const problem = await session.submitMfaCode(mfaCode);
      setMfaCode("");
      if (problem) setMfaError(problem);
      else { setMfaOpen(false); setNotice("Authenticator confirmed. Click Authorise to save your selected rooms."); }
    } catch {
      setMfaCode("");
      setMfaError("Verification could not finish. Try again with a fresh code.");
    } finally { setVerifying(false); }
  };

  useEffect(() => {
    if (!session.accessToken || !session.signedIn || session.viewer) return;
    void read({ data: { accessToken: session.accessToken } }).then((r) => setLoaded(r.ok ? { grants: r.grants, history: r.history } : { error: r.message }), () => setLoaded({ error: "Viewing access could not be read." }));
  }, [session.accessToken, session.signedIn, session.viewer, read, refresh]);

  const toggleRoom = useCallback((route: string) => setRooms((cur) => (cur.includes(route) ? cur.filter((r) => r !== route) : [...cur, route])), []);
  const act = async (work: () => Promise<{ ok: boolean; message: string }>) => {
    if (busy) return;
    setBusy(true);
    try { const r = await work(); setNotice(r.message); if (r.ok) setRefresh((n) => n + 1); } catch { setNotice("That did not go through. Nothing was changed."); } finally { setBusy(false); }
  };
  const protectedPicked = protectedRoomsIn(rooms);
  const grants = loaded && "grants" in loaded ? loaded.grants : [];

  if (session.viewer) return null;
  return (
    <Card className="border-border bg-card" id="assistant-viewing-access">
      <CardHeader><CardTitle className="text-base">Assistant viewing access — view only</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Lets Claude, ChatGPT and Elsie each look at the Office and read what is saved, even when your browser is closed. They can never change, spend, delete, build or change access. You can switch any one off at any time without affecting the others. Passwords and authenticator codes are never shared.</p>
        {notice && <p role="status" aria-live="polite" className="rounded-lg border border-border p-3 text-sm">{notice}</p>}
        {loaded && "error" in loaded && <p role="alert" className="rounded-lg border border-destructive p-3 text-sm">{loaded.error}</p>}
        <ul className="space-y-2">
          {VIEW_ASSISTANTS.map((a) => {
            const row = grants.find((g) => g.assistant === a);
            const d = describeGrant(row);
            const known = !!loaded && "grants" in loaded;
            return (
              <li key={a} className="space-y-1 rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{NAMES[a]} — {known ? (d.state === "on" ? "ON" : "OFF") : "UNAVAILABLE"}</span>
                  <Switch aria-label={`${NAMES[a]} viewing access`} checked={known && d.state === "on"}
                    disabled={busy || !known || !row?.viewer_user_id || (d.state !== "on" && !session.stepUpComplete)}
                    onCheckedChange={(on) => {
                      if (!on) void act(() => revoke({ data: { accessToken: session.accessToken ?? "", assistant: a } }));
                      else if (row?.viewer_user_id) void act(() => save({ data: { accessToken: session.accessToken ?? "", input: { assistant: a, viewerUserId: row.viewer_user_id, rooms: row.rooms, scopes: row.scopes as ViewScope[], days: 30 } } }));
                    }} />
                </div>
                <p className="text-sm text-muted-foreground">{known ? d.label : "Access status could not be confirmed."}</p>
                {known && !row && <p className="text-sm text-muted-foreground">Authorise this assistant below to enable its switch.</p>}
                {row && d.state === "on" && (
                  <p className="text-sm text-muted-foreground">Rooms: {row.rooms.length} of {Object.keys(CAPTURE_ROOM_LABELS).length}. Allowed: {row.scopes.map((s) => SCOPE_WORDS[s as ViewScope] ?? s).join("; ")}. Views in the last day: {row.captures_last_day}. Last used: {row.last_used_at ? new Date(row.last_used_at).toLocaleString() : "never"}.</p>
                )}
              </li>
            );
          })}
        </ul>
        <form className="space-y-3 rounded-lg border border-border/50 p-3" onSubmit={(e) => { e.preventDefault(); if (!session.stepUpComplete) { setMfaError(""); setMfaOpen(true); return; } void act(() => save({ data: { accessToken: session.accessToken ?? "", input: { assistant, viewerUserId: viewerUserId.trim(), rooms, days, scopes } } })); }}>
          <h3 className="font-medium">Authorise or renew</h3>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">Assistant <select className="ml-1 rounded border bg-background p-1" value={assistant} onChange={(e) => setAssistant(e.target.value)}>{VIEW_ASSISTANTS.map((a) => <option key={a} value={a}>{NAMES[a]}</option>)}</select></label>
            <label className="text-sm">Days (1–90) <input type="number" min={1} max={90} className="ml-1 w-20 rounded border bg-background p-1" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          </div>
          <label className="block text-sm">Viewing account id (the separate, read-only account made for this assistant)
            <input className="mt-1 w-full rounded border bg-background p-2 text-sm" placeholder="00000000-0000-0000-0000-000000000000" value={viewerUserId} onChange={(e) => setViewerUserId(e.target.value)} /></label>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Allowed</legend>
            {VIEW_SCOPES.map((s) => <label key={s} className="mr-4 text-sm"><input type="checkbox" checked={scopes.includes(s)} onChange={() => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))} /> {SCOPE_WORDS[s]}</label>)}</fieldset>
          <fieldset className="space-y-1"><legend className="text-sm font-medium">Rooms</legend>
            <div className="mb-1 flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setRooms(Object.keys(CAPTURE_ROOM_LABELS))}>All rooms</Button><Button type="button" size="sm" variant="outline" onClick={() => setRooms([])}>None</Button></div>
            <div className="grid gap-1 sm:grid-cols-2">{Object.entries(CAPTURE_ROOM_LABELS).map(([route, label]) => <label key={route} className="text-sm"><input type="checkbox" checked={rooms.includes(route)} onChange={() => toggleRoom(route)} /> {label}</label>)}</div>
          </fieldset>
          {protectedPicked.length > 0 && <p className="text-sm">Includes protected rooms ({protectedPicked.map((r) => CAPTURE_ROOM_LABELS[r]).join(", ")}). That is why saving needs your authenticator code, once.</p>}
          <Button type="submit" disabled={busy || verifying}>Authorise (needs your authenticator)</Button>
          <Dialog open={mfaOpen} onOpenChange={(open) => { setMfaOpen(open); if (!open) { setMfaCode(""); setMfaError(""); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirm your authenticator</DialogTitle><DialogDescription>Enter your current six-digit code to authorise viewing access. Your room choices stay in place.</DialogDescription></DialogHeader>
            <label className="block text-sm" htmlFor="view-access-authenticator">Six-digit authenticator code</label>
            <Input id="view-access-authenticator" type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={mfaCode} disabled={verifying} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void verify(); } }} />
            <Button type="button" disabled={verifying || mfaCode.length !== 6} onClick={() => void verify()}>{verifying ? "Verifying…" : "Verify with authenticator"}</Button>
            <p className="text-sm text-muted-foreground">After verification, click Authorise to save your selected rooms. Switching an assistant off never needs a code.</p>
            {mfaError && <p role="alert" className="text-sm text-destructive">{mfaError}</p>}
          </DialogContent>
          </Dialog>
        </form>
        <details><summary className="cursor-pointer text-sm font-medium">Access history</summary>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {(loaded && "history" in loaded ? loaded.history : []).map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} — {h.action.replace("office_view.", "")} — {NAMES[h.assistant] ?? h.assistant}</li>)}
            {loaded && "history" in loaded && loaded.history.length === 0 && <li>No access events yet.</li>}
          </ul></details>
      </CardContent>
    </Card>
  );
}
