import { beforeEach,describe,it,expect,vi } from "vitest";
const h=vi.hoisted(()=>({request:vi.fn(),remember:vi.fn(),open:vi.fn(),verified:true,accessToken:"owner-token" as string | undefined,states:[] as unknown[]}));
vi.mock("react",()=>({useRef:(current:unknown)=>({current}),useState:(initial:unknown)=>{const index=h.states.push(initial)-1;return [initial,(value:unknown)=>{h.states[index]=value;}];}}));
vi.mock("@tanstack/react-start",()=>({useServerFn:()=>h.request}));
vi.mock("@/lib/owner-session",()=>({useOwnerSession:()=>({stepUpComplete:h.verified,accessToken:h.accessToken})}));
vi.mock("@/lib/claude-review.functions",()=>({ESTIMATED_CENTS_BY_SCOPE:{office:15},requestClaudeReview:{}}));
vi.mock("@/lib/second-eyes",()=>({rememberReview:h.remember,openSecondEyes:h.open}));
vi.mock("@/components/ui/button",()=>({Button:"button"}));
vi.mock("@/components/ui/textarea",()=>({Textarea:"textarea"}));
vi.mock("@/components/ui/card",()=>({Card:"section",CardContent:"div",CardHeader:"header",CardTitle:"h2"}));
import { ClaudeSpendApproval } from "./ClaudeSpendApproval";
function find(node:any,type:string):any {if(!node)return null;if(Array.isArray(node))return node.map(n=>find(n,type)).find(Boolean);return node.type===type?node:find(node.props?.children,type);}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
beforeEach(()=>{h.request.mockReset();h.remember.mockReset();h.open.mockReset();h.states=[];h.verified=true;h.accessToken="owner-token";vi.stubGlobal("window",{dispatchEvent:vi.fn()});});
describe("one owner-approved Claude review",()=>{
 it("does not call Claude on render; a double click sends only one office review",async()=>{
  let resolve!:(result:unknown)=>void;h.request.mockReturnValue(new Promise(r=>{resolve=r;}));
  const tree=ClaudeSpendApproval();expect(h.request).not.toHaveBeenCalled();
  const button=find(tree,"button");button.props.onClick();button.props.onClick();
  expect(h.request).toHaveBeenCalledOnce();expect(h.request.mock.calls[0]![0].data).toMatchObject({scope:"office",accessToken:h.accessToken});
  resolve({ok:true,structuredComplete:true});await flush();expect(h.remember).toHaveBeenCalledOnce();expect(h.open).toHaveBeenCalledOnce();
 });
 it("does not spend without authenticator verification",()=>{
  h.verified=false;const button=find(ClaudeSpendApproval(),"button");expect(button.props.disabled).toBe(true);button.props.onClick();expect(h.request).not.toHaveBeenCalled();
 });
 it.each(["", undefined])("shows session feedback without spending when the verified owner's token is %s",(token)=>{
  h.accessToken=token;
  const button=find(ClaudeSpendApproval(),"button");
  expect(button.props.disabled).toBe(false);
  button.props.onClick();
  expect(h.states).toContain("Your session isn't ready yet. Try refreshing the page, then approve the review again.");
  expect(h.request).not.toHaveBeenCalled();
  expect(h.remember).not.toHaveBeenCalled();
  expect(h.open).not.toHaveBeenCalled();
 });
 it("never treats a failure as a completed review or retries it",async()=>{
  h.request.mockResolvedValue({ok:false,code:"limit_blocked",detail:"Budget blocked"});find(ClaudeSpendApproval(),"button").props.onClick();await flush();
  expect(h.request).toHaveBeenCalledOnce();expect(h.remember).not.toHaveBeenCalled();expect(h.states).toContain("Budget blocked");
 });
});
