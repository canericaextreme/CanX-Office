import {describe,expect,it} from "vitest";
import {transitionElsieSession,type ElsieSessionRecord} from "./elsie-extended-session";
const s:ElsieSessionRecord={id:"s",ownerId:"owner",state:"active",version:4,startedAt:"2026-10-16T10:00:00Z",expiresAt:"2026-10-16T20:00:00Z",updatedAt:"2026-10-16T10:00:00Z"};
const at="2026-10-16T11:00:00Z";
describe("Ten-hour owner session lifecycle",()=>{
 it("makes owner stop terminal",()=>{const x=transitionElsieSession(s,{kind:"owner_stop",now:at});expect(x.ok).toBe(true);if(x.ok){expect(x.record.state).toBe("stopped");expect(transitionElsieSession(x.record,{kind:"resume",now:at}).ok).toBe(false);}});
 it("stops on spent budget",()=>{const x=transitionElsieSession(s,{kind:"budget_exhausted",now:at});expect(x.ok&&x.record.state).toBe("stopped");});
 it("stops on lost authorization",()=>{const x=transitionElsieSession(s,{kind:"authorization_revoked",now:at});expect(x.ok&&x.record.state).toBe("stopped");});
 it("expires without releasing another task",()=>{const x=transitionElsieSession(s,{kind:"tick",now:s.expiresAt});expect(x.ok&&x.record.state).toBe("expired");});
 it("can pause then resume before expiry",()=>{const p=transitionElsieSession(s,{kind:"pause",now:at});expect(p.ok).toBe(true);if(p.ok){expect(transitionElsieSession(p.record,{kind:"tick",now:at}).ok).toBe(false);const r=transitionElsieSession(p.record,{kind:"resume",now:at});expect(r.ok&&r.record.state).toBe("active");}});
 it("blocks invalid >10 hour periods",()=>expect(transitionElsieSession({...s,expiresAt:"2026-10-16T20:01:00Z"},{kind:"tick",now:at}).ok).toBe(false));
 it("blocks missing owner",()=>expect(transitionElsieSession({...s,ownerId:""},{kind:"tick",now:at}).ok).toBe(false));
 it("does not accidentally activate draft on tick",()=>expect(transitionElsieSession({...s,state:"draft"},{kind:"tick",now:at}).ok).toBe(false));
});
