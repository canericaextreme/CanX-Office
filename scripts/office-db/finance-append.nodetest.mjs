// Run: node --test scripts/office-db/finance-append.nodetest.mjs
// Starts a throwaway local Postgres, applies the append-only Finance migration and runs
// finance-append.test.sql against it. GitHub's ubuntu runners ship Postgres; elsewhere the
// test is skipped when no Postgres is installed (it never touches the live database).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const MIGRATION = resolve("supabase/migrations/20261021150000_finance_receipts_append_only.sql");
const SCRIPT = resolve("scripts/office-db/finance-append.test.sql");
const root = "/usr/lib/postgresql";
const version = existsSync(root) ? readdirSync(root).filter((v) => existsSync(join(root, v, "bin", "initdb"))).sort().pop() : undefined;
const bin = version ? join(root, version, "bin") : null;
// initdb refuses to run as root; local root shells run it as the postgres user instead.
const asUser = process.getuid?.() === 0 ? ["runuser", "-u", "postgres", "--"] : [];
const run = (cmd, args, opts = {}) => {
  const [c, ...a] = [...asUser, cmd, ...args];
  return execFileSync(c, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
};

test("append-only Finance save keeps every saved receipt and passes the size cases", { skip: !bin && !process.env.CI ? "no local Postgres" : false }, (t) => {
  assert.ok(bin, "Postgres binaries are required in CI");
  const dir = mkdtempSync(join(tmpdir(), "canx-finance-"));
  chmodSync(dir, 0o777);
  const data = join(dir, "data");
  const port = String(55000 + Math.floor(Math.random() * 5000));
  try {
    run(join(bin, "initdb"), ["-D", data, "-A", "trust", "-U", "postgres", "--no-sync"]);
    run(join(bin, "pg_ctl"), ["-D", data, "-l", join(dir, "server.log"), "-o", `-p ${port} -k ${dir} -c listen_addresses=''`, "-w", "start"]);
    const out = spawnSync("psql", ["-h", dir, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", `migration=${MIGRATION}`, "-f", SCRIPT], { encoding: "utf8" });
    assert.equal(out.status, 0, `${out.stdout}\n${out.stderr}`);
    assert.match(out.stdout, /ALL FINANCE APPEND TESTS PASSED/);
    for (const m of out.stderr.matchAll(/NOTICE:\s+(ok - .*)/g)) t.diagnostic(m[1]);
  } finally {
    try { run(join(bin, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"]); } catch { /* already stopped */ }
    rmSync(dir, { recursive: true, force: true });
  }
});
