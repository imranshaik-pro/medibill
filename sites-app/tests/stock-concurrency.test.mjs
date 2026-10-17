import assert from "node:assert/strict";
import test from "node:test";
import { assertValidBalanceDelta, assertValidStockDelta } from "../lib/stock-delta-validation.ts";

test("stock delta validation rejects fractional and non-finite quantities", () => {
  assert.throws(() => assertValidStockDelta(1.5), /whole units/);
  assert.throws(() => assertValidStockDelta(Number.NaN), /whole units/);
  assert.throws(() => assertValidStockDelta(Number.POSITIVE_INFINITY), /whole units/);
});

test("stock delta validation accepts whole-unit deltas", () => {
  assert.doesNotThrow(() => assertValidStockDelta(-3));
  assert.doesNotThrow(() => assertValidStockDelta(0));
  assert.doesNotThrow(() => assertValidStockDelta(4));
});

test("customer balance validation rejects non-finite deltas", () => {
  assert.throws(() => assertValidBalanceDelta(Number.NaN), /Invalid balance amount/);
  assert.throws(() => assertValidBalanceDelta(Number.POSITIVE_INFINITY), /Invalid balance amount/);
  assert.throws(() => assertValidBalanceDelta(Number.NEGATIVE_INFINITY), /Invalid balance amount/);
});

test("customer balance validation accepts finite invoice and reversal deltas", () => {
  assert.doesNotThrow(() => assertValidBalanceDelta(125.5));
  assert.doesNotThrow(() => assertValidBalanceDelta(-125.5));
  assert.doesNotThrow(() => assertValidBalanceDelta(0));
});
