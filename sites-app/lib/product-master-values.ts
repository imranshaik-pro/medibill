export type ProductMasterSyncValues = {
  name: string; composition: string; defaultPack: string; hsn: string;
  manufacturer: string; marketedBy: string; defaultGstRate: number; category: string;
  isScheduleH1: boolean; isPrescriptionRequired: boolean; isHighCaution: boolean; cautionNotes: string;
};

// Only editable fields belong to the browser's optimistic-concurrency snapshot.
// Keep their original spelling/spacing; normalizing edits must not alter this snapshot.
export function productMasterSnapshot(row: Partial<ProductMasterSyncValues>): ProductMasterSyncValues {
  return {
    name: row.name ?? "", composition: row.composition ?? "", defaultPack: row.defaultPack ?? "",
    hsn: row.hsn ?? "", manufacturer: row.manufacturer ?? "", marketedBy: row.marketedBy ?? "",
    defaultGstRate: row.defaultGstRate ?? 5, category: row.category ?? "General",
    isScheduleH1: Boolean(row.isScheduleH1), isPrescriptionRequired: Boolean(row.isPrescriptionRequired),
    isHighCaution: Boolean(row.isHighCaution), cautionNotes: row.cautionNotes ?? "",
  };
}
