import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const workflow=readFileSync(".github/workflows/elsie-scheduled-poll.yml","utf8");
describe("Scheduled runner deployment safeguards",()=>{
 it("has an explicit disabled-by-default gate",()=>expect(workflow).toContain('if [ "$ENABLED" != "true" ]'));
 it("rejects missing worker token",()=>expect(workflow).toContain('-z "$WORKER_TOKEN"'));
 it("requires narrow Supabase route",()=>expect(workflow).toContain('supabase.co/functions/v1/elsie-extended-worker'));
 it("does not retry uncertain charged calls",()=>expect(workflow).toContain("--retry 0"));
 it("prevents overlapping GitHub ticks",()=>expect(workflow).toContain("cancel-in-progress: false"));
});
