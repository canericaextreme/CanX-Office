// Builds single-file copies of the two Supabase functions (office-view, office-mcp) so they can be pasted into the
// Supabase dashboard's function editor or deployed without the repository around them. Run from a folder with esbuild
// installed:  node scripts/office-view/bundle-functions.mjs <outputFolder>
// Then smoke-tests each bundle with a stand-in Deno (no network, no secrets).
import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const out = path.resolve(process.argv[2] ?? "dist-functions");
await mkdir(out, { recursive: true });
const functions = ["office-view", "office-mcp"];
for (const name of functions) {
  await build({
    entryPoints: [`supabase/functions/${name}/index.ts`], outfile: path.join(out, `${name}.js`), bundle: true, format: "esm",
    platform: "neutral", target: "es2022", loader: { ".json": "json" }, legalComments: "none", logLevel: "warning",
    banner: { js: `// ${name}: generated from supabase/functions/${name}/index.ts + src/lib. Do not edit by hand.` },
  });
}

// Smoke test: load each bundle with a stand-in Deno, capture the handler, ask it for something it must refuse.
for (const name of functions) {
  let handler;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", SUPABASE_ANON_KEY: "anon", CANX_VIEW_SERVICE_URL: "https://abcdefghijklmnopqrst.supabase.co/functions/v1/office-view" })[k] }, serve: (h) => { handler = h; } };
  await import(`${path.join(out, `${name}.js`)}?${Date.now()}`);
  assert.equal(typeof handler, "function", `${name} registers a handler`);
  const base = "https://abcdefghijklmnopqrst.supabase.co/functions/v1";
  if (name === "office-view") {
    const noToken = await handler(new Request(`${base}/office-view/request`, { method: "POST", body: "{}" }));
    assert.equal(noToken.status, 401, "no token is refused");
    const get = await handler(new Request(`${base}/office-view/request`));
    assert.equal(get.status, 405, "GET is refused");
  } else {
    const list = await handler(new Request(`${base}/office-mcp`, { method: "POST", headers: { Authorization: "Bearer x.y.z", "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
    assert.equal(list.status, 401, "an unverified token is refused by the connector");
  }
  console.log(`${name}: bundled (${(await readFile(path.join(out, `${name}.js`))).length} bytes), loads, refuses unauthenticated calls`);
}
