import{describe,it,expect}from"vitest";
import{elsieReconnectBrief}from"./elsie-reconnect-brief";
describe("Elsie reconnect recovery",()=>{
 it("returns recent turns and unfinished tasks with truthful status",()=>{
  const s=elsieReconnectBrief([{role:"assistant",content:"Working on analytics",created_at:"2026-10-17T00:02Z"},{role:"user",content:"Please remember charts",created_at:"2026-10-17T00:01Z"}],
  [{id:"1",title:"Analytics dashboard",detail:"Finish live measures",status:"in_progress",worker:"codex",updated_at:"2026-10-17T00:03Z"}],"2026-10-17T00:04Z");
  expect(s.indexOf("Please remember charts")).toBeLessThan(s.indexOf("Working on analytics"));
  expect(s).toContain("Analytics dashboard");expect(s).toContain("not a live builder run");
 });
 it("never invents missing history",()=>{const s=elsieReconnectBrief([],[],"2026-10-17T00:04Z");expect(s).toContain("No recent saved conversation");expect(s).toContain("No readable unfinished tasks");});
 it("excludes done tasks",()=>{const s=elsieReconnectBrief([], [{id:"2",title:"Finished",detail:"",worker:"claude",status:"done",updated_at:"2026-10-17"}],"2026-10-17");expect(s).not.toContain("Finished");});
});
