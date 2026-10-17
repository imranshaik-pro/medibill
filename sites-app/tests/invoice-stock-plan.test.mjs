import assert from "node:assert/strict";
import test from "node:test";
import { planInvoiceStockTransition } from "../lib/invoice-stock-plan.ts";

const products = [
  { id: "p1", name: "Medicine A", batch: "B-1", stock: 5 },
  { id: "p2", name: "Medicine B", batch: "B-2", stock: 10 },
];

test("reverses the old invoice then applies edited billed and free units", () => {
  const plan = planInvoiceStockTransition(
    products,
    [{ productId: "p1", quantity: 2, freeQuantity: 1 }],
    [{ productId: "p1", quantity: 4, freeQuantity: 1 }],
  );
  assert.equal(plan.restored.get("p1"), 8);
  assert.equal(plan.requested.get("p1"), 5);
  assert.equal(plan.nextStock.get("p1"), 3);
  assert.equal(plan.nextStock.get("p2"), 10);
});

test("aggregates duplicate product rows before checking stock", () => {
  const plan = planInvoiceStockTransition(
    products,
    [],
    [
      { productId: "p1", quantity: 2, freeQuantity: 0 },
      { productId: "p1", quantity: 3, freeQuantity: 0 },
    ],
  );
  assert.equal(plan.requested.get("p1"), 5);
  assert.equal(plan.nextStock.get("p1"), 0);
});

test("rejects edits whose total requested stock exceeds restored availability", () => {
  assert.throws(() => planInvoiceStockTransition(
    [{ id: "p1", name: "Medicine A", batch: "B-1", stock: 2 }],
    [{ productId: "p1", quantity: 2, freeQuantity: 0 }],
    [{ productId: "p1", quantity: 5, freeQuantity: 0 }],
  ), /only 4 available/);
});

test("rejects missing product batches and invalid unit quantities", () => {
  assert.throws(() => planInvoiceStockTransition(
    products, [], [{ productId: "missing", quantity: 1, freeQuantity: 0 }],
  ), /Selected batch no longer exists/);
  assert.throws(() => planInvoiceStockTransition(
    products, [], [{ productId: "p1", quantity: 1.5, freeQuantity: 0 }],
  ), /whole billed units/);
  assert.throws(() => planInvoiceStockTransition(
    products, [], [{ productId: "p1", quantity: 1, freeQuantity: -1 }],
  ), /whole billed units/);
});
