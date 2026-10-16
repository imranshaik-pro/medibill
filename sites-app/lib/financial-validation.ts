/**
 * Validate untrusted sales-document financial inputs before any stock or
 * invoice writes. Keep this independent of the UI: API callers can bypass it.
 */
type NumericRule = {
  optional?: boolean;
  defaultValue?: number;
  min?: number;
  max?: number;
  integer?: boolean;
};

function readFiniteNumber(value: unknown, label: string, rule: NumericRule = {}): number {
  if ((value === undefined || value === null || value === "") && rule.optional) {
    return rule.defaultValue ?? 0;
  }
  if (value === undefined || value === null || value === "") {
    throw new Error(`Invalid ${label}: a number is required`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}: enter a finite number`);
  if (rule.min !== undefined && parsed < rule.min) {
    throw new Error(`Invalid ${label}: must be at least ${rule.min}`);
  }
  if (rule.max !== undefined && parsed > rule.max) {
    throw new Error(`Invalid ${label}: must be at most ${rule.max}`);
  }
  if (rule.integer && !Number.isSafeInteger(parsed)) {
    throw new Error(`Invalid ${label}: enter a whole-number quantity`);
  }
  return parsed;
}

export function validateSaleFinancialInput(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid invoice payload");
  }
  const sale = input as Record<string, unknown>;
  if (!Array.isArray(sale.items) || sale.items.length === 0) {
    throw new Error("Add at least one product row");
  }

  sale.items.forEach((rawItem, index) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error(`Invalid product row ${index + 1}`);
    }
    const item = rawItem as Record<string, unknown>;
    readFiniteNumber(item.quantity, `quantity in row ${index + 1}`, { min: 1, integer: true });
    readFiniteNumber(item.freeQuantity, `free quantity in row ${index + 1}`, { optional: true, defaultValue: 0, min: 0, integer: true });
    readFiniteNumber(item.unitRate, `unit rate in row ${index + 1}`, { min: 0 });
    readFiniteNumber(item.discountPercent, `discount percent in row ${index + 1}`, { optional: true, defaultValue: 0, min: 0, max: 100 });
    readFiniteNumber(item.gstRate, `GST rate in row ${index + 1}`, { optional: true, defaultValue: 0, min: 0, max: 100 });
  });

  readFiniteNumber(sale.freightAmount, "freight amount", { optional: true, defaultValue: 0, min: 0 });
  readFiniteNumber(sale.insuranceAmount, "insurance amount", { optional: true, defaultValue: 0, min: 0 });
  readFiniteNumber(sale.freightGstRate, "freight GST rate", { optional: true, defaultValue: 0, min: 0, max: 100 });
  readFiniteNumber(sale.insuranceGstRate, "insurance GST rate", { optional: true, defaultValue: 0, min: 0, max: 100 });
  const discountType = sale.cashDiscountType;
  if (discountType !== undefined && discountType !== "flat" && discountType !== "percent") {
    throw new Error("Invalid cash discount type");
  }
  const cashDiscount = readFiniteNumber(sale.cashDiscount, "cash discount", {
    optional: true,
    defaultValue: 0,
    min: 0,
    max: discountType === "percent" ? 100 : undefined,
  });
  const freight = readFiniteNumber(sale.freightAmount, "freight amount", { optional: true, defaultValue: 0, min: 0 });
  const insurance = readFiniteNumber(sale.insuranceAmount, "insurance amount", { optional: true, defaultValue: 0, min: 0 });
  const taxableBeforeCashDiscount = sale.items.reduce((sum, rawItem, index) => {
    const item = rawItem as Record<string, unknown>;
    const quantity = readFiniteNumber(item.quantity, `quantity in row ${index + 1}`, { min: 1, integer: true });
    const rate = readFiniteNumber(item.unitRate, `unit rate in row ${index + 1}`, { min: 0 });
    const discountPercent = readFiniteNumber(item.discountPercent, `discount percent in row ${index + 1}`, { optional: true, defaultValue: 0, min: 0, max: 100 });
    const gross = Math.round((quantity * rate + Number.EPSILON) * 100) / 100;
    const lineDiscount = Math.round((gross * discountPercent / 100 + Number.EPSILON) * 100) / 100;
    return sum + Math.round((gross - lineDiscount + Number.EPSILON) * 100) / 100;
  }, 0) + freight + insurance;
  const appliedCashDiscount = discountType === "percent"
    ? taxableBeforeCashDiscount * cashDiscount / 100
    : cashDiscount;
  if (appliedCashDiscount > taxableBeforeCashDiscount + 0.005) {
    throw new Error("Cash discount cannot exceed the pre-discount invoice value");
  }
}
