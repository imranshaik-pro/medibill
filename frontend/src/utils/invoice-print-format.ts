/** Compact invoice display only; never mutate stored manufacturer names. */
export function formatInvoiceManufacturer(value: string | null | undefined): string {
  return Array.from((value ?? "").trim()).slice(0, 5).join("");
}
