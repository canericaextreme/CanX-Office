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
import { OwnerSessionProvider, STARTUP_TIMEOUTS } from "./owner-session";
const client = { auth: { getSession: h.getSession, onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}) } };
const flush = async () => {for(let i=0;i<30;i++) await Promise.resolve();};
const never = () => new Promise<never>(() => {});
const OK = {ok:true,email:"o@t",userId:"u",aal:"aal1",message:"Verified"};
// state indices: 0 state, 1 configured, 2 email, 3 message, 4 token
let api: { refresh: () => Promise<void> };
const start = () => { const el = OwnerSessionProvider({children:null}) as unknown as {props:{value:typeof api}}; api = el.props.value; };
beforeEach(() => {
  vi.useFakeTimers(); h.states=[]; h.cleanup=null;
  h.load.mockReset().mockResolvedValue(client);
  h.getSession.mockReset().mockResolvedValue({data:{session:{access_token:"tok"}}});
  h.verify.mockReset().mockResolvedValue(OK);
});
afterEach(() => {h.cleanup?.(); vi.useRealTimers();});

describe("bounded office startup", () => {
  it("enters normally when every step answers", async () => {
    start(); await flush();
    expect(h.states[0]).toBe("owner"); expect(h.states[4]).toBe("tok");
  });
  it("hung config ends in an honest error, not endless opening", async () => {
    h.load.mockImplementation(never);
    start(); await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUTS.config * 2 + 10); await flush();
    expect(h.states[0]).toBe("error"); expect(h.states[1]).toBe(false);
  });
  it("rejected config ends in error", async () => {
    h.load.mockRejectedValue(new Error("boom"));
    start(); await flush();
    expect(h.states[0]).toBe("error");
  });
  it("hung getSession ends in error without signing out", async () => {
    h.getSession.mockImplementation(never);
    start(); await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUTS.session + 10); await flush();
    expect(h.states[0]).toBe("error"); expect(h.verify).not.toHaveBeenCalled();
  });
  it("rejected getSession ends in error", async () => {
    h.getSession.mockRejectedValue(new Error("lock"));
    start(); await flush();
    expect(h.states[0]).toBe("error");
  });
  it("hung or rejected verify ends in error and never grants owner", async () => {
    h.verify.mockImplementation(never);
    start(); await vi.advanceTimersByTimeAsync(STARTUP_TIMEOUTS.verify + 10); await flush();
    expect(h.states[0]).toBe("error"); expect(h.states[4]).toBeNull();
  });
  it("Retry succeeds after a failure", async () => {
    h.getSession.mockRejectedValueOnce(new Error("lock"));
    start(); await flush();
    expect(h.states[0]).toBe("error");
    await api.refresh(); await flush();
    expect(h.states[0]).toBe("owner");
  });
  it("a stale slow verification cannot replace a newer result", async () => {
    let resolveOld!: (r: unknown) => void;
    h.verify.mockReturnValueOnce(new Promise(r => {resolveOld = r;}));
    start(); await flush();
    h.verify.mockResolvedValueOnce({ok:false,reason:"no_session",message:"Signed out"});
    await api.refresh(); await flush();
    expect(h.states[0]).toBe("signed_out");
    resolveOld(OK); await flush();
    expect(h.states[0]).toBe("signed_out");
  });
});
