import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_ATTEMPTS, claimWithRetry } from "./run-capture.mjs";
const busy = { status: 503, json: { code: "viewer_busy" } };
const ok = { status: 200, json: { claimed: { accessToken: "t" } } };
const noSleep = async () => undefined;
test("a busy viewer is asked again until the claim succeeds", async () => {
  const replies = [busy, busy, ok]; let calls = 0;
  assert.equal(await claimWithRetry(async () => replies[calls++], noSleep), ok);
  assert.equal(calls, 3);
});
test("other refusals are not retried", async () => {
  let calls = 0; const refused = { status: 403, json: { code: "request_expired" } };
  assert.equal(await claimWithRetry(async () => { calls++; return refused; }, noSleep), refused);
  assert.equal(calls, 1);
});
test("retries stop after the attempt limit", async () => {
  let calls = 0;
  assert.equal(await claimWithRetry(async () => { calls++; return busy; }, noSleep), busy);
  assert.equal(calls, CLAIM_ATTEMPTS);
});
