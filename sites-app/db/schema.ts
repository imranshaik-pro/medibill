import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("admin"),
    username: text("username").notNull().default(""),
    mobile: text("mobile").notNull().default(""),
    status: text("status").notNull().default("active"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_users_email").on(t.email),
    index("idx_users_tenant").on(t.tenantId),
  ],
);

export const firmRegistrations = sqliteTable(
  "firm_registrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    username: text("username").notNull(),
    mobile: text("mobile").notNull(),
    email: text("email").notNull(),
    firmName: text("firm_name").notNull(),
    address: text("address").notNull(),
    gstin: text("gstin").notNull(),
    logoKey: text("logo_key"),
    status: text("status").notNull().default("pending_approval"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: integer("reviewed_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_firm_registrations_user").on(t.userId),
    index("idx_firm_registrations_status").on(t.status, t.createdAt),
  ],
);

export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    gstin: text("gstin"),
    phone: text("phone").notNull(),
    outstanding: real("outstanding").notNull().default(0),
    status: text("status").notNull().default("Active"),
    legalName: text("legal_name"),
    tradeName: text("trade_name"),
    dlNo: text("dl_no"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    pinCode: text("pin_code"),
    registrationStatus: text("registration_status")
      .notNull()
      .default("Unverified"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_customers_tenant").on(t.tenantId),
    uniqueIndex("idx_customers_tenant_name").on(t.tenantId, t.name),
  ],
);

export const productMasters = sqliteTable(
  "product_masters",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    composition: text("composition").notNull().default(""),
    defaultPack: text("default_pack").notNull().default(""),
    hsn: text("hsn").notNull().default(""),
    manufacturer: text("manufacturer").notNull(),
    marketedBy: text("marketed_by").notNull().default(""),
    defaultGstRate: real("default_gst_rate").notNull().default(5),
    category: text("category").notNull().default("General"),
    isScheduleH1: integer("is_schedule_h1", { mode: "boolean" })
      .notNull()
      .default(false),
    isPrescriptionRequired: integer("is_prescription_required", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    isHighCaution: integer("is_high_caution", { mode: "boolean" })
      .notNull()
      .default(false),
    cautionNotes: text("caution_notes").notNull().default(""),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_product_masters_tenant").on(t.tenantId),
    uniqueIndex("idx_product_masters_tenant_name").on(t.tenantId, t.name),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productMasterId: text("product_master_id").references(
      () => productMasters.id,
    ),
    name: text("name").notNull(),
    batch: text("batch").notNull(),
    stock: integer("stock").notNull().default(0),
    mfgDate: text("mfg_date").notNull().default(""),
    expiry: text("expiry").notNull(),
    purchaseRate: real("purchase_rate").notNull(),
    mrp: real("mrp").notNull(),
    hsn: text("hsn").notNull().default(""),
    pack: text("pack").notNull().default(""),
    manufacturer: text("manufacturer").notNull().default(""),
    packMultiplier: integer("pack_multiplier").notNull().default(1),
    physicalStock: integer("physical_stock").notNull().default(0),
    landingCostPerUnit: real("landing_cost_per_unit").notNull().default(0),
    mrpPerUnit: real("mrp_per_unit").notNull().default(0),
    saleRate: real("sale_rate").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_products_tenant").on(t.tenantId),
    uniqueIndex("idx_products_tenant_batch").on(t.tenantId, t.name, t.batch),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    invoiceNo: text("invoice_no").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    customerName: text("customer_name").notNull(),
    amount: real("amount").notNull(),
    status: text("status").notNull().default("Pending"),
    invoiceDate: text("invoice_date").notNull(),
    invoiceTime: text("invoice_time"),
    invoiceType: text("invoice_type").notNull().default("Tax Invoice"),
    paymentMode: text("payment_mode").notNull().default("Credit"),
    dueDate: text("due_date"),
    paymentTerms: text("payment_terms"),
    sellerStateCode: text("seller_state_code"),
    buyerStateCode: text("buyer_state_code"),
    transportName: text("transport_name"),
    vehicleNo: text("vehicle_no"),
    lrNo: text("lr_no"),
    prescriptionDoctorName: text("prescription_doctor_name"),
    prescriptionDoctorRegistration: text("prescription_doctor_registration"),
    complianceAcknowledged: integer("compliance_acknowledged", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    freightAmount: real("freight_amount").notNull().default(0),
    freightGstRate: real("freight_gst_rate").notNull().default(0),
    insuranceAmount: real("insurance_amount").notNull().default(0),
    insuranceGstRate: real("insurance_gst_rate").notNull().default(0),
    grossTaxable: real("gross_taxable").notNull().default(0),
    lineDiscount: real("line_discount").notNull().default(0),
    cashDiscount: real("cash_discount").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    igst: real("igst").notNull().default(0),
    roundOff: real("round_off").notNull().default(0),
    amountInWords: text("amount_in_words"),
    totalQuantity: integer("total_quantity").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_invoices_tenant_no").on(t.tenantId, t.invoiceNo),
    index("idx_invoices_tenant_date").on(t.tenantId, t.invoiceDate),
  ],
);

export const invoiceLines = sqliteTable(
  "invoice_lines",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    productName: text("product_name").notNull(),
    batch: text("batch").notNull(),
    pack: text("pack").notNull().default(""),
    manufacturer: text("manufacturer").notNull().default(""),
    hsn: text("hsn").notNull().default(""),
    expiry: text("expiry").notNull().default(""),
    mrp: real("mrp").notNull().default(0),
    availableStock: integer("available_stock").notNull().default(0),
    quantity: integer("quantity").notNull(),
    freeQuantity: integer("free_quantity").notNull().default(0),
    unitRate: real("unit_rate").notNull(),
    discountPercent: real("discount_percent").notNull().default(0),
    discountAmount: real("discount_amount").notNull().default(0),
    gstRate: real("gst_rate").notNull().default(0),
    taxableAmount: real("taxable_amount").notNull(),
    gstAmount: real("gst_amount").notNull(),
    lineTotal: real("line_total").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_invoice_lines_tenant_invoice").on(t.tenantId, t.invoiceId),
    index("idx_invoice_lines_customer_product_created").on(
      t.tenantId,
      t.customerId,
      t.productId,
      t.createdAt,
    ),
  ],
);

export const suppliers = sqliteTable(
  "suppliers",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    tradeName: text("trade_name"),
    gstin: text("gstin"),
    dlNo: text("dl_no"),
    phone: text("phone").notNull(),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    stateCode: text("state_code"),
    pinCode: text("pin_code"),
    registrationStatus: text("registration_status")
      .notNull()
      .default("Unverified"),
    outstanding: real("outstanding").notNull().default(0),
    status: text("status").notNull().default("Active"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_suppliers_tenant").on(t.tenantId),
    uniqueIndex("idx_suppliers_tenant_name").on(t.tenantId, t.name),
  ],
);

export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    purchaseNo: text("purchase_no").notNull(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    productName: text("product_name").notNull(),
    quantity: integer("quantity").notNull(),
    unitCost: real("unit_cost").notNull(),
    gstRate: real("gst_rate").notNull().default(0),
    amount: real("amount").notNull(),
    status: text("status").notNull().default("Pending"),
    purchaseDate: text("purchase_date").notNull(),
    sourceDocumentKey: text("source_document_key"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_purchases_tenant_no").on(t.tenantId, t.purchaseNo),
    index("idx_purchases_tenant_date").on(t.tenantId, t.purchaseDate),
  ],
);

export const purchaseInwards = sqliteTable(
  "purchase_inwards",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    inwardNo: text("inward_no").notNull(),
    supplierId: text("supplier_id").references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    supplierAddress: text("supplier_address"),
    supplierGstin: text("supplier_gstin"),
    supplierDlNo: text("supplier_dl_no"),
    supplierPhoneEmail: text("supplier_phone_email"),
    buyerName: text("buyer_name"),
    buyerAddress: text("buyer_address"),
    buyerGstin: text("buyer_gstin"),
    buyerDlNo: text("buyer_dl_no"),
    customerId: text("customer_id"),
    orderNo: text("order_no"),
    invoiceNo: text("invoice_no"),
    invoiceDate: text("invoice_date"),
    dueDate: text("due_date"),
    transportGrNo: text("transport_gr_no"),
    subtotal: real("subtotal").notNull().default(0),
    igst: real("igst").notNull().default(0),
    cgst: real("cgst").notNull().default(0),
    sgst: real("sgst").notNull().default(0),
    roundOff: real("round_off").notNull().default(0),
    grandTotal: real("grand_total").notNull().default(0),
    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    bankBranch: text("bank_branch"),
    ifsc: text("ifsc"),
    status: text("status").notNull().default("Pending"),
    sourceDocumentKey: text("source_document_key"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_purchase_inwards_tenant_no").on(t.tenantId, t.inwardNo),
    index("idx_purchase_inwards_tenant_date").on(t.tenantId, t.invoiceDate),
  ],
);

export const purchaseInwardItems = sqliteTable(
  "purchase_inward_items",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    inwardId: text("inward_id")
      .notNull()
      .references(() => purchaseInwards.id),
    productMasterId: text("product_master_id").references(
      () => productMasters.id,
    ),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    serialNo: integer("serial_no").notNull(),
    productName: text("product_name").notNull(),
    pack: text("pack").notNull(),
    manufacturer: text("manufacturer").notNull(),
    hsn: text("hsn").notNull(),
    batch: text("batch").notNull(),
    expiry: text("expiry").notNull(),
    billedQuantity: integer("billed_quantity").notNull(),
    freeQuantity: integer("free_quantity").notNull().default(0),
    mrp: real("mrp").notNull(),
    netRate: real("net_rate").notNull(),
    gstRate: real("gst_rate").notNull().default(0),
    gstAmount: real("gst_amount").notNull().default(0),
    lineTotal: real("line_total").notNull(),
    grossTotal: real("gross_total").notNull().default(0),
    packMultiplier: integer("pack_multiplier").notNull().default(1),
    physicalUnits: integer("physical_units").notNull().default(0),
    landingCostPerUnit: real("landing_cost_per_unit").notNull().default(0),
    mrpPerUnit: real("mrp_per_unit").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_purchase_inward_items_inward").on(t.tenantId, t.inwardId),
    index("idx_purchase_inward_items_product").on(t.tenantId, t.productId),
  ],
);

export const purchaseCharges = sqliteTable(
  "purchase_charges",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    inwardId: text("inward_id")
      .notNull()
      .references(() => purchaseInwards.id),
    kind: text("kind").notNull(),
    amount: real("amount").notNull().default(0),
    hsn: text("hsn"),
    gstRate: real("gst_rate").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_purchase_charges_inward").on(t.tenantId, t.inwardId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    paymentNo: text("payment_no").notNull(),
    type: text("type").notNull(),
    partyId: text("party_id").notNull(),
    partyName: text("party_name").notNull(),
    amount: real("amount").notNull(),
    method: text("method").notNull().default("Bank"),
    paymentDate: text("payment_date").notNull(),
    notes: text("notes"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_payments_tenant_no").on(t.tenantId, t.paymentNo),
    index("idx_payments_tenant_date").on(t.tenantId, t.paymentDate),
  ],
);

export const returns = sqliteTable(
  "returns",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    returnNo: text("return_no").notNull(),
    type: text("type").notNull(),
    partyId: text("party_id").notNull(),
    partyName: text("party_name").notNull(),
    referenceNo: text("reference_no").notNull(),
    amount: real("amount").notNull(),
    reason: text("reason").notNull(),
    returnDate: text("return_date").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("idx_returns_tenant_no").on(t.tenantId, t.returnNo),
    index("idx_returns_tenant_date").on(t.tenantId, t.returnDate),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    details: text("details"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_audit_tenant_created").on(t.tenantId, t.createdAt)],
);

export const stockAdjustments = sqliteTable(
  "stock_adjustments",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    batch: text("batch").notNull(),
    previousStock: integer("previous_stock").notNull(),
    newStock: integer("new_stock").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_stock_adjustments_product_created").on(
      t.tenantId,
      t.productId,
      t.createdAt,
    ),
  ],
);

export const backupSettings = sqliteTable("backup_settings", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  frequency: text("frequency").notNull().default("daily"),
  retention: integer("retention").notNull().default(14),
  storageTarget: text("storage_target").notNull().default("cloud_local"),
  updatedAt: integer("updated_at").notNull(),
});

export const backupRecords = sqliteTable(
  "backup_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fileName: text("file_name").notNull(),
    objectKey: text("object_key").notNull(),
    kind: text("kind").notNull().default("manual"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    checksum: text("checksum").notNull(),
    productCount: integer("product_count").notNull().default(0),
    purchaseCount: integer("purchase_count").notNull().default(0),
    salesCount: integer("sales_count").notNull().default(0),
    batchCount: integer("batch_count").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("idx_backup_records_tenant_created").on(t.tenantId, t.createdAt),
  ],
);

export const agencyProfiles = sqliteTable("agency_profiles", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  tradeName: text("trade_name").notNull(),
  legalEntity: text("legal_entity").notNull().default(""),
  tagline: text("tagline")
    .notNull()
    .default("Medical and pharmaceutical wholesale distribution"),
  logoKey: text("logo_key"),
  gstin: text("gstin").notNull().default(""),
  state: text("state").notNull().default("Telangana"),
  stateCode: text("state_code").notNull().default("36"),
  dlNo20b: text("dl_no_20b").notNull().default(""),
  dlNo21b: text("dl_no_21b").notNull().default(""),
  fssai: text("fssai").notNull().default(""),
  pan: text("pan").notNull().default(""),
  streetAddress: text("street_address").notNull().default(""),
  city: text("city").notNull().default(""),
  district: text("district").notNull().default(""),
  pinCode: text("pin_code").notNull().default(""),
  bookingLocation: text("booking_location").notNull().default(""),
  phones: text("phones").notNull().default(""),
  email: text("email").notNull().default(""),
  website: text("website").notNull().default(""),
  bankName: text("bank_name").notNull().default(""),
  accountHolder: text("account_holder").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  ifsc: text("ifsc").notNull().default(""),
  branchName: text("branch_name").notNull().default(""),
  terms: text("terms")
    .notNull()
    .default(
      "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction only.",
    ),
  signatoryTitle: text("signatory_title")
    .notNull()
    .default("Authorised Signatory"),
  signatureKey: text("signature_key"),
  updatedAt: integer("updated_at").notNull(),
});

// Internal save receipts are never supplied by tenant backup payloads.
export const documentRequests = sqliteTable("document_requests", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(),
  userId: text("user_id").notNull(), kind: text("kind").notNull(),
  requestKey: text("request_key").notNull(), payloadHash: text("payload_hash").notNull(),
  resultJson: text("result_json").notNull(), createdAt: integer("created_at").notNull(),
}, (table) => [uniqueIndex("document_requests_scope").on(table.tenantId,table.userId,table.kind,table.requestKey)]);
