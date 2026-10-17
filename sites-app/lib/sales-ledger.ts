/**
 * Derive customer-ledger deltas for a sales invoice create/edit transition.
 * "Paid" invoices do not contribute to customer outstanding; all other
 * statuses contribute the rounded invoice amount.
 */
export function deriveInvoiceBalanceDeltas(input: {
  oldCustomerId?: string | null;
  newCustomerId: string;
  oldStatus?: string | null;
  oldAmount?: number | null;
  newStatus: string;
  newAmount: number;
}): Array<{ customerId: string; delta: number }> {
  const oldAmount = input.oldAmount ?? 0;
  const newAmount = input.newAmount;
  if (!Number.isFinite(oldAmount) || !Number.isFinite(newAmount)) {
    throw new Error("Invalid invoice amount for customer balance update");
  }
  const oldDue = input.oldStatus === "Paid" ? 0 : oldAmount;
  const newDue = input.newStatus === "Paid" ? 0 : newAmount;
  const oldCustomerId = input.oldCustomerId;
  if (oldCustomerId && oldCustomerId !== input.newCustomerId) {
    return [
      { customerId: oldCustomerId, delta: -oldDue },
      { customerId: input.newCustomerId, delta: newDue },
    ].filter((entry) => entry.delta !== 0);
  }
  return [{ customerId: input.newCustomerId, delta: newDue - oldDue }];
}
