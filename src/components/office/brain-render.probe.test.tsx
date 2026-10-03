import { describe, it, vi } from "vitest";
vi.mock("@tanstack/react-start",()=>({useServerFn:()=>async()=>({ok:true,documents:[],data:[],message:""}),createServerFn:()=>{const c:any={inputValidator:()=>c,validator:()=>c,middleware:()=>c,handler:()=>()=>{}};return c;}}));
vi.mock("@/lib/owner-session",()=>({useOwnerSession:()=>({stepUpComplete:true,accessToken:"t",shared:true,state:"owner"})}));
vi.mock("@tanstack/react-router",async(o)=>({...(await o() as any),Link:(p:any)=>p.children,useRouter:()=>({}),useRouterState:()=>({location:{pathname:"/brain"}}),useNavigate:()=>()=>{},useLocation:()=>({pathname:"/brain"})}));
import { renderToString } from "react-dom/server";
describe("probe",()=>{
 for (const name of ["BrainDocuments","BrainMemory","BrainMap"]) it(name,async()=>{
  const store:Record<string,string>={"canx-office-activity":JSON.stringify([{taskId:"a",title:"x",startedAt:new Date().toISOString(),lastHeartbeat:new Date().toISOString(),state:"running",cellId:"zzz"}])};
  vi.stubGlobal("window",{localStorage:{getItem:(k:string)=>store[k]??null,setItem(){}},addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),setInterval,clearInterval});
  const m:any=await import("./"+name);
  const React=await import("react");
  console.log(name, renderToString(React.createElement(m[name])).length);
 });
 it("brain route",async()=>{const m:any=await import("@/routes/_office/brain");const React=await import("react");console.log("route",renderToString(React.createElement(m.Route.options.component)).length);});
});
