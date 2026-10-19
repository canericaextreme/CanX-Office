// CanX Office database changes: apply approved migration files after they merge to main.
// Approved by John, 18 Oct 2026. Same idea as office-functions-deploy.yml: merging is the approval,
// nobody pastes SQL into the Supabase dashboard, and nothing depends on a chat approval box.
//
// Rules (plain words):
// - Only files in supabase/migrations named <14-digit version>_<name>.sql are considered.
// - A file is applied automatically only if its version is NEWER than the newest change already
//   recorded in the live database. Older files are never re-run automatically (the history before
//   this job was applied by hand under different dates, so old files are already live or held).
// - A file can also be named explicitly in a manual run (for a deliberate one-off).
// - Never applied: files on hold (first line starts "-- Draft only", or any line "-- canx:hold"),
//   and files whose version OR name is already recorded.
// - Each file runs in one transaction together with its history record, so it either fully applies
//   or not at all. The run stops at the first failure.
//
// Usage: node scripts/office-db/migrations.mjs [--dry-run] [file.sql ...]
// Needs SUPABASE_ACCESS_TOKEN and PROJECT_REF (except --dry-run without a token prints the plan only).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export const FILE_RE = /^(\d{14})_([a-z0-9_]+)\.sql$/;

export function parseFileName(file) {
  const m = FILE_RE.exec(file);
  return m ? { file, version: m[1], name: m[2] } : null;
}

export function isOnHold(sql) {
  const first = sql.split("\n").find((l) => l.trim() !== "") ?? "";
  if (/^--\s*draft only/i.test(first.trim())) return true;
  return sql.split("\n").some((l) => /^--\s*canx:hold\b/i.test(l.trim()));
}

/**
 * Decide what to apply.
 * files: [{file, version, name, sql}], recorded: [{version, name}], requested: [file names]
 * Returns { apply: [...], skipped: [{file, reason}], notApplied: [file] }
 */
export function plan(files, recorded, requested = []) {
  const recVersions = new Set(recorded.map((r) => String(r.version)));
  const recNames = new Set(recorded.map((r) => String(r.name ?? "")).filter(Boolean));
  const newest = recorded.map((r) => String(r.version)).sort().at(-1) ?? "";
  const byFile = new Map(files.map((f) => [f.file, f]));
  const errors = [];
  for (const r of requested) {
    if (!FILE_RE.test(r)) errors.push(`${r} is not a valid migration file name`);
    else if (!byFile.has(r)) errors.push(`${r} is not in supabase/migrations`);
  }
  if (errors.length) return { errors, apply: [], skipped: [], notApplied: [] };

  const apply = [];
  const skipped = [];
  const notApplied = [];
  for (const f of [...files].sort((a, b) => a.version.localeCompare(b.version) || a.file.localeCompare(b.file))) {
    const wanted = requested.includes(f.file) || f.version > newest;
    const already = recVersions.has(f.version) || recNames.has(f.name);
    if (!wanted) {
      if (!already && !isOnHold(f.sql)) notApplied.push(f.file);
      continue;
    }
    if (already) skipped.push({ file: f.file, reason: "already recorded in the live database" });
    else if (isOnHold(f.sql)) skipped.push({ file: f.file, reason: "on hold (Draft only / canx:hold)" });
    else apply.push(f);
  }
  return { errors: [], apply, skipped, notApplied };
}

/** One transaction: the migration plus its history record. */
export function buildApplySql(f) {
  let tag;
  do tag = `$canx_${randomBytes(6).toString("hex")}$`;
  while (f.sql.includes(tag));
  return [
    "begin;",
    f.sql,
    ";",
    "insert into supabase_migrations.schema_migrations (version, name, statements, created_by)",
    `values ('${f.version}', '${f.name}', array[${tag}${f.sql}${tag}], 'office-migrations-apply');`,
    "commit;",
  ].join("\n");
}

export function readMigrationFiles(dir) {
  return readdirSync(dir)
    .map(parseFileName)
    .filter(Boolean)
    .map((f) => ({ ...f, sql: readFileSync(join(dir, f.file), "utf8") }));
}

async function query(sql) {
  const ref = process.env.PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase refused the query (HTTP ${res.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const requested = args.filter((a) => a !== "--dry-run");
  const out = (s) => console.log(s);
  if (!process.env.SUPABASE_ACCESS_TOKEN || !process.env.PROJECT_REF) {
    console.error("::error::The SUPABASE_DB_TOKEN secret (or PROJECT_REF) is not set, so nothing was applied. Add a Supabase token with database read and write permission as SUPABASE_DB_TOKEN, then re-run.");
    process.exit(1);
  }
  const files = readMigrationFiles("supabase/migrations");
  const recorded = await query("select version, name from supabase_migrations.schema_migrations order by version");
  const p = plan(files, recorded, requested);
  if (p.errors.length) {
    for (const e of p.errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  for (const s of p.skipped) out(`::notice title=Skipped ${s.file}::${s.reason}`);
  for (const n of p.notApplied) out(`::warning title=Not applied ${n}::older than the newest live change; apply on purpose with a manual run if it is meant to go live`);
  out(`Plan: ${p.apply.length ? p.apply.map((f) => f.file).join(", ") : "nothing to apply"}${dryRun ? " (dry run)" : ""}`);
  if (dryRun) return;
  for (const f of p.apply) {
    await query(buildApplySql(f));
    const check = await query(`select version from supabase_migrations.schema_migrations where version = '${f.version}'`);
    if (!Array.isArray(check) || check.length !== 1) throw new Error(`${f.file} ran but its history record is missing`);
    out(`::notice title=Applied ${f.file}::recorded as version ${f.version}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
