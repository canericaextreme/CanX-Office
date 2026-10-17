import{describe,it,expect}from"vitest";import{readFileSync}from"node:fs";
const s=readFileSync(".github/workflows/elsie-merge-event-wake.yml","utf8");
describe("Safe GitHub merged PR handoff",()=>{
it("fires only after PR closes and is actually merged",()=>{expect(s).toContain("types: [closed]");expect(s).toContain("pull_request.merged == true");});
it("remains disabled until explicitly activated",()=>expect(s).toContain('if [ "$ENABLED" != "true" ]'));
it("does not retry uncertain charged work",()=>expect(s).toContain("--retry 0"));
it("requires narrowly named Supabase endpoint and project",()=>{expect(s).toContain("elsie-extended-worker");expect(s).toContain('canericaextreme/CanX-Office');});
it("sends merge event, not direct builder order",()=>{expect(s).toContain('"mode":"merge"');expect(s).not.toContain('"mode":"build"');});
});