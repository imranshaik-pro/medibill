export function assertValidStockDelta(delta: number): void {
  if (!Number.isSafeInteger(delta)) {
    throw new Error("Stock quantities must be whole units");
  }
}

export function assertValidBalanceDelta(delta: number): void {
  if (!Number.isFinite(delta)) {
    throw new Error("Invalid balance amount");
  }
}
