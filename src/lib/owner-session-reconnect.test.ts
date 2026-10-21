import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ states: [] as unknown[], cleanup: null as null | (() => void), load: vi.fn(), verify: vi.fn(), getSession: vi.fn() }));
vi.mock("react", () => ({
  createContext: () => ({Provider: "provider"}), useContext: vi.fn(),
  useRef: (current: unknown) => ({current}), useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => { const i = h.states.push(initial)-1; return [initial,(v: unknown) => {h.states[i]=v;}]; },
  useEffect: (fn: () => () => void) => {h.cleanup=fn();},
}));
vi.mock("./canx-supabase", () => ({loadCanxSupabase: h.load}));
vi.mock("./auth.functions", () => ({ verifyOwnerSession: h.verify }));
import { OwnerSessionProvider, RECONNECT_DELAYS, STARTUP_TIMEOUTS } from "./owner-session";
const client = { auth: { getSession: h.getSession, onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}) } };
const flush = async () => {for(let i=0;i<30;i++) await Promise.resolve();};
const never = () => new Promise<never>(() => {});
const OK = {ok:true,email:"o@t",userId:"u",aal:"aal2",message:"Verified"};
// state indices: 0 state, 4 token, 8 savedSession
const store = new Map<string, string>();
const start = () => { OwnerSessionProvider({children:null}); };
beforeEach(() => {
  vi.useFakeTimers(); h.states=[]; h.cleanup=null; store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null }, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener() {}, removeEventListener() {} });
  h.load.mockReset().mockResolvedValue(client);
  h.getSession.mockReset().mockResolvedValue({data:{session:{access_token:"tok"}}});
  h.verify.mockReset().mockResolvedValue(OK);
});
afterEach(() => {h.cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals();});

describe("saved sign-in survives a slow check", () => {
  it("a timed-out check with a saved sign-in reconnects by itself instead of asking for the password", async () => {
    store.set("canx-office-auth", "{}");
    h.verify.mockImplementationOnce(never);
    start(); await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUTS.verify + 10); await flush();
    expect(h.states[0]).toBe("error"); expect(h.states[8]).toBe(true);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS[0] + 10); await flush();
    expect(h.states[0]).toBe("owner"); expect(h.states[4]).toBe("tok");
  });
  it("a server hiccup (backend_error) with a saved sign-in also retries", async () => {
    store.set("canx-office-auth", "{}");
    h.verify.mockResolvedValueOnce({ok:false,reason:"backend_error",message:"down"});
    start(); await flush();
    expect(h.states[0]).toBe("error"); expect(h.states[8]).toBe(true);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS[0] + 10); await flush();
    expect(h.states[0]).toBe("owner");
  });
  it("without a saved sign-in nothing retries and the sign-in form stays the answer", async () => {
    h.getSession.mockRejectedValue(new Error("lock"));
    start(); await flush();
    expect(h.states[0]).toBe("error"); expect(h.states[8]).toBe(false);
    await vi.advanceTimersByTimeAsync(RECONNECT_DELAYS[3] * 3); await flush();
    expect(h.getSession).toHaveBeenCalledTimes(1);
  });
  it("a genuinely ended sign-in is still signed out, never retried into owner", async () => {
    h.getSession.mockResolvedValue({data:{session:null}});
    h.verify.mockResolvedValue({ok:false,reason:"no_session",message:"Signed out"});
    start(); await flush();
    expect(h.states[0]).toBe("signed_out"); expect(h.states[8]).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000); await flush();
    expect(h.verify).toHaveBeenCalledTimes(1);
  });
});
