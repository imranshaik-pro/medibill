import { env } from "cloudflare:workers";
import { deleteInvoiceRecord, nextDocumentNumber } from "./invoice-deletion";
import { requireRestoreAdmin, validateRestoreSnapshot } from "./restore-security";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  agencyProfiles,
  auditLogs,
  backupRecords,
  backupSettings,
  customers,
  firmRegistrations,
  invoiceLines,
  invoices,
  payments,
  productMasters,
  products,
  purchaseCharges,
  purchaseInwardItems,
  purchaseInwards,
  purchases,
  returns,
  stockAdjustments,
  suppliers,
  tenants,
  users,
} from "@/db/schema";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

export async function getMembership(userId: string) {
  const row =
    (
      await getDb().select().from(users).where(eq(users.id, userId)).limit(1)
    )[0] ?? null;
  return row?.status === "active" ? row : null;
}
export async function getAnyMembership(userId: string) {
  return (
    (
      await getDb().select().from(users).where(eq(users.id, userId)).limit(1)
    )[0] ?? null
  );
}

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const DL_PATTERN = /^[A-Z0-9][A-Z0-9/.-]{4,39}$/;

type LookupMode = "online" | "local";
type LookupBindings = typeof env & {
  GST_LOOKUP_API_URL?: string;
  GST_LOOKUP_API_KEY?: string;
  GST_LOOKUP_API_TOKEN?: string;
  DL_LOOKUP_API_URL?: string;
  DL_LOOKUP_API_KEY?: string;
  DL_LOOKUP_API_TOKEN?: string;
  BUSINESS_LOOKUP_API_URL?: string;
  BUSINESS_LOOKUP_API_KEY?: string;
  BUSINESS_LOOKUP_API_TOKEN?: string;
};
const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : value == null ? "" : String(value);
function registryRows(raw: Record<string, any>) {
  const body = raw.data?.data ?? raw.data ?? raw.result ?? raw.results ?? raw;
  return Array.isArray(body)
    ? body
    : Array.isArray(body?.results)
      ? body.results
      : [body];
}
function registryAddress(x: Record<string, any>) {
  const a = x.pradr?.addr || x.principal_address || x.address_details || {};
  return clean(
    x.address ||
      x.full_address ||
      x.pradr?.adr ||
      [a.flno, a.bno, a.bnm, a.st, a.loc, a.dst, a.stcd, a.pncd]
        .map(clean)
        .filter(Boolean)
        .join(", "),
  );
}
async function onlineRegistryLookup(
  query: string,
  kind: "gstin" | "dl" | "name",
  bindings: LookupBindings,
) {
  const prefix = kind === "gstin" ? "GST" : kind === "dl" ? "DL" : "BUSINESS",
    urlTemplate = bindings[
      `${prefix}_LOOKUP_API_URL` as keyof LookupBindings
    ] as string | undefined,
    apiKey = bindings[`${prefix}_LOOKUP_API_KEY` as keyof LookupBindings] as
      string | undefined,
    token = bindings[`${prefix}_LOOKUP_API_TOKEN` as keyof LookupBindings] as
      string | undefined;
  const verificationUrl =
    kind === "gstin"
      ? "https://services.gst.gov.in/services/searchtp"
      : "https://www.statedrugs.gov.in/SFDA/third-part-licence-verification.html";
  if (!urlTemplate || !apiKey)
    return {
      results: [] as Array<Record<string, unknown>>,
      configured: false,
      verificationUrl,
    };
  const encoded = encodeURIComponent(query),
    url = new URL(
      urlTemplate
        .replaceAll("{query}", encoded)
        .replaceAll("{gstin}", encoded)
        .replaceAll("{license}", encoded)
        .replaceAll("{name}", encoded),
    );
  if (!/[{](query|gstin|license|name)[}]/.test(urlTemplate))
    url.searchParams.set(
      kind === "gstin" ? "gstin" : kind === "dl" ? "license_number" : "q",
      query,
    );
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-api-key": apiKey,
        authorization: `Bearer ${token || apiKey}`,
      },
      signal: controller.signal,
    });
    if (response.status === 429)
      throw new Error(
        "Online registry request limit reached. Please try again shortly.",
      );
    if (!response.ok)
      throw new Error(
        `Online registry is temporarily unavailable (${response.status}).`,
      );
    const raw = (await response.json()) as Record<string, any>,
      verifiedAt = new Date().toISOString(),
      registry = clean(raw.provider || raw.registry || url.hostname);
    const results = registryRows(raw)
      .filter((x) => x && typeof x === "object")
      .slice(0, 20)
      .map((x: Record<string, any>) => {
        const a = x.pradr?.addr || x.address_details || {};
        return {
          partyType: "all",
          source: "online-registry",
          registry,
          verifiedAt,
          name: clean(
            x.tradeName ||
              x.trade_name ||
              x.tradeNam ||
              x.firm_name ||
              x.name ||
              x.legalName ||
              x.legal_name ||
              x.lgnm,
          ),
          legalName: clean(x.legalName || x.legal_name || x.lgnm),
          tradeName: clean(
            x.tradeName || x.trade_name || x.tradeNam || x.firm_name,
          ),
          gstin: clean(x.gstin || x.gst_number),
          dlNo: clean(x.dlNo || x.dl_no || x.license_number),
          phone: clean(x.phone || x.mobile),
          address: registryAddress(x),
          city: clean(x.city || x.location || a.loc || a.dst),
          state: clean(x.state || x.stateName || a.stcd),
          stateCode: clean(
            x.stateCode || x.state_code || (x.gstin || query).slice(0, 2),
          ),
          pinCode: clean(x.pinCode || x.pincode || a.pncd),
          registrationStatus: clean(
            x.registrationStatus ||
              x.status ||
              x.sts ||
              x.license_status ||
              "Verified",
          ),
          constitutionType: clean(
            x.constitutionType || x.constitution || x.ctb,
          ),
          issuingAuthority: clean(x.issuingAuthority || x.issuing_authority),
          authorizedPerson: clean(x.authorizedPerson || x.authorized_person),
        };
      })
      .filter((x) => x.name || x.gstin || x.dlNo);
    return { results, configured: true, verificationUrl };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupParties(
  userId: string,
  rawQuery: string,
  partyType: "customer" | "supplier" | "all" = "all",
  mode: LookupMode = "online",
) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  const query = String(rawQuery || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
  if (query.length < 2) throw new Error("Enter at least 2 characters");
  const looksLikeGstin = query.length === 15;
  if (looksLikeGstin && !GSTIN_PATTERN.test(query))
    throw new Error("Enter a valid 15-character GSTIN");
  const looksLikeDl = /[0-9]/.test(query) && /[/.:-]/.test(query);
  if (looksLikeDl && !DL_PATTERN.test(query.replace(/:/g, "")))
    throw new Error("Enter a valid DL number");

  const db = getDb(),
    term = `%${query}%`,
    results: Array<Record<string, unknown>> = [];
  if (mode === "local" && partyType !== "supplier") {
    const rows = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.tenantId, member.tenantId),
          or(
            like(customers.name, term),
            like(customers.gstin, term),
            like(customers.dlNo, term),
          ),
        ),
      )
      .limit(10);
    for (const x of rows)
      results.push({
        id: x.id,
        partyType: "customer",
        source: "local",
        name: x.name,
        legalName: x.legalName,
        tradeName: x.tradeName || x.name,
        gstin: x.gstin,
        dlNo: x.dlNo,
        phone: x.phone,
        address: x.address,
        city: x.city,
        state: x.state,
        stateCode: x.stateCode,
        pinCode: x.pinCode,
        registrationStatus: x.registrationStatus || x.status,
      });
  }
  if (mode === "local" && partyType !== "customer") {
    const rows = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.tenantId, member.tenantId),
          or(
            like(suppliers.name, term),
            like(suppliers.gstin, term),
            like(suppliers.dlNo, term),
          ),
        ),
      )
      .limit(10);
    for (const x of rows)
      results.push({
        id: x.id,
        partyType: "supplier",
        source: "local",
        name: x.name,
        legalName: x.legalName,
        tradeName: x.tradeName || x.name,
        gstin: x.gstin,
        dlNo: x.dlNo,
        phone: x.phone,
        address: x.address,
        city: x.city,
        state: x.state,
        stateCode: x.stateCode,
        pinCode: x.pinCode,
        registrationStatus: x.registrationStatus || x.status,
      });
  }

  if (mode === "local")
    return { query, mode, results, onlineConfigured: false };
  const kind = GSTIN_PATTERN.test(query)
      ? "gstin"
      : looksLikeDl
        ? "dl"
        : "name",
    online = await onlineRegistryLookup(query, kind, env as LookupBindings);
  return {
    query,
    mode,
    lookupKind: kind,
    results: online.results.map((x) => ({ ...x, partyType })),
    onlineConfigured: online.configured,
    verificationUrl: online.verificationUrl,
  };
}

export async function createWorkspace(
  user: ChatGPTUser,
  input: {
    companyName: string;
    username: string;
    mobile: string;
    address: string;
    gstin: string;
    logoKey?: string | null;
  },
) {
  const existing = await getAnyMembership(user.userId);
  if (existing) return existing;
  const tenantId = crypto.randomUUID();
  const now = Date.now();
  await getDb().batch([
    getDb()
      .insert(tenants)
      .values({ id: tenantId, companyName: input.companyName, createdAt: now }),
    getDb()
      .insert(users)
      .values({
        id: user.userId,
        tenantId,
        email: user.email,
        displayName: user.displayName,
        role: "owner",
        username: input.username,
        mobile: input.mobile,
        status: "pending_approval",
        createdAt: now,
      }),
    getDb()
      .insert(firmRegistrations)
      .values({
        id: crypto.randomUUID(),
        userId: user.userId,
        tenantId,
        username: input.username,
        mobile: input.mobile,
        email: user.email,
        firmName: input.companyName,
        address: input.address,
        gstin: input.gstin,
        logoKey: input.logoKey || null,
        status: "pending_approval",
        createdAt: now,
      }),
    getDb()
      .insert(customers)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name: "Walk-in Customer",
        gstin: null,
        phone: "0000000000",
        outstanding: 0,
        status: "Active",
        createdAt: now,
      }),
  ]);
  await audit(
    tenantId,
    user.userId,
    "registration.submitted",
    input.companyName,
  );
  return await getAnyMembership(user.userId);
}

export async function dashboardData(userId: string) {
  const member = await getAnyMembership(userId);
  if (!member) return null;
  if (member.status !== "active") return { approvalPending: true, member };
  const db = getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, member.tenantId))
    .limit(1);
  const customerRows = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, member.tenantId))
    .orderBy(desc(customers.createdAt))
    .limit(100);
  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.tenantId, member.tenantId))
    .orderBy(desc(products.createdAt))
    .limit(100);
  const productMasterRows = await db
    .select()
    .from(productMasters)
    .where(eq(productMasters.tenantId, member.tenantId))
    .orderBy(desc(productMasters.createdAt))
    .limit(200);
  const invoiceRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.tenantId, member.tenantId))
    .orderBy(desc(invoices.createdAt))
    .limit(100);
  const invoiceLineRows = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.tenantId, member.tenantId))
    .orderBy(desc(invoiceLines.createdAt))
    .limit(500);
  const supplierRows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.tenantId, member.tenantId))
    .orderBy(desc(suppliers.createdAt))
    .limit(100);
  const purchaseRows = await db
    .select()
    .from(purchases)
    .where(eq(purchases.tenantId, member.tenantId))
    .orderBy(desc(purchases.createdAt))
    .limit(100);
  const purchaseInwardRows = await db
    .select()
    .from(purchaseInwards)
    .where(eq(purchaseInwards.tenantId, member.tenantId))
    .orderBy(desc(purchaseInwards.createdAt))
    .limit(100);
  const purchaseInwardItemRows = await db
    .select({ inwardId: purchaseInwardItems.inwardId })
    .from(purchaseInwardItems)
    .where(eq(purchaseInwardItems.tenantId, member.tenantId))
    .limit(5000);
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.tenantId, member.tenantId))
    .orderBy(desc(payments.createdAt))
    .limit(100);
  const returnRows = await db
    .select()
    .from(returns)
    .where(eq(returns.tenantId, member.tenantId))
    .orderBy(desc(returns.createdAt))
    .limit(100);
  const inwardCounts = new Map<string, number>();
  for (const row of purchaseInwardItemRows)
    inwardCounts.set(row.inwardId, (inwardCounts.get(row.inwardId) || 0) + 1);
  const [schedule] = await db
    .select()
    .from(backupSettings)
    .where(eq(backupSettings.tenantId, member.tenantId))
    .limit(1);
  if (schedule?.enabled) {
    const [last] = await db
        .select()
        .from(backupRecords)
        .where(eq(backupRecords.tenantId, member.tenantId))
        .orderBy(desc(backupRecords.createdAt))
        .limit(1),
      interval = schedule.frequency === "weekly" ? 7 * 86400000 : 86400000;
    if (!last || Date.now() - last.createdAt >= interval)
      await createFullBackup(userId, "scheduled").catch(() => undefined);
  }
  return {
    tenant,
    member,
    customers: customerRows,
    productMasters: productMasterRows,
    products: productRows,
    invoices: invoiceRows,
    invoiceLines: invoiceLineRows,
    suppliers: supplierRows,
    purchases: purchaseRows,
    purchaseInwards: purchaseInwardRows.map((row) => ({
      ...row,
      totalItems: inwardCounts.get(row.id) || 0,
    })),
    payments: paymentRows,
    returns: returnRows,
  };
}

type InwardInput = {
  supplier: {
    name: string;
    address?: string;
    gstin?: string;
    dlNo?: string;
    phoneEmail?: string;
  };
  buyer?: {
    name?: string;
    address?: string;
    gstin?: string;
    dlNo?: string;
    customerId?: string;
  };
  meta?: {
    orderNo?: string;
    invoiceNo?: string;
    invoiceDate?: string;
    dueDate?: string;
    transportGrNo?: string;
  };
  items: Array<{
    serialNo: number;
    productName: string;
    pack: string;
    manufacturer: string;
    hsn: string;
    batch: string;
    expiry: string;
    billedQuantity: number;
    freeQuantity: number;
    mrp: number;
    netRate: number;
    gstRate: number;
    gstAmount: number;
    lineTotal: number;
  }>;
  charges?: Array<{
    kind: string;
    amount: number;
    hsn?: string;
    gstRate: number;
  }>;
  summary: {
    subtotal: number;
    igst: number;
    cgst: number;
    sgst: number;
    roundOff: number;
    grandTotal: number;
  };
  bank?: {
    name?: string;
    accountNumber?: string;
    branch?: string;
    ifsc?: string;
  };
  status?: string;
  sourceDocumentKey?: string;
};
const money2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
export function packMultiplier(pack: string) {
  const values = (
    pack
      .toUpperCase()
      .replace(/\s+/g, "")
      .match(/\d+(?:\.\d+)?/g) || []
  )
    .map(Number)
    .filter((n) => n > 0);
  return values.length
    ? Math.max(1, Math.round(values.reduce((a, b) => a * b, 1)))
    : 1;
}
function normalizedInward(input: InwardInput) {
  const items = input.items.map((row) => {
    const billed = Number(row.billedQuantity || 0),
      free = Number(row.freeQuantity || 0),
      rate = Number(row.netRate || 0),
      lineTotal = money2(billed * rate),
      gstRate = Number(row.gstRate || 0),
      gstAmount = money2((lineTotal * gstRate) / 100);
    return {
      ...row,
      billedQuantity: billed,
      freeQuantity: free,
      netRate: rate,
      lineTotal,
      gstAmount,
      grossTotal: money2(lineTotal + gstAmount),
    };
  });
  const charges = (input.charges || []).map((c) => ({
    ...c,
    amount: Number(c.amount || 0),
    gstRate: Number(c.gstRate || 0),
  }));
  const subtotal = money2(
      items.reduce((s, x) => s + x.lineTotal, 0) +
        charges.reduce((s, x) => s + x.amount, 0),
    ),
    totalGst = money2(
      items.reduce((s, x) => s + x.gstAmount, 0) +
        charges.reduce((s, x) => s + money2((x.amount * x.gstRate) / 100), 0),
    ),
    supplierState = String(input.supplier.gstin || "").slice(0, 2),
    buyerState = String(input.buyer?.gstin || "").slice(0, 2),
    intra = Boolean(
      supplierState && buyerState && supplierState === buyerState,
    ),
    cgst = intra ? money2(totalGst / 2) : 0,
    sgst = intra ? money2(totalGst - cgst) : 0,
    igst = intra ? 0 : totalGst,
    net = money2(subtotal + totalGst),
    roundOff = money2(Math.round(net) - net);
  return {
    ...input,
    items,
    charges,
    summary: {
      subtotal,
      igst,
      cgst,
      sgst,
      roundOff,
      grandTotal: Math.round(net),
    },
  };
}
export async function addPurchaseInward(userId: string, input: InwardInput) {
  input = normalizedInward(input);
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  if (!input.items?.length)
    throw new Error("At least one medicine item is required");
  if (!input.supplier?.name?.trim())
    throw new Error("Supplier name is required");
  if (
    input.sourceDocumentKey &&
    !input.sourceDocumentKey.startsWith(`purchase-documents/${m.tenantId}/`)
  )
    throw new Error("Invalid purchase document");
  const db = getDb(),
    now = Date.now();
  let [supplier] = await db
    .select()
    .from(suppliers)
    .where(
      and(
        eq(suppliers.tenantId, m.tenantId),
        eq(suppliers.name, input.supplier.name.trim()),
      ),
    )
    .limit(1);
  if (!supplier) {
    supplier = {
      id: crypto.randomUUID(),
      tenantId: m.tenantId,
      name: input.supplier.name.trim(),
      phone: input.supplier.phoneEmail?.trim() || "Not provided",
      gstin: input.supplier.gstin?.trim() || null,
      outstanding: 0,
      status: "Active",
      createdAt: now,
    };
    await db.insert(suppliers).values(supplier);
  }
  const inwardId = crypto.randomUUID(),
    inwardNo = await nextDocumentNumber(env.DB, m.tenantId, "purchase", `PIN-${new Date().getUTCFullYear()}-`);
  const header = {
    id: inwardId,
    tenantId: m.tenantId,
    inwardNo,
    supplierId: supplier.id,
    supplierName: input.supplier.name.trim(),
    supplierAddress: input.supplier.address || null,
    supplierGstin: input.supplier.gstin || null,
    supplierDlNo: input.supplier.dlNo || null,
    supplierPhoneEmail: input.supplier.phoneEmail || null,
    buyerName: input.buyer?.name || null,
    buyerAddress: input.buyer?.address || null,
    buyerGstin: input.buyer?.gstin || null,
    buyerDlNo: input.buyer?.dlNo || null,
    customerId: input.buyer?.customerId || null,
    orderNo: input.meta?.orderNo || null,
    invoiceNo: input.meta?.invoiceNo || null,
    invoiceDate:
      input.meta?.invoiceDate || new Date().toISOString().slice(0, 10),
    dueDate: input.meta?.dueDate || null,
    transportGrNo: input.meta?.transportGrNo || null,
    subtotal: Number(input.summary.subtotal || 0),
    igst: Number(input.summary.igst || 0),
    cgst: Number(input.summary.cgst || 0),
    sgst: Number(input.summary.sgst || 0),
    roundOff: Number(input.summary.roundOff || 0),
    grandTotal: Number(input.summary.grandTotal || 0),
    bankName: input.bank?.name || null,
    accountNumber: input.bank?.accountNumber || null,
    bankBranch: input.bank?.branch || null,
    ifsc: input.bank?.ifsc || null,
    status: input.status || "Pending",
    sourceDocumentKey: input.sourceDocumentKey || null,
    createdAt: now,
  };
  const existingMasters = await db
      .select()
      .from(productMasters)
      .where(eq(productMasters.tenantId, m.tenantId)),
    masterMap = new Map(existingMasters.map((x) => [x.name.toUpperCase(), x]));
  const existingBatches = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, m.tenantId)),
    batchMap = new Map(
      existingBatches.map((x) => [
        `${x.name}|${x.pack}|${x.batch}`.toUpperCase(),
        x,
      ]),
    );
  const statements = [db.insert(purchaseInwards).values(header)];
  for (const item of input.items) {
    if (
      !item.productName ||
      !item.batch ||
      !item.pack ||
      !item.expiry ||
      Number(item.billedQuantity) <= 0
    )
      throw new Error(
        `Complete required stock fields for row ${item.serialNo}`,
      );
    const expiryMatch = item.expiry.match(/^(\d{2})\/(\d{2})$/),
      expiryValue = expiryMatch
        ? `20${expiryMatch[2]}-${expiryMatch[1]}`
        : item.expiry;
    const masterKey = item.productName.trim().toUpperCase();
    let master = masterMap.get(masterKey);
    if (!master) {
      master = {
        id: crypto.randomUUID(),
        tenantId: m.tenantId,
        name: item.productName.trim(),
        composition: "",
        hsn: item.hsn.trim(),
        manufacturer: item.manufacturer.trim(),
        createdAt: now,
      };
      masterMap.set(masterKey, master);
      statements.push(db.insert(productMasters).values(master));
    }
    const batchKey = `${item.productName}|${item.pack}|${item.batch}`
      .trim()
      .toUpperCase();
    let batchRow = batchMap.get(batchKey);
    if (!batchRow) {
      batchRow = {
        id: crypto.randomUUID(),
        tenantId: m.tenantId,
        productMasterId: master.id,
        name: item.productName.trim(),
        hsn: item.hsn.trim(),
        manufacturer: item.manufacturer.trim(),
        pack: item.pack.trim(),
        batch: item.batch.trim(),
        expiry: expiryValue,
        stock: 0,
        purchaseRate: Number(item.netRate),
        mrp: Number(item.mrp),
        packMultiplier: 1,
        physicalStock: 0,
        landingCostPerUnit: 0,
        mrpPerUnit: 0,
        createdAt: now,
      };
      batchMap.set(batchKey, batchRow);
      statements.push(db.insert(products).values(batchRow));
    }
    const received =
        Number(item.billedQuantity) + Number(item.freeQuantity || 0),
      multiplier = packMultiplier(item.pack),
      physicalUnits = received * multiplier,
      landingCost = received
        ? money2((Number(item.lineTotal) + Number(item.gstAmount)) / received)
        : 0,
      mrpPerUnit = multiplier
        ? money2(Number(item.mrp) / multiplier)
        : Number(item.mrp);
    statements.push(
      db
        .insert(purchaseInwardItems)
        .values({
          id: crypto.randomUUID(),
          tenantId: m.tenantId,
          inwardId,
          productMasterId: master.id,
          productId: batchRow.id,
          serialNo: Number(item.serialNo),
          productName: item.productName.trim(),
          pack: item.pack.trim(),
          manufacturer: item.manufacturer.trim(),
          hsn: item.hsn.trim(),
          batch: item.batch.trim(),
          expiry: item.expiry,
          billedQuantity: Number(item.billedQuantity),
          freeQuantity: Number(item.freeQuantity || 0),
          mrp: Number(item.mrp),
          netRate: Number(item.netRate),
          gstRate: Number(item.gstRate || 0),
          gstAmount: Number(item.gstAmount || 0),
          lineTotal: Number(item.lineTotal),
          grossTotal: money2(
            Number(item.lineTotal) + Number(item.gstAmount || 0),
          ),
          packMultiplier: multiplier,
          physicalUnits,
          landingCostPerUnit: landingCost,
          mrpPerUnit,
          createdAt: now,
        }),
    );
    statements.push(
      db
        .update(products)
        .set({
          stock: batchRow.stock + received,
          physicalStock: batchRow.physicalStock + physicalUnits,
          packMultiplier: multiplier,
          landingCostPerUnit: landingCost,
          mrpPerUnit,
          purchaseRate: Number(item.netRate),
          mrp: Number(item.mrp),
          expiry: expiryValue,
        })
        .where(
          and(eq(products.id, batchRow.id), eq(products.tenantId, m.tenantId)),
        ),
    );
    batchRow = { ...batchRow, stock: batchRow.stock + received };
    batchMap.set(batchKey, batchRow);
  }
  for (const charge of input.charges || [])
    statements.push(
      db
        .insert(purchaseCharges)
        .values({
          id: crypto.randomUUID(),
          tenantId: m.tenantId,
          inwardId,
          kind: charge.kind,
          amount: Number(charge.amount || 0),
          hsn: charge.hsn || null,
          gstRate: Number(charge.gstRate || 0),
          createdAt: now,
        }),
    );
  if (header.status !== "Paid")
    statements.push(
      db
        .update(suppliers)
        .set({ outstanding: supplier.outstanding + header.grandTotal })
        .where(
          and(
            eq(suppliers.id, supplier.id),
            eq(suppliers.tenantId, m.tenantId),
          ),
        ),
    );
  await db.batch(statements);
  await audit(
    m.tenantId,
    userId,
    "purchase_inward.created",
    `${inwardNo} · ${input.items.length} items`,
  );
  await backup(m.tenantId);
  return header;
}

export async function getPurchaseInward(userId: string, id: string) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb();
  const [header] = await db
    .select()
    .from(purchaseInwards)
    .where(
      and(
        eq(purchaseInwards.id, id),
        eq(purchaseInwards.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!header) throw new Error("Purchase inward not found");
  const items = await db
    .select()
    .from(purchaseInwardItems)
    .where(
      and(
        eq(purchaseInwardItems.inwardId, id),
        eq(purchaseInwardItems.tenantId, member.tenantId),
      ),
    )
    .orderBy(purchaseInwardItems.serialNo);
  const charges = await db
    .select()
    .from(purchaseCharges)
    .where(
      and(
        eq(purchaseCharges.inwardId, id),
        eq(purchaseCharges.tenantId, member.tenantId),
      ),
    );
  return {
    header: { ...header, sourceDocumentKey: undefined },
    items,
    charges,
    hasDocument: Boolean(header.sourceDocumentKey),
  };
}

type InwardUpdate = {
  header: Record<string, unknown>;
  items: Array<{
    id: string;
    billedQuantity: number;
    freeQuantity: number;
    expiry: string;
    mrp: number;
    netRate: number;
    gstRate: number;
    gstAmount: number;
    lineTotal: number;
  }>;
};
export async function updatePurchaseInward(
  userId: string,
  id: string,
  input: InwardUpdate,
) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb();
  const [current] = await db
    .select()
    .from(purchaseInwards)
    .where(
      and(
        eq(purchaseInwards.id, id),
        eq(purchaseInwards.tenantId, member.tenantId),
      ),
    )
    .limit(1);
  if (!current) throw new Error("Purchase inward not found");
  const oldItems = await db
      .select()
      .from(purchaseInwardItems)
      .where(
        and(
          eq(purchaseInwardItems.inwardId, id),
          eq(purchaseInwardItems.tenantId, member.tenantId),
        ),
      ),
    oldMap = new Map(oldItems.map((x) => [x.id, x])),
    statements = [];
  for (const changed of input.items || []) {
    const old = oldMap.get(changed.id);
    if (!old) throw new Error("Invalid purchase item");
    const billed = Number(changed.billedQuantity),
      free = Number(changed.freeQuantity || 0),
      rate = Number(changed.netRate),
      taxable = money2(billed * rate),
      gstAmount = money2((taxable * Number(changed.gstRate || 0)) / 100);
    if (billed <= 0 || free < 0)
      throw new Error(`Invalid quantity for ${old.productName}`);
    const [batch] = await db
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, old.productId),
          eq(products.tenantId, member.tenantId),
        ),
      )
      .limit(1);
    if (!batch) throw new Error("Stock batch not found");
    const delta = billed + free - old.billedQuantity - old.freeQuantity,
      newStock = batch.stock + delta;
    if (newStock < 0)
      throw new Error(
        `Cannot reduce below already billed quantity for ${old.productName}`,
      );
    const expiryMatch = String(changed.expiry).match(/^(\d{2})\/(\d{2})$/),
      stockExpiry = expiryMatch
        ? `20${expiryMatch[2]}-${expiryMatch[1]}`
        : String(changed.expiry);
    statements.push(
      db
        .update(purchaseInwardItems)
        .set({
          billedQuantity: billed,
          freeQuantity: free,
          expiry: String(changed.expiry),
          mrp: Number(changed.mrp),
          netRate: Number(changed.netRate),
          gstRate: Number(changed.gstRate),
          gstAmount,
          lineTotal: taxable,
        })
        .where(
          and(
            eq(purchaseInwardItems.id, old.id),
            eq(purchaseInwardItems.tenantId, member.tenantId),
          ),
        ),
    );
    statements.push(
      db
        .update(products)
        .set({
          stock: newStock,
          physicalStock:
            batch.physicalStock + delta * (batch.packMultiplier || 1),
          expiry: stockExpiry,
          mrp: Number(changed.mrp),
          purchaseRate: rate,
        })
        .where(
          and(
            eq(products.id, batch.id),
            eq(products.tenantId, member.tenantId),
          ),
        ),
    );
  }
  const h = input.header || {},
    charges = await db
      .select()
      .from(purchaseCharges)
      .where(
        and(
          eq(purchaseCharges.inwardId, id),
          eq(purchaseCharges.tenantId, member.tenantId),
        ),
      ),
    subtotal = money2(
      (input.items || []).reduce(
        (s, x) => s + Number(x.billedQuantity) * Number(x.netRate),
        0,
      ) + charges.reduce((s, x) => s + x.amount, 0),
    ),
    totalGst = money2(
      (input.items || []).reduce(
        (s, x) =>
          s +
          (Number(x.billedQuantity) *
            Number(x.netRate) *
            Number(x.gstRate || 0)) /
            100,
        0,
      ) + charges.reduce((s, x) => s + (x.amount * x.gstRate) / 100, 0),
    ),
    supplierState = String(
      h.supplierGstin ?? current.supplierGstin ?? "",
    ).slice(0, 2),
    buyerState = String(h.buyerGstin ?? current.buyerGstin ?? "").slice(0, 2),
    intra = Boolean(
      supplierState && buyerState && supplierState === buyerState,
    ),
    cgst = intra ? money2(totalGst / 2) : 0,
    sgst = intra ? money2(totalGst - cgst) : 0,
    igst = intra ? 0 : totalGst,
    net = money2(subtotal + totalGst),
    roundOff = money2(Math.round(net) - net),
    newTotal = Math.round(net),
    newStatus = String(h.status ?? current.status),
    oldPayable = current.status === "Paid" ? 0 : current.grandTotal,
    newPayable = newStatus === "Paid" ? 0 : newTotal;
  if (current.supplierId && newPayable !== oldPayable) {
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, current.supplierId),
          eq(suppliers.tenantId, member.tenantId),
        ),
      )
      .limit(1);
    if (supplier)
      statements.push(
        db
          .update(suppliers)
          .set({
            outstanding: Math.max(
              0,
              supplier.outstanding + newPayable - oldPayable,
            ),
          })
          .where(
            and(
              eq(suppliers.id, supplier.id),
              eq(suppliers.tenantId, member.tenantId),
            ),
          ),
      );
  }
  statements.push(
    db
      .update(purchaseInwards)
      .set({
        supplierAddress:
          String(h.supplierAddress ?? current.supplierAddress ?? "") || null,
        supplierGstin:
          String(h.supplierGstin ?? current.supplierGstin ?? "") || null,
        supplierDlNo:
          String(h.supplierDlNo ?? current.supplierDlNo ?? "") || null,
        supplierPhoneEmail:
          String(h.supplierPhoneEmail ?? current.supplierPhoneEmail ?? "") ||
          null,
        buyerName: String(h.buyerName ?? current.buyerName ?? "") || null,
        buyerAddress:
          String(h.buyerAddress ?? current.buyerAddress ?? "") || null,
        buyerGstin: String(h.buyerGstin ?? current.buyerGstin ?? "") || null,
        buyerDlNo: String(h.buyerDlNo ?? current.buyerDlNo ?? "") || null,
        customerId: String(h.customerId ?? current.customerId ?? "") || null,
        orderNo: String(h.orderNo ?? current.orderNo ?? "") || null,
        invoiceNo: String(h.invoiceNo ?? current.invoiceNo ?? "") || null,
        invoiceDate: String(h.invoiceDate ?? current.invoiceDate ?? "") || null,
        dueDate: String(h.dueDate ?? current.dueDate ?? "") || null,
        transportGrNo:
          String(h.transportGrNo ?? current.transportGrNo ?? "") || null,
        subtotal,
        igst,
        cgst,
        sgst,
        roundOff,
        grandTotal: newTotal,
        bankName: String(h.bankName ?? current.bankName ?? "") || null,
        accountNumber:
          String(h.accountNumber ?? current.accountNumber ?? "") || null,
        bankBranch: String(h.bankBranch ?? current.bankBranch ?? "") || null,
        ifsc: String(h.ifsc ?? current.ifsc ?? "") || null,
        status: newStatus,
      })
      .where(
        and(
          eq(purchaseInwards.id, id),
          eq(purchaseInwards.tenantId, member.tenantId),
        ),
      ),
  );
  await db.batch(statements);
  await audit(
    member.tenantId,
    userId,
    "purchase_inward.updated",
    current.inwardNo,
  );
  await backup(member.tenantId);
  return getPurchaseInward(userId, id);
}

export async function addCustomer(
  userId: string,
  input: {
    name: string;
    legalName?: string;
    tradeName?: string;
    phone: string;
    gstin?: string;
    dlNo?: string;
    address?: string;
    city?: string;
    state?: string;
    stateCode?: string;
    pinCode?: string;
    registrationStatus?: string;
  },
) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  const row = {
    id: crypto.randomUUID(),
    tenantId: member.tenantId,
    name: input.name.trim(),
    legalName: input.legalName?.trim() || null,
    tradeName: input.tradeName?.trim() || input.name.trim(),
    phone: input.phone.trim(),
    gstin: input.gstin?.trim().toUpperCase() || null,
    dlNo: input.dlNo?.trim().toUpperCase() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    stateCode: input.stateCode?.trim() || input.gstin?.slice(0, 2) || null,
    pinCode: input.pinCode?.trim() || null,
    registrationStatus: input.registrationStatus?.trim() || "Unverified",
    outstanding: 0,
    status: "Active",
    createdAt: Date.now(),
  };
  await getDb().insert(customers).values(row);
  await audit(member.tenantId, userId, "customer.created", row.name);
  await backup(member.tenantId);
  return row;
}

export async function addProduct(
  userId: string,
  input: {
    name: string;
    composition?: string;
    hsn?: string;
    manufacturer: string;
    marketedBy?: string;
    pack?: string;
    batch?: string;
    mfgDate?: string;
    expiry?: string;
    mrp?: number | string;
    isScheduleH1?: boolean;
    isPrescriptionRequired?: boolean;
    isHighCaution?: boolean;
    cautionNotes?: string;
  },
) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  const flagged = Boolean(
      input.isScheduleH1 ||
        input.isPrescriptionRequired ||
        input.isHighCaution,
    ),
    cautionNotes = input.cautionNotes?.trim() || "";
  if (flagged && (!cautionNotes || cautionNotes.length > 280))
    throw new Error(
      "Flagged medicines require a concise caution note of no more than 280 characters",
    );
  const now = Date.now(),
    row = {
      id: crypto.randomUUID(),
      tenantId: member.tenantId,
      name: input.name.trim(),
      composition: input.composition?.trim() || "",
      defaultPack: input.pack?.trim() || "",
      hsn: input.hsn?.trim() || "",
      manufacturer: input.manufacturer.trim(),
      marketedBy: input.marketedBy?.trim() || "",
      isScheduleH1: Boolean(input.isScheduleH1),
      isPrescriptionRequired: Boolean(
        input.isPrescriptionRequired || input.isScheduleH1,
      ),
      isHighCaution: Boolean(input.isHighCaution),
      cautionNotes,
      createdAt: now,
    },
    statements: any[] = [getDb().insert(productMasters).values(row)];
  if (input.batch?.trim() && input.pack?.trim()) {
    const match = String(input.expiry || "").match(/^(\d{2})[\/-](\d{4})$/),
      expiry = match ? `${match[2]}-${match[1]}` : String(input.expiry || "");
    const mfgMatch = String(input.mfgDate || "").match(/^(\d{2})[\/-](\d{4})$/),
      mfgDate = mfgMatch
        ? `${mfgMatch[2]}-${mfgMatch[1]}`
        : String(input.mfgDate || "");
    if (!expiry) throw new Error("Enter expiry for the scanned batch");
    const multiplier = packMultiplier(input.pack);
    statements.push(
      getDb()
        .insert(products)
        .values({
          id: crypto.randomUUID(),
          tenantId: member.tenantId,
          productMasterId: row.id,
          name: row.name,
          hsn: row.hsn,
          manufacturer: row.manufacturer,
          pack: input.pack.trim(),
          batch: input.batch.trim().toUpperCase(),
          mfgDate,
          expiry,
          stock: 0,
          physicalStock: 0,
          purchaseRate: 0,
          mrp: Number(input.mrp) || 0,
          packMultiplier: multiplier,
          landingCostPerUnit: 0,
          mrpPerUnit: multiplier
            ? money2((Number(input.mrp) || 0) / multiplier)
            : 0,
          saleRate: 0,
          createdAt: now,
        }),
    );
  }
  await getDb().batch(statements);
  await audit(member.tenantId, userId, "product_master.created", row.name);
  await backup(member.tenantId);
  return row;
}

type SaleInput = {
  customerId: string;
  invoiceType?: string;
  invoiceDate?: string;
  invoiceTime?: string;
  paymentMode?: string;
  dueDate?: string;
  paymentTerms?: string;
  sellerStateCode?: string;
  transportName?: string;
  vehicleNo?: string;
  lrNo?: string;
  freightAmount?: number;
  freightGstRate?: number;
  insuranceAmount?: number;
  insuranceGstRate?: number;
  cashDiscountType?: "percent" | "flat";
  cashDiscount?: number;
  status?: string;
  prescriptionDoctorName?: string;
  prescriptionDoctorRegistration?: string;
  complianceAcknowledged?: boolean;
  items: Array<{
    productId: string;
    quantity: number;
    freeQuantity: number;
    unitRate: number;
    discountPercent: number;
    gstRate: number;
  }>;
};
function enforcePrescriptionCompliance(
  input: SaleInput,
  selectedProducts: Array<typeof products.$inferSelect>,
  masters: Array<typeof productMasters.$inferSelect>,
) {
  const masterMap = new Map(masters.map((m) => [m.id, m]));
  const flagged = selectedProducts
    .map((p) => (p.productMasterId ? masterMap.get(p.productMasterId) : undefined))
    .filter(
      (m) =>
        m &&
        (m.isScheduleH1 || m.isPrescriptionRequired || m.isHighCaution),
    );
  if (!flagged.length) return false;
  if (!input.complianceAcknowledged)
    throw new Error("Acknowledge the regulatory medicine warning before billing");
  if (
    !input.prescriptionDoctorName?.trim() ||
    !input.prescriptionDoctorRegistration?.trim()
  )
    throw new Error(
      "Doctor name and RMP registration number are required for this prescription sale",
    );
  return true;
}
function words(n: number) {
  const one = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ],
    ten = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ],
    under = (x: number): string =>
      x < 20
        ? one[x]
        : ten[Math.floor(x / 10)] + (x % 10 ? " " + one[x % 10] : ""),
    hundred = (x: number) =>
      x < 100
        ? under(x)
        : one[Math.floor(x / 100)] +
          " Hundred" +
          (x % 100 ? " " + under(x % 100) : "");
  let x = Math.max(0, Math.round(n)),
    out = "";
  for (const [v, name] of [
    [10000000, "Crore"],
    [100000, "Lakh"],
    [1000, "Thousand"],
  ] as const)
    if (x >= v) {
      out += hundred(Math.floor(x / v)) + " " + name + " ";
      x %= v;
    }
  return (out + hundred(x)).trim() + " Rupees Only";
}
export async function addInvoice(userId: string, input: SaleInput) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  if (!input.items?.length) throw new Error("Add at least one product row");
  const db = getDb(),
    [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, input.customerId),
          eq(customers.tenantId, member.tenantId),
        ),
      )
      .limit(1);
  if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
  const productRows = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, member.tenantId)),
    masterRows = await db
      .select()
      .from(productMasters)
      .where(eq(productMasters.tenantId, member.tenantId)),
    productMap = new Map(productRows.map((p) => [p.id, p])),
    now = Date.now(),
    lineRows = [],
    stockUpdates = [];
  const selectedProducts = input.items
    .map((item) => productMap.get(item.productId))
    .filter((p): p is (typeof productRows)[number] => Boolean(p));
  const complianceRequired = enforcePrescriptionCompliance(
    input,
    selectedProducts,
    masterRows,
  );
  let grossTaxable = 0,
    lineDiscount = 0,
    totalGst = 0,
    totalQuantity = 0;
  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i],
      p = productMap.get(item.productId);
    if (!p) throw new Error(`Select a valid product and batch in row ${i + 1}`);
    const qty = Math.max(0, Number(item.quantity) || 0),
      free = Math.max(0, Number(item.freeQuantity) || 0),
      used = qty + free;
    if (qty <= 0) throw new Error(`Enter billed quantity in row ${i + 1}`);
    if (used > p.stock)
      throw new Error(
        `${p.name} batch ${p.batch}: only ${p.stock} available, requested ${used}`,
      );
    const rate = Math.max(0, Number(item.unitRate) || 0),
      gross = money2(qty * rate),
      discount = money2(
        (gross * Math.max(0, Number(item.discountPercent) || 0)) / 100,
      ),
      taxable = money2(gross - discount),
      gstRate = Math.max(0, Number(item.gstRate) || 0),
      gstAmount = money2((taxable * gstRate) / 100);
    grossTaxable += taxable;
    lineDiscount += discount;
    totalGst += gstAmount;
    totalQuantity += used;
    lineRows.push({
      id: crypto.randomUUID(),
      tenantId: member.tenantId,
      invoiceId: "",
      customerId: customer.id,
      productId: p.id,
      productName: p.name,
      batch: p.batch,
      pack: p.pack,
      manufacturer: p.manufacturer,
      hsn: p.hsn,
      expiry: p.expiry,
      mrp: p.mrp,
      availableStock: p.stock,
      quantity: qty,
      freeQuantity: free,
      unitRate: rate,
      discountPercent: Number(item.discountPercent) || 0,
      discountAmount: discount,
      gstRate,
      taxableAmount: taxable,
      gstAmount,
      lineTotal: money2(taxable + gstAmount),
      createdAt: now,
    });
    stockUpdates.push(
      db
        .update(products)
        .set({ stock: p.stock - used })
        .where(
          and(eq(products.id, p.id), eq(products.tenantId, member.tenantId)),
        ),
    );
  }
  const freight = money2(Number(input.freightAmount) || 0),
    insurance = money2(Number(input.insuranceAmount) || 0),
    chargeGst = money2(
      (freight * (Number(input.freightGstRate) || 0)) / 100 +
        (insurance * (Number(input.insuranceGstRate) || 0)) / 100,
    ),
    beforeDiscount = money2(grossTaxable + freight + insurance),
    discountInput = Math.max(0, Number(input.cashDiscount) || 0),
    cashDiscount = money2(
      input.cashDiscountType === "percent"
        ? (beforeDiscount * discountInput) / 100
        : discountInput,
    ),
    taxableAfterDiscount = Math.max(0, money2(beforeDiscount - cashDiscount)),
    gstBeforeCash = money2(totalGst + chargeGst),
    gstScale = beforeDiscount ? taxableAfterDiscount / beforeDiscount : 1,
    totalTax = money2(gstBeforeCash * gstScale),
    seller = String(input.sellerStateCode || "36").padStart(2, "0"),
    buyer = String(
      customer.stateCode || customer.gstin?.slice(0, 2) || "",
    ).padStart(2, "0"),
    intra = Boolean(buyer && seller === buyer),
    cgst = intra ? money2(totalTax / 2) : 0,
    sgst = intra ? money2(totalTax - cgst) : 0,
    igst = intra ? 0 : totalTax,
    net = money2(taxableAfterDiscount + totalTax),
    roundOff = money2(Math.round(net) - net),
    amount = Math.round(net),
    id = crypto.randomUUID(),
    invoiceNo = await nextDocumentNumber(env.DB, member.tenantId, "sale", `INV-${String(new Date().getUTCFullYear()).slice(-2)}-`);
  for (const line of lineRows) line.invoiceId = id;
  const row = {
    id,
    tenantId: member.tenantId,
    invoiceNo,
    customerId: customer.id,
    customerName: customer.name,
    amount,
    status:
      input.status ||
      ((input.paymentMode || "Credit") === "Credit" ? "Pending" : "Paid"),
    invoiceDate: input.invoiceDate || new Date().toISOString().slice(0, 10),
    invoiceTime: input.invoiceTime || new Date().toISOString().slice(11, 16),
    invoiceType: input.invoiceType || "Tax Invoice",
    paymentMode: input.paymentMode || "Credit",
    dueDate: input.dueDate || null,
    paymentTerms: input.paymentTerms || null,
    sellerStateCode: seller,
    buyerStateCode: buyer || null,
    transportName: input.transportName || null,
    vehicleNo: input.vehicleNo || null,
    lrNo: input.lrNo || null,
    prescriptionDoctorName: complianceRequired
      ? input.prescriptionDoctorName?.trim() || null
      : null,
    prescriptionDoctorRegistration: complianceRequired
      ? input.prescriptionDoctorRegistration?.trim().toUpperCase() || null
      : null,
    complianceAcknowledged: complianceRequired,
    freightAmount: freight,
    freightGstRate: Number(input.freightGstRate) || 0,
    insuranceAmount: insurance,
    insuranceGstRate: Number(input.insuranceGstRate) || 0,
    grossTaxable: money2(grossTaxable),
    lineDiscount: money2(lineDiscount),
    cashDiscount,
    cgst,
    sgst,
    igst,
    roundOff,
    amountInWords: words(amount),
    totalQuantity,
    createdAt: now,
  };
  await db.batch([
    db.insert(invoices).values(row),
    ...lineRows.map((line) => db.insert(invoiceLines).values(line)),
    ...stockUpdates,
    ...(row.status !== "Paid"
      ? [
          db
            .update(customers)
            .set({ outstanding: customer.outstanding + amount })
            .where(
              and(
                eq(customers.id, customer.id),
                eq(customers.tenantId, member.tenantId),
              ),
            ),
        ]
      : []),
  ]);
  await audit(
    member.tenantId,
    userId,
    "invoice.created",
    `${invoiceNo} · ${lineRows.length} items`,
  );
  await backup(member.tenantId);
  return row;
}

export async function addSupplier(
  userId: string,
  input: {
    name: string;
    legalName?: string;
    tradeName?: string;
    phone: string;
    gstin?: string;
    dlNo?: string;
    address?: string;
    city?: string;
    state?: string;
    stateCode?: string;
    pinCode?: string;
    registrationStatus?: string;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const row = {
    id: crypto.randomUUID(),
    tenantId: m.tenantId,
    name: input.name.trim(),
    legalName: input.legalName?.trim() || null,
    tradeName: input.tradeName?.trim() || input.name.trim(),
    phone: input.phone.trim(),
    gstin: input.gstin?.trim().toUpperCase() || null,
    dlNo: input.dlNo?.trim().toUpperCase() || null,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    stateCode: input.stateCode?.trim() || input.gstin?.slice(0, 2) || null,
    pinCode: input.pinCode?.trim() || null,
    registrationStatus: input.registrationStatus?.trim() || "Unverified",
    outstanding: 0,
    status: "Active",
    createdAt: Date.now(),
  };
  await getDb().insert(suppliers).values(row);
  await audit(m.tenantId, userId, "supplier.created", row.name);
  await backup(m.tenantId);
  return row;
}

export async function addPurchase(
  userId: string,
  input: {
    supplierId: string;
    productMasterId: string;
    pack: string;
    batch: string;
    expiry: string;
    mrp: number;
    quantity: number;
    unitCost: number;
    gstRate: number;
    status?: string;
    sourceDocumentKey?: string;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb();
  const [s] = await db
    .select()
    .from(suppliers)
    .where(
      and(
        eq(suppliers.id, input.supplierId),
        eq(suppliers.tenantId, m.tenantId),
      ),
    )
    .limit(1);
  const [master] = await db
    .select()
    .from(productMasters)
    .where(
      and(
        eq(productMasters.id, input.productMasterId),
        eq(productMasters.tenantId, m.tenantId),
      ),
    )
    .limit(1);
  if (!s || !master) throw new Error("Select a valid supplier and product");
  if (
    input.sourceDocumentKey &&
    !input.sourceDocumentKey.startsWith(`purchase-documents/${m.tenantId}/`)
  )
    throw new Error("Invalid purchase document");
  let [batchRow] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.tenantId, m.tenantId),
        eq(products.productMasterId, master.id),
        eq(products.batch, input.batch.trim()),
        eq(products.pack, input.pack.trim()),
      ),
    )
    .limit(1);
  const now = Date.now();
  if (!batchRow) {
    batchRow = {
      id: crypto.randomUUID(),
      tenantId: m.tenantId,
      productMasterId: master.id,
      name: master.name,
      hsn: master.hsn,
      manufacturer: master.manufacturer,
      pack: input.pack.trim(),
      batch: input.batch.trim(),
      expiry: input.expiry,
      stock: 0,
      purchaseRate: input.unitCost,
      mrp: input.mrp,
      createdAt: now,
    };
    await db.insert(products).values(batchRow);
  }
  const count = (
    await db.select().from(purchases).where(eq(purchases.tenantId, m.tenantId))
  ).length;
  const base = input.quantity * input.unitCost,
    amount = base + (base * input.gstRate) / 100;
  const row = {
    id: crypto.randomUUID(),
    tenantId: m.tenantId,
    purchaseNo: `PUR-${new Date().getUTCFullYear()}-${String(count + 1).padStart(4, "0")}`,
    supplierId: s.id,
    supplierName: s.name,
    productId: batchRow.id,
    productName: master.name,
    quantity: input.quantity,
    unitCost: input.unitCost,
    gstRate: input.gstRate,
    amount,
    status: input.status || "Pending",
    purchaseDate: new Date().toISOString().slice(0, 10),
    sourceDocumentKey: input.sourceDocumentKey || null,
    createdAt: now,
  };
  await db.batch([
    db.insert(purchases).values(row),
    db
      .update(products)
      .set({
        stock: batchRow.stock + input.quantity,
        purchaseRate: input.unitCost,
        mrp: input.mrp,
        expiry: input.expiry,
      })
      .where(
        and(eq(products.id, batchRow.id), eq(products.tenantId, m.tenantId)),
      ),
    ...(row.status !== "Paid"
      ? [
          db
            .update(suppliers)
            .set({ outstanding: s.outstanding + amount })
            .where(
              and(eq(suppliers.id, s.id), eq(suppliers.tenantId, m.tenantId)),
            ),
        ]
      : []),
  ]);
  await audit(m.tenantId, userId, "purchase.created", row.purchaseNo);
  await backup(m.tenantId);
  return row;
}

export async function addPayment(
  userId: string,
  input: {
    type: string;
    partyId: string;
    amount: number;
    method: string;
    notes?: string;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb(),
    receipt = input.type === "Customer receipt";
  const [party] = receipt
    ? await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, input.partyId),
            eq(customers.tenantId, m.tenantId),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.id, input.partyId),
            eq(suppliers.tenantId, m.tenantId),
          ),
        )
        .limit(1);
  if (!party) throw new Error("Select a valid party");
  const count = (
    await db.select().from(payments).where(eq(payments.tenantId, m.tenantId))
  ).length;
  const row = {
    id: crypto.randomUUID(),
    tenantId: m.tenantId,
    paymentNo: `PAY-${new Date().getUTCFullYear()}-${String(count + 1).padStart(4, "0")}`,
    type: input.type,
    partyId: party.id,
    partyName: party.name,
    amount: input.amount,
    method: input.method,
    paymentDate: new Date().toISOString().slice(0, 10),
    notes: input.notes || null,
    createdAt: Date.now(),
  };
  await db.insert(payments).values(row);
  if (receipt)
    await db
      .update(customers)
      .set({ outstanding: Math.max(0, party.outstanding - input.amount) })
      .where(
        and(eq(customers.id, party.id), eq(customers.tenantId, m.tenantId)),
      );
  else
    await db
      .update(suppliers)
      .set({ outstanding: Math.max(0, party.outstanding - input.amount) })
      .where(
        and(eq(suppliers.id, party.id), eq(suppliers.tenantId, m.tenantId)),
      );
  await audit(m.tenantId, userId, "payment.created", row.paymentNo);
  await backup(m.tenantId);
  return row;
}

export async function addReturn(
  userId: string,
  input: {
    type: string;
    partyId: string;
    referenceNo: string;
    amount: number;
    reason: string;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb(),
    sale = input.type === "Sales return";
  const [party] = sale
    ? await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, input.partyId),
            eq(customers.tenantId, m.tenantId),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.id, input.partyId),
            eq(suppliers.tenantId, m.tenantId),
          ),
        )
        .limit(1);
  if (!party) throw new Error("Select a valid party");
  const count = (
    await db.select().from(returns).where(eq(returns.tenantId, m.tenantId))
  ).length;
  const row = {
    id: crypto.randomUUID(),
    tenantId: m.tenantId,
    returnNo: `RET-${new Date().getUTCFullYear()}-${String(count + 1).padStart(4, "0")}`,
    type: input.type,
    partyId: party.id,
    partyName: party.name,
    referenceNo: input.referenceNo.trim(),
    amount: input.amount,
    reason: input.reason.trim(),
    returnDate: new Date().toISOString().slice(0, 10),
    createdAt: Date.now(),
  };
  await db.insert(returns).values(row);
  await audit(m.tenantId, userId, "return.created", row.returnNo);
  await backup(m.tenantId);
  return row;
}

async function audit(
  tenantId: string,
  userId: string,
  action: string,
  details: string,
) {
  await getDb()
    .insert(auditLogs)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      action,
      details,
      createdAt: Date.now(),
    });
}

async function snapshotFor(tenantId: string) {
  const db = getDb();
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return {
    format: "medibill-pro-backup",
    version: 2,
    tenantId,
    createdAt: new Date().toISOString(),
    agency: tenant,
    agencyProfiles: await db
      .select()
      .from(agencyProfiles)
      .where(eq(agencyProfiles.tenantId, tenantId)),
    customers: await db
      .select()
      .from(customers)
      .where(eq(customers.tenantId, tenantId)),
    products: await db
      .select()
      .from(products)
      .where(eq(products.tenantId, tenantId)),
    productMasters: await db
      .select()
      .from(productMasters)
      .where(eq(productMasters.tenantId, tenantId)),
    invoices: await db
      .select()
      .from(invoices)
      .where(eq(invoices.tenantId, tenantId)),
    invoiceLines: await db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.tenantId, tenantId)),
    suppliers: await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.tenantId, tenantId)),
    purchases: await db
      .select()
      .from(purchases)
      .where(eq(purchases.tenantId, tenantId)),
    purchaseInwards: await db
      .select()
      .from(purchaseInwards)
      .where(eq(purchaseInwards.tenantId, tenantId)),
    purchaseInwardItems: await db
      .select()
      .from(purchaseInwardItems)
      .where(eq(purchaseInwardItems.tenantId, tenantId)),
    purchaseCharges: await db
      .select()
      .from(purchaseCharges)
      .where(eq(purchaseCharges.tenantId, tenantId)),
    stockAdjustments: await db
      .select()
      .from(stockAdjustments)
      .where(eq(stockAdjustments.tenantId, tenantId)),
    payments: await db
      .select()
      .from(payments)
      .where(eq(payments.tenantId, tenantId)),
    returns: await db
      .select()
      .from(returns)
      .where(eq(returns.tenantId, tenantId)),
  };
}
async function sha256(body: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  return Array.from(new Uint8Array(bytes))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function backup(tenantId: string) {
  if (!env.BUCKET) return;
  const body = JSON.stringify(await snapshotFor(tenantId));
  await env.BUCKET.put(`backups/${tenantId}/latest.json`, body, {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function backupOverview(userId: string) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb();
  let [settings] = await db
    .select()
    .from(backupSettings)
    .where(eq(backupSettings.tenantId, m.tenantId))
    .limit(1);
  if (!settings) {
    settings = {
      tenantId: m.tenantId,
      enabled: true,
      frequency: "daily",
      retention: 14,
      storageTarget: "cloud_local",
      updatedAt: Date.now(),
    };
    await db.insert(backupSettings).values(settings);
  }
  const records = await db
    .select()
    .from(backupRecords)
    .where(eq(backupRecords.tenantId, m.tenantId))
    .orderBy(desc(backupRecords.createdAt))
    .limit(30);
  return { settings, records };
}
export async function updateBackupSettings(
  userId: string,
  input: {
    enabled: boolean;
    frequency: string;
    retention: number;
    storageTarget: string;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const row = {
    tenantId: m.tenantId,
    enabled: Boolean(input.enabled),
    frequency: input.frequency === "weekly" ? "weekly" : "daily",
    retention: Math.min(30, Math.max(7, Number(input.retention) || 14)),
    storageTarget: ["cloud_local", "local", "google_drive", "aws_s3"].includes(
      input.storageTarget,
    )
      ? input.storageTarget
      : "cloud_local",
    updatedAt: Date.now(),
  };
  await getDb()
    .insert(backupSettings)
    .values(row)
    .onConflictDoUpdate({ target: backupSettings.tenantId, set: row });
  await audit(
    m.tenantId,
    userId,
    "backup.settings_updated",
    `${row.frequency}, retain ${row.retention}`,
  );
  return row;
}
export async function createFullBackup(userId: string, kind = "manual") {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  if (!env.BUCKET) throw new Error("Cloud backup storage is unavailable");
  const snapshot = await snapshotFor(m.tenantId),
    body = JSON.stringify(snapshot),
    stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .slice(0, 15),
    fileName = `medibill_backup_${stamp}.json`,
    id = crypto.randomUUID(),
    objectKey = `backups/${m.tenantId}/${id}.json`,
    checksum = await sha256(body),
    row = {
      id,
      tenantId: m.tenantId,
      fileName,
      objectKey,
      kind,
      sizeBytes: new TextEncoder().encode(body).byteLength,
      checksum,
      productCount: snapshot.productMasters.length,
      purchaseCount:
        snapshot.purchaseInwards.length + snapshot.purchases.length,
      salesCount: snapshot.invoices.length,
      batchCount: snapshot.products.length,
      createdBy: userId,
      createdAt: Date.now(),
    };
  await env.BUCKET.put(objectKey, body, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { checksum },
  });
  await getDb().insert(backupRecords).values(row);
  const [settings] = await getDb()
      .select()
      .from(backupSettings)
      .where(eq(backupSettings.tenantId, m.tenantId))
      .limit(1),
    keep = settings?.retention || 14,
    old = await getDb()
      .select()
      .from(backupRecords)
      .where(eq(backupRecords.tenantId, m.tenantId))
      .orderBy(desc(backupRecords.createdAt));
  for (const x of old.slice(keep)) {
    await env.BUCKET.delete(x.objectKey);
    await getDb()
      .delete(backupRecords)
      .where(
        and(eq(backupRecords.id, x.id), eq(backupRecords.tenantId, m.tenantId)),
      );
  }
  await audit(m.tenantId, userId, "backup.created", fileName);
  return { ...row, downloadUrl: `/api/backups/${id}/download` };
}
export async function getBackupFile(userId: string, id: string) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const [row] = await getDb()
    .select()
    .from(backupRecords)
    .where(
      and(eq(backupRecords.id, id), eq(backupRecords.tenantId, m.tenantId)),
    )
    .limit(1);
  if (!row) throw new Error("Backup not found");
  const object = await env.BUCKET.get(row.objectKey);
  if (!object) throw new Error("Backup file is missing");
  return { row, object };
}
export const validateBackupPayload = validateRestoreSnapshot;
export async function restoreFullBackup(
  userId: string,
  raw: unknown,
  confirmation: string,
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  requireRestoreAdmin(m);
  if (confirmation !== "RESTORE") throw new Error("Type RESTORE to confirm");
  const x = validateBackupPayload(raw, m.tenantId);
  await createFullBackup(userId, "pre_restore");
  const db = getDb(),
    del = [
      db
        .delete(purchaseCharges)
        .where(eq(purchaseCharges.tenantId, m.tenantId)),
      db
        .delete(purchaseInwardItems)
        .where(eq(purchaseInwardItems.tenantId, m.tenantId)),
      db
        .delete(purchaseInwards)
        .where(eq(purchaseInwards.tenantId, m.tenantId)),
      db.delete(invoiceLines).where(eq(invoiceLines.tenantId, m.tenantId)),
      db.delete(invoices).where(eq(invoices.tenantId, m.tenantId)),
      db.delete(purchases).where(eq(purchases.tenantId, m.tenantId)),
      db.delete(returns).where(eq(returns.tenantId, m.tenantId)),
      db.delete(payments).where(eq(payments.tenantId, m.tenantId)),
      db
        .delete(stockAdjustments)
        .where(eq(stockAdjustments.tenantId, m.tenantId)),
      db.delete(products).where(eq(products.tenantId, m.tenantId)),
      db.delete(productMasters).where(eq(productMasters.tenantId, m.tenantId)),
      db.delete(customers).where(eq(customers.tenantId, m.tenantId)),
      db.delete(suppliers).where(eq(suppliers.tenantId, m.tenantId)),
    ];
  const ins: any[] = [];
  for (const r of x.customers) ins.push(db.insert(customers).values(r));
  for (const r of x.suppliers) ins.push(db.insert(suppliers).values(r));
  for (const r of x.productMasters)
    ins.push(db.insert(productMasters).values(r));
  for (const r of x.products) ins.push(db.insert(products).values(r));
  for (const r of x.invoices) ins.push(db.insert(invoices).values(r));
  for (const r of x.invoiceLines) ins.push(db.insert(invoiceLines).values(r));
  for (const r of x.purchases) ins.push(db.insert(purchases).values(r));
  for (const r of x.purchaseInwards)
    ins.push(db.insert(purchaseInwards).values(r));
  for (const r of x.purchaseInwardItems)
    ins.push(db.insert(purchaseInwardItems).values(r));
  for (const r of x.purchaseCharges)
    ins.push(db.insert(purchaseCharges).values(r));
  for (const r of x.payments) ins.push(db.insert(payments).values(r));
  for (const r of x.returns) ins.push(db.insert(returns).values(r));
  for (const r of x.stockAdjustments)
    ins.push(db.insert(stockAdjustments).values(r));
  // Recheck authorization inside the atomic batch, including during role revocation.
  const restoreAudit = db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tenantId: m.tenantId, userId, action: "backup.restored",
    details: String(x.createdAt), createdAt: sql`CASE WHEN EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND tenant_id = ${m.tenantId} AND status = 'active' AND role IN ('admin', 'super_admin')) THEN ${Date.now()} ELSE NULL END`,
  });
  await db.batch([restoreAudit, ...del, ...ins]);
  // A failed secondary snapshot must not report a committed restore as a failure.
  try { await backup(m.tenantId); }
  catch { console.error("Post-restore snapshot failed; pre-restore backup retained"); }
  return {
    restoredAt: x.createdAt,
    counts: {
      products: x.productMasters.length,
      purchases: x.purchaseInwards.length + x.purchases.length,
      sales: x.invoices.length,
      batches: x.products.length,
    },
  };
}

export async function resetTestData(
  userId: string,
  input: {
    confirm_wipe?: boolean;
    confirmation_phrase?: string;
    tenant_id?: string;
  },
) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  if (member.role !== "super_admin")
    throw new Error("Super Admin access required");
  if (input.confirm_wipe !== true) throw new Error("confirm_wipe must be true");
  if (input.confirmation_phrase !== "WIPE TEST DATA") {
    throw new Error("Type WIPE TEST DATA to confirm");
  }
  if (input.tenant_id && input.tenant_id !== member.tenantId) {
    throw new Error("Tenant confirmation does not match your firm");
  }

  // Fail closed: no destructive work starts unless the recovery snapshot succeeds.
  const recoveryBackup = await createFullBackup(userId, "pre_test_data_reset");
  const db = getDb();

  // D1 batch execution is atomic. Child/ledger rows are removed before their
  // parent records so foreign-key enforcement can remain enabled throughout.
  await db.batch([
    db
      .delete(purchaseCharges)
      .where(eq(purchaseCharges.tenantId, member.tenantId)),
    db
      .delete(purchaseInwardItems)
      .where(eq(purchaseInwardItems.tenantId, member.tenantId)),
    db.delete(invoiceLines).where(eq(invoiceLines.tenantId, member.tenantId)),
    db
      .delete(stockAdjustments)
      .where(eq(stockAdjustments.tenantId, member.tenantId)),
    db.delete(purchases).where(eq(purchases.tenantId, member.tenantId)),
    db
      .delete(purchaseInwards)
      .where(eq(purchaseInwards.tenantId, member.tenantId)),
    db.delete(invoices).where(eq(invoices.tenantId, member.tenantId)),
    db.delete(returns).where(eq(returns.tenantId, member.tenantId)),
    db.delete(payments).where(eq(payments.tenantId, member.tenantId)),
    db.delete(auditLogs).where(eq(auditLogs.tenantId, member.tenantId)),
    db.delete(products).where(eq(products.tenantId, member.tenantId)),
    db
      .delete(productMasters)
      .where(eq(productMasters.tenantId, member.tenantId)),
    db.delete(customers).where(eq(customers.tenantId, member.tenantId)),
    db.delete(suppliers).where(eq(suppliers.tenantId, member.tenantId)),
  ]);

  // Keep one immutable record showing who performed the destructive action.
  await audit(
    member.tenantId,
    userId,
    "test_data.reset",
    `Recovery backup: ${recoveryBackup.fileName}`,
  );

  return {
    ok: true,
    tenantId: member.tenantId,
    resetAt: new Date().toISOString(),
    recoveryBackup: {
      id: recoveryBackup.id,
      fileName: recoveryBackup.fileName,
      downloadUrl: recoveryBackup.downloadUrl,
    },
    preserved: [
      "tenants",
      "users",
      "firm_registrations",
      "agency_profiles",
      "backup_settings",
      "backup_records",
    ],
  };
}

export async function getAgencyProfile(userId: string) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb(),
    [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, m.tenantId))
      .limit(1),
    [profile] = await db
      .select()
      .from(agencyProfiles)
      .where(eq(agencyProfiles.tenantId, m.tenantId))
      .limit(1);
  return (
    profile || {
      tenantId: m.tenantId,
      tradeName: tenant.companyName,
      legalEntity: "",
      tagline: "Medical and pharmaceutical wholesale distribution",
      logoKey: null,
      gstin: "",
      state: "Telangana",
      stateCode: "36",
      dlNo20b: "",
      dlNo21b: "",
      fssai: "",
      pan: "",
      streetAddress: "",
      city: "",
      district: "",
      pinCode: "",
      bookingLocation: "",
      phones: "",
      email: "",
      website: "",
      bankName: "",
      accountHolder: tenant.companyName,
      accountNumber: "",
      ifsc: "",
      branchName: "",
      terms:
        "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction only.",
      signatoryTitle: "Authorised Signatory",
      signatureKey: null,
      updatedAt: Date.now(),
    }
  );
}
export async function updateAgencyProfile(
  userId: string,
  input: Record<string, unknown>,
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const current = await getAgencyProfile(userId),
    tradeName = String(input.tradeName || "").trim(),
    gstin = String(input.gstin || "")
      .trim()
      .toUpperCase(),
    stateCode = String(input.stateCode || "").trim(),
    phones = String(input.phones || "").trim(),
    email = String(input.email || "").trim();
  if (tradeName.length < 3)
    throw new Error("Enter a valid firm or agency name");
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))
    throw new Error("Enter a valid 15-character GSTIN");
  if (!/^\d{2}$/.test(stateCode))
    throw new Error("State code must contain 2 digits");
  if (
    phones &&
    !phones
      .split(",")
      .every((x) => /^\+?\d{10,13}$/.test(x.trim().replace(/[ -]/g, "")))
  )
    throw new Error("Enter valid mobile numbers separated by commas");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Enter a valid business email");
  const row = {
    ...current,
    ...input,
    tenantId: m.tenantId,
    tradeName,
    gstin,
    stateCode,
    phones,
    email,
    dlNo20b: String(input.dlNo20b || "")
      .trim()
      .toUpperCase(),
    dlNo21b: String(input.dlNo21b || "")
      .trim()
      .toUpperCase(),
    pan: String(input.pan || "")
      .trim()
      .toUpperCase(),
    ifsc: String(input.ifsc || "")
      .trim()
      .toUpperCase(),
    updatedAt: Date.now(),
  } as typeof current;
  const db = getDb();
  await db.batch([
    db
      .insert(agencyProfiles)
      .values(row)
      .onConflictDoUpdate({ target: agencyProfiles.tenantId, set: row }),
    db
      .update(tenants)
      .set({ companyName: tradeName })
      .where(eq(tenants.id, m.tenantId)),
  ]);
  await audit(m.tenantId, userId, "agency_profile.updated", tradeName);
  await backup(m.tenantId);
  return row;
}
export async function adminRegistrations(userId: string) {
  const m = await getMembership(userId);
  if (!m || !(m.role === "admin" || m.role === "super_admin"))
    throw new Error("Super Admin access required");
  return getDb()
    .select()
    .from(firmRegistrations)
    .orderBy(desc(firmRegistrations.createdAt))
    .limit(100);
}
export async function reviewRegistration(
  userId: string,
  id: string,
  decision: "approved" | "denied",
) {
  const admin = await getMembership(userId);
  if (!admin || !(admin.role === "admin" || admin.role === "super_admin"))
    throw new Error("Super Admin access required");
  const db = getDb(),
    [r] = await db
      .select()
      .from(firmRegistrations)
      .where(eq(firmRegistrations.id, id))
      .limit(1);
  if (!r) throw new Error("Registration not found");
  const status = decision === "approved" ? "approved" : "denied",
    userStatus = decision === "approved" ? "active" : "denied",
    now = Date.now(),
    statements: any[] = [
      db
        .update(firmRegistrations)
        .set({ status, reviewedBy: userId, reviewedAt: now })
        .where(eq(firmRegistrations.id, id)),
      db
        .update(users)
        .set({ status: userStatus })
        .where(eq(users.id, r.userId)),
    ];
  if (decision === "approved")
    statements.push(
      db
        .insert(agencyProfiles)
        .values({
          tenantId: r.tenantId,
          tradeName: r.firmName,
          legalEntity: "",
          tagline: "Medical and pharmaceutical wholesale distribution",
          logoKey: r.logoKey,
          gstin: r.gstin,
          state: "",
          stateCode: r.gstin.slice(0, 2),
          dlNo20b: "",
          dlNo21b: "",
          fssai: "",
          pan: "",
          streetAddress: r.address,
          city: "",
          district: "",
          pinCode: "",
          bookingLocation: "",
          phones: r.mobile,
          email: r.email,
          website: "",
          bankName: "",
          accountHolder: r.firmName,
          accountNumber: "",
          ifsc: "",
          branchName: "",
          terms:
            "1. Goods once sold will not be taken back.\n2. Subject to local jurisdiction only.",
          signatoryTitle: "Authorised Signatory",
          signatureKey: null,
          updatedAt: now,
        })
        .onConflictDoNothing(),
    );
  await db.batch(statements);
  await audit(r.tenantId, userId, `registration.${status}`, r.firmName);
  return { ...r, status };
}
export async function getSalesInvoice(userId: string, id: string) {
  const member = await getMembership(userId);
  if (!member) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb(),
    [header] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, member.tenantId)))
      .limit(1);
  if (!header) throw new Error("Invoice not found");
  const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.id, header.customerId),
          eq(customers.tenantId, member.tenantId),
        ),
      )
      .limit(1),
    [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, member.tenantId))
      .limit(1),
    lines = await db
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.invoiceId, id),
          eq(invoiceLines.tenantId, member.tenantId),
        ),
      )
      .orderBy(invoiceLines.createdAt),
    profile = await getAgencyProfile(userId);
  return { header, customer, tenant, lines, profile };
}

export async function updateProductMaster(
  userId: string,
  id: string,
  input: {
    name: string;
    composition?: string;
    defaultPack?: string;
    hsn?: string;
    manufacturer: string;
    marketedBy?: string;
    defaultGstRate?: number;
    category?: string;
    isScheduleH1?: boolean;
    isPrescriptionRequired?: boolean;
    isHighCaution?: boolean;
    cautionNotes?: string;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb(),
    [row] = await db
      .select()
      .from(productMasters)
      .where(
        and(eq(productMasters.id, id), eq(productMasters.tenantId, m.tenantId)),
      )
      .limit(1);
  if (!row) throw new Error("Product master not found");
  if (!input.name?.trim() || !input.manufacturer?.trim())
    throw new Error("Product name and manufacturer are required");
  const flagged = Boolean(
      input.isScheduleH1 ||
        input.isPrescriptionRequired ||
        input.isHighCaution,
    ),
    cautionNotes = input.cautionNotes?.trim() || "";
  if (flagged && (!cautionNotes || cautionNotes.length > 280))
    throw new Error(
      "Flagged medicines require a concise caution note of no more than 280 characters",
    );
  const values = {
    name: input.name.trim(),
    composition: input.composition?.trim() || "",
    defaultPack: input.defaultPack?.trim() || "",
    hsn: input.hsn?.trim() || "",
    manufacturer: input.manufacturer.trim(),
    marketedBy: input.marketedBy?.trim() || "",
    defaultGstRate: Number(input.defaultGstRate ?? 5),
    category: input.category?.trim() || "General",
    isScheduleH1: Boolean(input.isScheduleH1),
    isPrescriptionRequired: Boolean(
      input.isPrescriptionRequired || input.isScheduleH1,
    ),
    isHighCaution: Boolean(input.isHighCaution),
    cautionNotes,
  };
  await db.batch([
    db
      .update(productMasters)
      .set(values)
      .where(
        and(eq(productMasters.id, id), eq(productMasters.tenantId, m.tenantId)),
      ),
    db
      .update(products)
      .set({
        name: values.name,
        hsn: values.hsn,
        manufacturer: values.manufacturer,
      })
      .where(
        and(
          eq(products.productMasterId, id),
          eq(products.tenantId, m.tenantId),
        ),
      ),
  ]);
  await audit(
    m.tenantId,
    userId,
    "product_master.updated",
    `${row.name} → ${values.name}`,
  );
  await backup(m.tenantId);
  return { ...row, ...values };
}

export async function deleteProductMaster(userId: string, id: string) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  if (!["owner", "admin", "super_admin"].includes(m.role))
    throw new Error("PRODUCT_DELETE_FORBIDDEN:Only a firm owner or administrator can delete products");
  const db = getDb(),
    [row] = await db
      .select()
      .from(productMasters)
      .where(
        and(eq(productMasters.id, id), eq(productMasters.tenantId, m.tenantId)),
      )
      .limit(1);
  if (!row) throw new Error("PRODUCT_NOT_FOUND:Product master not found");
  const [batchLink, inwardLink] = await Promise.all([
    db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.productMasterId, id),
          eq(products.tenantId, m.tenantId),
        ),
      )
      .limit(1),
    db
      .select({ id: purchaseInwardItems.id })
      .from(purchaseInwardItems)
      .where(
        and(
          eq(purchaseInwardItems.productMasterId, id),
          eq(purchaseInwardItems.tenantId, m.tenantId),
        ),
      )
      .limit(1),
  ]);
  if (batchLink.length || inwardLink.length)
    throw new Error(
      "PRODUCT_IN_USE:Cannot delete product with existing inventory or invoice history. Keep it in the catalog to preserve stock and audit records.",
    );
  await db
    .delete(productMasters)
    .where(
      and(eq(productMasters.id, id), eq(productMasters.tenantId, m.tenantId)),
    );
  await audit(m.tenantId, userId, "product_master.deleted", row.name);
  await backup(m.tenantId);
  return { deleted: true, id, name: row.name };
}

export async function updateBatchStock(
  userId: string,
  id: string,
  input: {
    batch: string;
    expiry: string;
    stock: number;
    mrp: number;
    purchaseRate: number;
    saleRate: number;
    reason: string;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  const db = getDb(),
    [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.tenantId, m.tenantId)))
      .limit(1);
  if (!row) throw new Error("Stock batch not found");
  const stock = Math.trunc(Number(input.stock));
  if (stock < 0) throw new Error("Stock cannot be negative");
  if (!input.reason?.trim()) throw new Error("Select an adjustment reason");
  const multiplier = row.packMultiplier || 1,
    physicalStock = stock * multiplier,
    delta = stock - row.stock,
    now = Date.now(),
    values = {
      batch: input.batch.trim(),
      expiry: input.expiry.trim(),
      stock,
      physicalStock,
      mrp: Number(input.mrp),
      purchaseRate: Number(input.purchaseRate),
      saleRate: Number(input.saleRate),
    };
  await db.batch([
    db
      .update(products)
      .set(values)
      .where(and(eq(products.id, id), eq(products.tenantId, m.tenantId))),
    db
      .insert(stockAdjustments)
      .values({
        id: crypto.randomUUID(),
        tenantId: m.tenantId,
        productId: id,
        batch: values.batch,
        previousStock: row.stock,
        newStock: stock,
        delta,
        reason: input.reason.trim(),
        userId,
        createdAt: now,
      }),
  ]);
  await audit(
    m.tenantId,
    userId,
    "stock.adjusted",
    `${row.name} ${row.batch}: ${row.stock} → ${stock} (${input.reason})`,
  );
  await backup(m.tenantId);
  return { ...row, ...values };
}

export async function updateSalesInvoice(
  userId: string,
  id: string,
  input: SaleInput,
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  if (!input.items?.length) throw new Error("Add at least one product row");
  const db = getDb(),
    [current] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, m.tenantId)))
      .limit(1);
  if (!current) throw new Error("Invoice not found");
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, input.customerId),
        eq(customers.tenantId, m.tenantId),
      ),
    )
    .limit(1);
  if (!customer) throw new Error("Customer not found");
  const masterRows = await db
    .select()
    .from(productMasters)
    .where(eq(productMasters.tenantId, m.tenantId));
  const old = await db
      .select()
      .from(invoiceLines)
      .where(
        and(
          eq(invoiceLines.invoiceId, id),
          eq(invoiceLines.tenantId, m.tenantId),
        ),
      ),
    plist = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, m.tenantId)),
    pmap = new Map(plist.map((p) => [p.id, p])),
    restored = new Map(plist.map((p) => [p.id, p.stock]));
  const complianceRequired = enforcePrescriptionCompliance(
    input,
    input.items
      .map((item) => pmap.get(item.productId))
      .filter((p): p is (typeof plist)[number] => Boolean(p)),
    masterRows,
  );
  for (const x of old)
    restored.set(
      x.productId,
      (restored.get(x.productId) || 0) + x.quantity + x.freeQuantity,
    );
  const requested = new Map<string, number>();
  for (const x of input.items)
    requested.set(
      x.productId,
      (requested.get(x.productId) || 0) +
        Number(x.quantity || 0) +
        Number(x.freeQuantity || 0),
    );
  for (const [pid, qty] of requested) {
    const p = pmap.get(pid),
      available = restored.get(pid) || 0;
    if (!p) throw new Error("Selected batch no longer exists");
    if (qty > available)
      throw new Error(
        `${p.name} batch ${p.batch}: cannot bill ${qty}; only ${available} available after reversing the original invoice`,
      );
  }
  let taxableSum = 0,
    discountSum = 0,
    gstSum = 0,
    totalQuantity = 0;
  const now = Date.now(),
    lines = [];
  for (const x of input.items) {
    const p = pmap.get(x.productId)!,
      qty = Number(x.quantity),
      free = Number(x.freeQuantity || 0),
      gross = money2(qty * Number(x.unitRate)),
      disc = money2((gross * Number(x.discountPercent || 0)) / 100),
      taxable = money2(gross - disc),
      gst = money2((taxable * Number(x.gstRate || 0)) / 100);
    taxableSum += taxable;
    discountSum += disc;
    gstSum += gst;
    totalQuantity += qty + free;
    lines.push({
      id: crypto.randomUUID(),
      tenantId: m.tenantId,
      invoiceId: id,
      customerId: customer.id,
      productId: p.id,
      productName: p.name,
      batch: p.batch,
      pack: p.pack,
      manufacturer: p.manufacturer,
      hsn: p.hsn,
      expiry: p.expiry,
      mrp: p.mrp,
      availableStock: restored.get(p.id) || 0,
      quantity: qty,
      freeQuantity: free,
      unitRate: Number(x.unitRate),
      discountPercent: Number(x.discountPercent || 0),
      discountAmount: disc,
      gstRate: Number(x.gstRate || 0),
      taxableAmount: taxable,
      gstAmount: gst,
      lineTotal: money2(taxable + gst),
      createdAt: now,
    });
  }
  const freight = money2(Number(input.freightAmount) || 0),
    insurance = money2(Number(input.insuranceAmount) || 0),
    before = money2(taxableSum + freight + insurance),
    cashInput = Math.max(0, Number(input.cashDiscount) || 0),
    cashDiscount = money2(
      input.cashDiscountType === "percent"
        ? (before * cashInput) / 100
        : cashInput,
    ),
    chargeTax = money2(
      (freight * Number(input.freightGstRate || 0)) / 100 +
        (insurance * Number(input.insuranceGstRate || 0)) / 100,
    ),
    scale = before ? Math.max(0, before - cashDiscount) / before : 1,
    tax = money2((gstSum + chargeTax) * scale),
    seller = String(
      input.sellerStateCode || current.sellerStateCode || "36",
    ).padStart(2, "0"),
    buyer = String(
      customer.stateCode || customer.gstin?.slice(0, 2) || "",
    ).padStart(2, "0"),
    intra = Boolean(buyer && seller === buyer),
    cgst = intra ? money2(tax / 2) : 0,
    sgst = intra ? money2(tax - cgst) : 0,
    igst = intra ? 0 : tax,
    net = money2(Math.max(0, before - cashDiscount) + tax),
    amount = Math.round(net),
    roundOff = money2(amount - net),
    status = input.status || current.status,
    oldDue = current.status === "Paid" ? 0 : current.amount,
    newDue = status === "Paid" ? 0 : amount,
    statements = [
      db
        .delete(invoiceLines)
        .where(
          and(
            eq(invoiceLines.invoiceId, id),
            eq(invoiceLines.tenantId, m.tenantId),
          ),
        ),
      ...lines.map((x) => db.insert(invoiceLines).values(x)),
    ];
  for (const p of plist) {
    const next = (restored.get(p.id) || p.stock) - (requested.get(p.id) || 0);
    if (next !== p.stock)
      statements.push(
        db
          .update(products)
          .set({ stock: next })
          .where(and(eq(products.id, p.id), eq(products.tenantId, m.tenantId))),
      );
  }
  if (current.customerId === customer.id && oldDue !== newDue)
    statements.push(
      db
        .update(customers)
        .set({
          outstanding: Math.max(0, customer.outstanding + newDue - oldDue),
        })
        .where(
          and(
            eq(customers.id, customer.id),
            eq(customers.tenantId, m.tenantId),
          ),
        ),
    );
  statements.push(
    db
      .update(invoices)
      .set({
        customerId: customer.id,
        customerName: customer.name,
        amount,
        status,
        invoiceDate: input.invoiceDate || current.invoiceDate,
        invoiceTime: input.invoiceTime || current.invoiceTime,
        invoiceType: input.invoiceType || current.invoiceType,
        paymentMode: input.paymentMode || current.paymentMode,
        dueDate: input.dueDate || null,
        paymentTerms: input.paymentTerms || null,
        sellerStateCode: seller,
        buyerStateCode: buyer || null,
        transportName: input.transportName || null,
        vehicleNo: input.vehicleNo || null,
        lrNo: input.lrNo || null,
        prescriptionDoctorName: complianceRequired
          ? input.prescriptionDoctorName?.trim() || null
          : null,
        prescriptionDoctorRegistration: complianceRequired
          ? input.prescriptionDoctorRegistration?.trim().toUpperCase() || null
          : null,
        complianceAcknowledged: complianceRequired,
        freightAmount: freight,
        freightGstRate: Number(input.freightGstRate) || 0,
        insuranceAmount: insurance,
        insuranceGstRate: Number(input.insuranceGstRate) || 0,
        grossTaxable: money2(taxableSum),
        lineDiscount: money2(discountSum),
        cashDiscount,
        cgst,
        sgst,
        igst,
        roundOff,
        amountInWords: words(amount),
        totalQuantity,
      })
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, m.tenantId))),
  );
  await db.batch(statements);
  await audit(
    m.tenantId,
    userId,
    "invoice.updated",
    `${current.invoiceNo} · stock reversed and reapplied`,
  );
  await backup(m.tenantId);
  return getSalesInvoice(userId, id);
}

type FullInwardItem = {
  id?: string;
  serialNo: number;
  productName: string;
  pack: string;
  manufacturer: string;
  hsn: string;
  batch: string;
  expiry: string;
  billedQuantity: number;
  freeQuantity: number;
  mrp: number;
  netRate: number;
  gstRate: number;
};
export async function replacePurchaseInward(
  userId: string,
  id: string,
  input: {
    header: Record<string, unknown>;
    items: FullInwardItem[];
    charges?: Array<{
      id?: string;
      kind: string;
      amount: number;
      hsn?: string;
      gstRate: number;
    }>;
  },
) {
  const m = await getMembership(userId);
  if (!m) throw new Error("WORKSPACE_REQUIRED");
  if (!input.items?.length) throw new Error("Add at least one medicine item");
  const db = getDb(),
    [current] = await db
      .select()
      .from(purchaseInwards)
      .where(
        and(
          eq(purchaseInwards.id, id),
          eq(purchaseInwards.tenantId, m.tenantId),
        ),
      )
      .limit(1);
  if (!current) throw new Error("Purchase inward not found");
  const oldItems = await db
      .select()
      .from(purchaseInwardItems)
      .where(
        and(
          eq(purchaseInwardItems.inwardId, id),
          eq(purchaseInwardItems.tenantId, m.tenantId),
        ),
      ),
    allProducts = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, m.tenantId)),
    allMasters = await db
      .select()
      .from(productMasters)
      .where(eq(productMasters.tenantId, m.tenantId)),
    stock = new Map(allProducts.map((x) => [x.id, x.stock]));
  for (const old of oldItems)
    stock.set(
      old.productId,
      (stock.get(old.productId) || 0) - old.billedQuantity - old.freeQuantity,
    );
  const productByKey = new Map(
      allProducts.map((x) => [
        `${x.name}|${x.pack}|${x.batch}`.toUpperCase(),
        x,
      ]),
    ),
    masterByName = new Map(allMasters.map((x) => [x.name.toUpperCase(), x])),
    now = Date.now(),
    statements: any[] = [
      db
        .delete(purchaseInwardItems)
        .where(
          and(
            eq(purchaseInwardItems.inwardId, id),
            eq(purchaseInwardItems.tenantId, m.tenantId),
          ),
        ),
      db
        .delete(purchaseCharges)
        .where(
          and(
            eq(purchaseCharges.inwardId, id),
            eq(purchaseCharges.tenantId, m.tenantId),
          ),
        ),
    ],
    lineRows: any[] = [];
  let subtotal = 0,
    totalGst = 0;
  for (let i = 0; i < input.items.length; i++) {
    const x = input.items[i],
      billed = Number(x.billedQuantity),
      free = Number(x.freeQuantity || 0),
      rate = Number(x.netRate),
      gstRate = Number(x.gstRate || 0);
    if (
      !x.productName?.trim() ||
      !x.pack?.trim() ||
      !x.batch?.trim() ||
      !x.expiry?.trim() ||
      billed <= 0 ||
      free < 0
    )
      throw new Error(`Complete all required fields in row ${i + 1}`);
    let master = masterByName.get(x.productName.trim().toUpperCase());
    if (!master) {
      master = {
        id: crypto.randomUUID(),
        tenantId: m.tenantId,
        name: x.productName.trim(),
        composition: "",
        defaultPack: x.pack.trim(),
        hsn: x.hsn.trim(),
        manufacturer: x.manufacturer.trim(),
        defaultGstRate: gstRate,
        category: "General",
        createdAt: now,
      };
      masterByName.set(master.name.toUpperCase(), master);
      statements.push(db.insert(productMasters).values(master));
    }
    const key = `${x.productName}|${x.pack}|${x.batch}`.toUpperCase();
    let product = productByKey.get(key),
      multiplier = packMultiplier(x.pack),
      received = billed + free,
      taxable = money2(billed * rate),
      gstAmount = money2((taxable * gstRate) / 100),
      gross = money2(taxable + gstAmount),
      expiryMatch = x.expiry.match(/^(\d{2})\/(\d{2})$/),
      stockExpiry = expiryMatch
        ? `20${expiryMatch[2]}-${expiryMatch[1]}`
        : x.expiry;
    if (!product) {
      product = {
        id: crypto.randomUUID(),
        tenantId: m.tenantId,
        productMasterId: master.id,
        name: x.productName.trim(),
        batch: x.batch.trim(),
        stock: 0,
        expiry: stockExpiry,
        purchaseRate: rate,
        mrp: Number(x.mrp),
        hsn: x.hsn.trim(),
        pack: x.pack.trim(),
        manufacturer: x.manufacturer.trim(),
        packMultiplier: multiplier,
        physicalStock: 0,
        landingCostPerUnit: received ? money2(gross / received) : 0,
        mrpPerUnit: money2(Number(x.mrp) / multiplier),
        saleRate: 0,
        createdAt: now,
      };
      productByKey.set(key, product);
      allProducts.push(product);
      stock.set(product.id, 0);
      statements.push(db.insert(products).values(product));
    }
    stock.set(product.id, (stock.get(product.id) || 0) + received);
    subtotal += taxable;
    totalGst += gstAmount;
    lineRows.push({
      id: crypto.randomUUID(),
      tenantId: m.tenantId,
      inwardId: id,
      productMasterId: master.id,
      productId: product.id,
      serialNo: i + 1,
      productName: x.productName.trim(),
      pack: x.pack.trim(),
      manufacturer: x.manufacturer.trim(),
      hsn: x.hsn.trim(),
      batch: x.batch.trim(),
      expiry: x.expiry.trim(),
      billedQuantity: billed,
      freeQuantity: free,
      mrp: Number(x.mrp),
      netRate: rate,
      gstRate,
      gstAmount,
      lineTotal: taxable,
      grossTotal: gross,
      packMultiplier: multiplier,
      physicalUnits: received * multiplier,
      landingCostPerUnit: received ? money2(gross / received) : 0,
      mrpPerUnit: money2(Number(x.mrp) / multiplier),
      createdAt: now,
    });
  }
  for (const p of allProducts) {
    const next = stock.get(p.id) ?? p.stock;
    if (next < 0)
      throw new Error(
        `Cannot reduce ${p.name} batch ${p.batch} below quantity already sold`,
      );
    if (next !== p.stock)
      statements.push(
        db
          .update(products)
          .set({ stock: next, physicalStock: next * (p.packMultiplier || 1) })
          .where(and(eq(products.id, p.id), eq(products.tenantId, m.tenantId))),
      );
  }
  for (const row of lineRows)
    statements.push(db.insert(purchaseInwardItems).values(row));
  for (const c of input.charges || []) {
    const amount = Number(c.amount || 0),
      gstRate = Number(c.gstRate || 0);
    subtotal += amount;
    totalGst += money2((amount * gstRate) / 100);
    statements.push(
      db
        .insert(purchaseCharges)
        .values({
          id: crypto.randomUUID(),
          tenantId: m.tenantId,
          inwardId: id,
          kind: c.kind || "Freight",
          amount,
          hsn: c.hsn || null,
          gstRate,
          createdAt: now,
        }),
    );
  }
  subtotal = money2(subtotal);
  totalGst = money2(totalGst);
  const h = input.header || {},
    supplierState = String(
      h.supplierGstin ?? current.supplierGstin ?? "",
    ).slice(0, 2),
    buyerState = String(h.buyerGstin ?? current.buyerGstin ?? "").slice(0, 2),
    intra = Boolean(
      supplierState && buyerState && supplierState === buyerState,
    ),
    cgst = intra ? money2(totalGst / 2) : 0,
    sgst = intra ? money2(totalGst - cgst) : 0,
    igst = intra ? 0 : totalGst,
    net = money2(subtotal + totalGst),
    roundOff = money2(Math.round(net) - net),
    grandTotal = Math.round(net),
    status = String(h.status ?? current.status),
    oldDue = current.status === "Paid" ? 0 : current.grandTotal,
    newDue = status === "Paid" ? 0 : grandTotal;
  if (current.supplierId && oldDue !== newDue) {
    const [s] = await db
      .select()
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, current.supplierId),
          eq(suppliers.tenantId, m.tenantId),
        ),
      )
      .limit(1);
    if (s)
      statements.push(
        db
          .update(suppliers)
          .set({
            name: String(h.supplierName || current.supplierName),
            gstin: String(h.supplierGstin || "") || null,
            outstanding: Math.max(0, s.outstanding + newDue - oldDue),
          })
          .where(
            and(eq(suppliers.id, s.id), eq(suppliers.tenantId, m.tenantId)),
          ),
      );
  }
  statements.push(
    db
      .update(purchaseInwards)
      .set({
        supplierName: String(h.supplierName || current.supplierName),
        supplierAddress: String(h.supplierAddress || "") || null,
        supplierGstin: String(h.supplierGstin || "") || null,
        supplierDlNo: String(h.supplierDlNo || "") || null,
        supplierPhoneEmail: String(h.supplierPhoneEmail || "") || null,
        buyerName: String(h.buyerName || "") || null,
        buyerAddress: String(h.buyerAddress || "") || null,
        buyerGstin: String(h.buyerGstin || "") || null,
        buyerDlNo: String(h.buyerDlNo || "") || null,
        orderNo: String(h.orderNo || "") || null,
        invoiceNo: String(h.invoiceNo || "") || null,
        invoiceDate: String(h.invoiceDate || "") || null,
        dueDate: String(h.dueDate || "") || null,
        transportGrNo: String(h.transportGrNo || "") || null,
        subtotal,
        cgst,
        sgst,
        igst,
        roundOff,
        grandTotal,
        status,
      })
      .where(
        and(
          eq(purchaseInwards.id, id),
          eq(purchaseInwards.tenantId, m.tenantId),
        ),
      ),
  );
  await db.batch(statements);
  await audit(
    m.tenantId,
    userId,
    "purchase_inward.updated",
    `${current.inwardNo} · ${input.items.length} items · inventory synced`,
  );
  await backup(m.tenantId);
  return getPurchaseInward(userId, id);
}

export async function deleteSalesInvoice(userId: string, id: string, input: {confirm_delete?: boolean; reason?: string}) {
  return deleteInvoiceRecord(env.DB, await getMembership(userId), "sale", id, input, () => createFullBackup(userId, "pre_delete_sale"));
}
export async function deletePurchaseInvoice(userId: string, id: string, input: {confirm_delete?: boolean; reason?: string}) {
  return deleteInvoiceRecord(env.DB, await getMembership(userId), "purchase", id, input, () => createFullBackup(userId, "pre_delete_purchase"));
}
