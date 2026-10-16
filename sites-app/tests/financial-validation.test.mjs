import assert from "node:assert/strict";
import test from "node:test";
import { validateSaleFinancialInput } from "../lib/financial-validation.ts";

const validSale = {
  items: [{ quantity: 2, freeQuantity: 1, unitRate: 10.25, discountPercent: 5, gstRate: 12 }],
  freightAmount: 2,
  insuranceAmount: 0,
  freightGstRate: 5,
  insuranceGstRate: 0,
  cashDiscountType: "flat",
  cashDiscount: 1,
};

test("accepts a valid sales invoice payload", () => {
  assert.doesNotThrow(() => validateSaleFinancialInput(validSale));
});

test("rejects NaN and infinite quantities", () => {
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], quantity: "NaN" }] }), /finite number/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], quantity: Infinity }] }), /finite number/);
});

test("rejects fractional or negative quantities", () => {
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], quantity: 1.5 }] }), /whole-number quantity/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], quantity: -1 }] }), /at least 1/);
});

test("rejects invalid rates and discounts", () => {
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], unitRate: -1 }] }), /at least 0/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], unitRate: 0 }] }), /greater than 0/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], discountPercent: 101 }] }), /at most 100/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [{ ...validSale.items[0], gstRate: "Infinity" }] }), /finite number/);
});

test("rejects negative charges and excessive cash discounts", () => {
  assert.throws(() => validateSaleFinancialInput({ ...validSale, freightAmount: -1 }), /at least 0/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, cashDiscount: 100 }), /cannot exceed/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, cashDiscountType: "percent", cashDiscount: 101 }), /at most 100/);
});

test("rejects unsupported discount types and empty invoices", () => {
  assert.throws(() => validateSaleFinancialInput({ ...validSale, cashDiscountType: "mystery" }), /discount type/);
  assert.throws(() => validateSaleFinancialInput({ ...validSale, items: [] }), /at least one product row/);
});
