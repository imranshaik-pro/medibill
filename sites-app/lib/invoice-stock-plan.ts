type StockProduct = { id: string; name: string; batch: string; stock: number };
type StockLine = { productId: string; quantity: number; freeQuantity?: number | null };

/**
 * Calculate stock after reversing an existing invoice and applying its edited
 * lines. This is a pure planning step; persistence remains atomic in
 * commitStockBatch and the snapshot guards.
 */
export function planInvoiceStockTransition(
  products: StockProduct[],
  oldLines: StockLine[],
  newItems: StockLine[],
): {
  restored: Map<string, number>;
  requested: Map<string, number>;
  nextStock: Map<string, number>;
} {
  const productMap = new Map<string, StockProduct>();
  const restored = new Map<string, number>();
  for (const product of products) {
    if (!product.id || productMap.has(product.id)) {
      throw new Error("Inventory contains a missing or duplicate batch identifier");
    }
    if (!Number.isSafeInteger(product.stock) || product.stock < 0) {
      throw new Error(`${product.name} batch ${product.batch}: invalid current stock`);
    }
    productMap.set(product.id, product);
    restored.set(product.id, product.stock);
  }

  for (const line of oldLines) {
    if (!productMap.has(line.productId)) {
      throw new Error("An existing invoice batch no longer exists; reconcile inventory before editing");
    }
    const quantity = line.quantity;
    const freeQuantity = line.freeQuantity ?? 0;
    const oldUnits = quantity + freeQuantity;
    if (!Number.isSafeInteger(quantity) || quantity < 0 ||
        !Number.isSafeInteger(freeQuantity) || freeQuantity < 0 ||
        !Number.isSafeInteger(oldUnits)) {
      throw new Error("Existing invoice contains invalid stock quantities");
    }
    const totalRestored = (restored.get(line.productId) ?? 0) + oldUnits;
    if (!Number.isSafeInteger(totalRestored)) {
      throw new Error("Existing invoice stock quantity is too large to restore safely");
    }
    restored.set(line.productId, totalRestored);
  }

  const requested = new Map<string, number>();
  for (const item of newItems) {
    const quantity = item.quantity;
    const freeQuantity = item.freeQuantity ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity <= 0 ||
        !Number.isSafeInteger(freeQuantity) || freeQuantity < 0) {
      throw new Error("Enter positive whole billed units and nonnegative whole free units");
    }
    const total = (requested.get(item.productId) || 0) + quantity + freeQuantity;
    if (!Number.isSafeInteger(total)) throw new Error("Requested stock quantity is too large");
    requested.set(item.productId, total);
  }

  for (const [productId, quantity] of requested) {
    const product = productMap.get(productId);
    const available = restored.get(productId) ?? 0;
    if (!product) throw new Error("Selected batch no longer exists");
    if (quantity > available) {
      throw new Error(
        `${product.name} batch ${product.batch}: cannot bill ${quantity}; only ${available} available after reversing the original invoice`,
      );
    }
  }

  const nextStock = new Map<string, number>();
  for (const product of products) {
    const next = (restored.get(product.id) ?? product.stock) - (requested.get(product.id) || 0);
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new Error(`${product.name} batch ${product.batch}: invalid stock result`);
    }
    nextStock.set(product.id, next);
  }
  return { restored, requested, nextStock };
}
