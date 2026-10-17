import assert from "node:assert/strict";
import test from "node:test";
import { deriveInvoiceBalanceDeltas } from "../lib/sales-ledger.ts";

test("editing a pending invoice adjusts only the amount difference", () => {
  assert.deepEqual(deriveInvoiceBalanceDeltas({
    oldCustomerId: "customer-a", newCustomerId: "customer-a",
    oldStatus: "Pending", oldAmount: 100, newStatus: "Pending", newAmount: 125,
  }), [{ customerId: "customer-a", delta: 25 }]);
});

test("marking an invoice paid removes its old outstanding amount", () => {
  assert.deepEqual(deriveInvoiceBalanceDeltas({
    oldCustomerId: "customer-a", newCustomerId: "customer-a",
    oldStatus: "Pending", oldAmount: 100, newStatus: "Paid", newAmount: 125,
  }), [{ customerId: "customer-a", delta: -100 }]);
});

test("changing a paid invoice to pending adds its new amount", () => {
  assert.deepEqual(deriveInvoiceBalanceDeltas({
    oldCustomerId: "customer-a", newCustomerId: "customer-a",
    oldStatus: "Paid", oldAmount: 100, newStatus: "Pending", newAmount: 125,
  }), [{ customerId: "customer-a", delta: 125 }]);
});

test("changing the customer reverses old due and applies new due", () => {
  assert.deepEqual(deriveInvoiceBalanceDeltas({
    oldCustomerId: "customer-a", newCustomerId: "customer-b",
    oldStatus: "Pending", oldAmount: 100, newStatus: "Pending", newAmount: 125,
  }), [
    { customerId: "customer-a", delta: -100 },
    { customerId: "customer-b", delta: 125 },
  ]);
});

test("changing the customer on a paid invoice leaves both outstanding balances unchanged", () => {
  assert.deepEqual(deriveInvoiceBalanceDeltas({
    oldCustomerId: "customer-a", newCustomerId: "customer-b",
    oldStatus: "Paid", oldAmount: 100, newStatus: "Paid", newAmount: 125,
  }), [
    { customerId: "customer-a", delta: -0 },
    { customerId: "customer-b", delta: 0 },
  ]);
});

test("rejects non-finite invoice amounts before creating balance deltas", () => {
  assert.throws(() => deriveInvoiceBalanceDeltas({
    oldCustomerId: "customer-a", newCustomerId: "customer-a",
    oldStatus: "Pending", oldAmount: Number.NaN, newStatus: "Pending", newAmount: 125,
  }), /Invalid invoice amount/);
  assert.throws(() => deriveInvoiceBalanceDeltas({
    oldCustomerId: "customer-a", newCustomerId: "customer-a",
    oldStatus: "Pending", oldAmount: 100, newStatus: "Pending", newAmount: Number.POSITIVE_INFINITY,
  }), /Invalid invoice amount/);
});
