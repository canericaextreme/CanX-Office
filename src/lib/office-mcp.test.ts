import { describe, expect, it, vi } from "vitest";
import { handleOfficeMcp, type OfficeMcpDeps } from "./office-mcp";
import { readOfficeConnectionPlan } from "./office-connection-plan";

const resource = "https://office.example/functions/v1/office-mcp";
const deps = (authorize = async () => true): OfficeMcpDeps => ({ resource, issuer: "https://office.example/auth/v1", authorize, plan: readOfficeConnectionPlan });
const request = (body: unknown, headers = {}) => new Request(resource, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer token", ...headers }, body: JSON.stringify(body) });
const rpc = (method: string, params = {}) => ({ jsonrpc: "2.0", id: 1, method, params });
describe("Office MCP access boundary", () => {
  it("reads scoped metadata with the authenticated token and reports failed reads", async () => {
    const status = vi.fn(async () => ({projects:[{id:"project-id",name:"Saved project"}],tasks:[]}));
    const d = {...deps(),status};
    const call = rpc("tools/call",{name:"get_office_status",arguments:{}});
    const r = await handleOfficeMcp(request(call),d);
    expect(JSON.parse((await r.json()).result.content[0].text).projects[0].name).toBe("Saved project");
    expect(status).toHaveBeenCalledWith("token");
    status.mockRejectedValueOnce(Error("private failure"));
    const failed = await (await handleOfficeMcp(request(call),d)).json();
    expect(failed.result.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toContain("private failure");
    const blocked = await handleOfficeMcp(request(call),{...d,authorize:async()=>false});
    expect(blocked.status).toBe(401);
    expect(status).toHaveBeenCalledTimes(2);
  });
  it("publishes only OAuth discovery without owner access", async () => {
    const authorize = vi.fn(async () => false);
    const r = await handleOfficeMcp(new Request(`${resource}/.well-known/oauth-protected-resource`), deps(authorize));
    expect(r.status).toBe(200);
    expect((await r.json()).resource).toBe(resource);
    expect(authorize).not.toHaveBeenCalled();
  });
  it("denies every protocol operation when authorization is absent, revoked or unavailable", async () => {
    for (const method of ["initialize", "tools/list", "tools/call", "ping"]) {
      const r = await handleOfficeMcp(request(rpc(method)), deps(async () => false));
      expect(r.status).toBe(401);
      expect(r.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
      expect(JSON.stringify(await r.json())).not.toContain("steps");
    }
    expect((await handleOfficeMcp(request(rpc("tools/list")), deps(async () => { throw Error("backend down"); }))).status).toBe(401);
    expect((await handleOfficeMcp(new Request(resource), deps())).status).toBe(401);
  });
  it("denies cross-origin browser requests and arbitrary tool/token arguments", async () => {
    expect((await handleOfficeMcp(request(rpc("tools/list"), { Origin: "https://evil.example" }), deps())).status).toBe(403);
    const r = await handleOfficeMcp(request(rpc("tools/call", { name: "get_office_connection_plan", arguments: { access_token: "anything" } })), deps());
    expect((await r.json()).error.code).toBe(-32602);
  });
  it("negotiates protocol and exposes only the shared read-only plan", async () => {
    const init = await handleOfficeMcp(request(rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } })), deps());
    expect((await init.json()).result.capabilities).toEqual({ tools: {} });
    const list = await handleOfficeMcp(request(rpc("tools/list")), deps());
    expect((await list.json()).result.tools.map((t: { name: string }) => t.name)).toEqual(["get_office_connection_plan"]);
    const call = await handleOfficeMcp(request(rpc("tools/call", { name: "get_office_connection_plan", arguments: {} })), deps());
    expect(JSON.parse((await call.json()).result.content[0].text)).toEqual(readOfficeConnectionPlan());
  });
  it("rejects unsupported versions, batches, oversized requests and unknown tools", async () => {
    expect((await handleOfficeMcp(request(rpc("ping"), { "MCP-Protocol-Version": "bad" }), deps())).status).toBe(400);
    expect((await (await handleOfficeMcp(request([rpc("ping")]), deps())).json()).error.code).toBe(-32600);
    expect((await handleOfficeMcp(request("x".repeat(17000)), deps())).status).toBe(413);
    expect((await (await handleOfficeMcp(request(rpc("tools/call", { name: "run_sql" })), deps())).json()).error.code).toBe(-32602);
  });
  it("returns defensive checklist copies; setup steps never imply connected assistants", () => {
    const plan = readOfficeConnectionPlan();
    plan.steps.length = 0;
    expect(readOfficeConnectionPlan().steps.length).toBeGreaterThan(0);
    for (const id of ["chatgpt", "claude", "elsie", "acceptance"]) expect(readOfficeConnectionPlan().steps.find(s => s.id === id)?.status).toBe("pending");
  });
});
