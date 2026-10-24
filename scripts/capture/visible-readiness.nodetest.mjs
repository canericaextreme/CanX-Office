import { test } from "node:test";
import assert from "node:assert/strict";
import { visiblePageProblem } from "./run-capture.mjs";
test("hidden stale room errors do not block current visible screenshot", () => {
  assert.equal(visiblePageProblem({text:"Earlier room could not be read",visibleText:"Brain room ready"}),null);
});
test("a visible room error still prevents capture", () => {
  assert.match(visiblePageProblem({text:"Room could not be read",visibleText:"Room could not be read"}), /could not be read/);
});
test("initial loading indicator remains blocking", () => {
  assert.match(visiblePageProblem({text:"Opening CanX Office",visibleText:"Opening CanX Office"}), /Opening CanX Office/);
});
