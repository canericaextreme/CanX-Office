import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ states: [] as unknown[], cleanup: null as null | (() => void), event: null as null | ((event: string) => void), token: "old", verify: vi.fn(), unsubscribe: vi.fn(), getSession: vi.fn() }));
vi.mock("react", () => ({
  createContext: () => ({Provider: "provider"}), useContext: vi.fn(),
  useRef: (current: unknown) => ({current}), useCallback: (fn: unknown) => fn, useMemo: (fn: () => unknown) => fn(),
  useState: (initial: unknown) => { const index = h.states.push(initial)-1; return [initial,(value: unknown) => {h.states[index]=value;}]; },
  useEffect: (fn: () => () => void) => {h.cleanup=fn();},
}));
vi.mock("./canx-supabase", () => ({loadCanxSupabase: async () => ({auth: {
  getSession: h.getSession,
  onAuthStateChange: (cb: (event: string) => void) => {h.event=cb; return {data:{subscription:{unsubscribe:h.unsubscribe}}};},
}})}));
vi.mock("./auth.functions", () => ({ verifyOwnerSession: h.verify }));
import { OwnerSessionProvider } from "./owner-session";
const flush = async () => {for(let i=0;i<20;i++) await Promise.resolve();};
beforeEach(() => {
  vi.useFakeTimers(); h.states=[]; h.token="old"; h.event=null; h.cleanup=null;
  h.verify.mockReset().mockResolvedValue({ok:true,email:"owner@test",aal:"aal2",message:"Verified"});
  h.getSession.mockReset().mockImplementation(async () => ({data:{session:{access_token:h.token}}}));
});
afterEach(() => {h.cleanup?.(); vi.useRealTimers();});
describe("owner token renewal", () => {
  it("updates the verified token after TOKEN_REFRESHED outside the auth callback", async () => {
    OwnerSessionProvider({children:null}); await flush();
    expect(h.states[4]).toBe("old");
    const before=h.getSession.mock.calls.length;
    h.token="renewed"; h.event?.("TOKEN_REFRESHED");
    expect(h.getSession.mock.calls.length).toBe(before);
    await vi.advanceTimersByTimeAsync(0); await flush();
    expect(h.verify).toHaveBeenLastCalledWith({data:{accessToken:"renewed"}});
    expect(h.states[4]).toBe("renewed");
  });
  it("ignores an earlier verification that completes after sign-out", async () => {
    let resolve!: (r: unknown) => void;
    h.verify.mockReturnValueOnce(new Promise(r=>{resolve=r;}));
    OwnerSessionProvider({children:null}); await flush();
    h.event?.("SIGNED_OUT");
    resolve({ok:true,email:"owner@test",aal:"aal2",message:"Verified"}); await flush();
    expect(h.states[4]).toBeNull(); expect(h.states[0]).toBe("signed_out");
  });
});
