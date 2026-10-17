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

test("rejects missing requested batches and invalid new quantities", () => {
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

test("rejects corrupted current stock before planning any edit", () => {
  for (const stock of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => planInvoiceStockTransition(
      [{ id: "p1", name: "Medicine A", batch: "B-1", stock }],
      [],
      [{ productId: "p1", quantity: 1 }],
    ), /invalid current stock/);
  }
});

test("rejects an old invoice line whose batch no longer exists", () => {
  assert.throws(() => planInvoiceStockTransition(
    products,
    [{ productId: "deleted-batch", quantity: 2, freeQuantity: 0 }],
    [{ productId: "p1", quantity: 1 }],
  ), /existing invoice batch no longer exists/);
});

test("rejects invalid historical quantities and unsafe restoration totals", () => {
  assert.throws(() => planInvoiceStockTransition(
    products,
    [{ productId: "p1", quantity: 1.25, freeQuantity: 0 }],
    [{ productId: "p1", quantity: 1 }],
  ), /invalid stock quantities/);
  assert.throws(() => planInvoiceStockTransition(
    [{ id: "p1", name: "Medicine A", batch: "B-1", stock: Number.MAX_SAFE_INTEGER }],
    [{ productId: "p1", quantity: 1, freeQuantity: 0 }],
    [{ productId: "p1", quantity: 1 }],
  ), /too large to restore safely/);
});

test("rejects duplicate inventory identifiers instead of overwriting a batch", () => {
  assert.throws(() => planInvoiceStockTransition(
    [
      { id: "p1", name: "Medicine A", batch: "B-1", stock: 5 },
      { id: "p1", name: "Medicine A", batch: "B-2", stock: 10 },
    ],
    [],
    [{ productId: "p1", quantity: 1 }],
  ), /duplicate batch identifier/);
});
