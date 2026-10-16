import assert from "node:assert/strict";
import test from "node:test";
import { balanceDelta, stockDelta } from "../lib/stock-concurrency.ts";

test("stock updates reject fractional quantities before creating a database expression", () => {
  assert.throws(() => stockDelta({}, 1.5), /whole units/);
  assert.throws(() => stockDelta({}, Number.NaN), /whole units/);
  assert.throws(() => stockDelta({}, Number.POSITIVE_INFINITY), /whole units/);
});

test("stock updates allow whole-unit deltas to be expressed atomically", () => {
  assert.ok(stockDelta({}, -3));
  assert.ok(stockDelta({}, 0));
  assert.ok(stockDelta({}, 4));
});

test("customer balance updates reject non-finite deltas", () => {
  assert.throws(() => balanceDelta({}, Number.NaN), /Invalid balance amount/);
  assert.throws(() => balanceDelta({}, Number.POSITIVE_INFINITY), /Invalid balance amount/);
  assert.throws(() => balanceDelta({}, Number.NEGATIVE_INFINITY), /Invalid balance amount/);
});

test("customer balance updates accept finite invoice and reversal deltas", () => {
  assert.ok(balanceDelta({}, 125.5));
  assert.ok(balanceDelta({}, -125.5));
  assert.ok(balanceDelta({}, 0));
});
