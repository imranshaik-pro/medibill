"use client";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceSearch } from "./workspace-search";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  IndianRupee,
  Home,
  LogOut,
  Menu,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PurchaseInwardForm } from "@/app/purchase-inward-form";
import { PurchaseHistory, type InwardRow } from "@/app/purchase-history";
import { SalesInvoiceForm } from "@/app/sales-invoice-form";
import {
  InventoryEditor,
  ProductCatalogEditor,
} from "@/app/master-stock-editors";
import { SalesRegistry } from "@/app/sales-registry";
import { BackupRecovery } from "@/app/backup-recovery";
import { AgencyProfile } from "@/app/agency-profile";
import { AdminApprovals } from "@/app/admin-approvals";
import {
  ProductImageScanner,
  type ProductScan,
} from "@/app/product-image-scanner";
type Customer = {
  id: string;
  name: string;
  legalName?: string | null;
  tradeName?: string | null;
  phone: string;
  gstin: string | null;
  outstanding: number;
  status: string;
  dlNo?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pinCode?: string | null;
  registrationStatus?: string | null;
};
type ProductMaster = {
  id: string;
  name: string;
  composition: string;
  defaultPack: string;
  hsn: string;
  manufacturer: string;
  marketedBy: string;
  defaultGstRate: number;
  category: string;
  isScheduleH1: boolean;
  isPrescriptionRequired: boolean;
  isHighCaution: boolean;
  cautionNotes: string;
};
type Product = {
  id: string;
  productMasterId: string | null;
  name: string;
  hsn: string;
  pack: string;
  manufacturer: string;
  batch: string;
  stock: number;
  physicalStock: number;
  expiry: string;
  purchaseRate: number;
  mrp: number;
  saleRate: number;
};
type Invoice = {
  id: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  amount: number;
  status: string;
  invoiceDate: string;
};
type InvoiceLine = {
  id: string;
  invoiceId: string;
  customerId: string;
  productId: string;
  productName: string;
  batch: string;
  quantity: number;
  freeQuantity: number;
  unitRate: number;
  discountPercent: number;
  gstRate: number;
  lineTotal: number;
  createdAt: number;
};
type Supplier = {
  id: string;
  name: string;
  legalName?: string | null;
  tradeName?: string | null;
  phone: string;
  gstin: string | null;
  outstanding: number;
  status: string;
  dlNo?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pinCode?: string | null;
  registrationStatus?: string | null;
};
type LookupParty = {
  id?: string;
  partyType: string;
  source: string;
  registry?: string;
  verifiedAt?: string;
  name: string;
  legalName?: string | null;
  tradeName?: string | null;
  gstin?: string | null;
  dlNo?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
  pinCode?: string | null;
  registrationStatus?: string | null;
  constitutionType?: string | null;
  issuingAuthority?: string | null;
  authorizedPerson?: string | null;
};
type Purchase = {
  id: string;
  purchaseNo: string;
  supplierName: string;
  productName: string;
  quantity: number;
  unitCost: number;
  gstRate: number;
  amount: number;
  status: string;
  purchaseDate: string;
};
type PurchaseInward = InwardRow & { igst: number; cgst: number; sgst: number };
type Payment = {
  id: string;
  paymentNo: string;
  type: string;
  partyName: string;
  amount: number;
  method: string;
  paymentDate: string;
};
type ReturnRow = {
  id: string;
  returnNo: string;
  type: string;
  partyName: string;
  referenceNo: string;
  amount: number;
  reason: string;
  returnDate: string;
};
type Data = {
  approvalPending?: boolean;
  tenant: { companyName: string };
  member: { role: string; status?: string };
  customers: Customer[];
  productMasters: ProductMaster[];
  products: Product[];
  invoices: Invoice[];
  invoiceLines: InvoiceLine[];
  suppliers: Supplier[];
  purchases: Purchase[];
  purchaseInwards: PurchaseInward[];
  payments: Payment[];
  returns: ReturnRow[];
};
type Modal =
  | "customer"
  | "product"
  | "invoice"
  | "supplier"
  | "purchase"
  | "payment"
  | "return"
  | null;
function withSearchMatch<T extends {id:string}>(rows:T[],record?:Record<string,unknown>):T[]{return record&&typeof record.id==="string"&&!rows.some(row=>row.id===record.id)?[record as T,...rows]:rows;}
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

export function MediBillApp({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [data, setData] = useState<Data | null | undefined>();
  const [page, setPage] = useState("dashboard");
  const [searchTarget, setSearchTarget] = useState<{page:string;query:string;record?:Record<string,unknown>}>({page:"",query:""});
  const [modal, setModal] = useState<Modal>(null);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const load = () =>
    fetch("/api/workspace")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(next=>{setData(next);setSearchTarget(current=>({...current,record:undefined}));})
      .catch(() => setMsg("Unable to load your workspace."));
  useEffect(() => {
    load();
  }, []);
  const totals = useMemo(
    () => ({
      sales: data?.invoices?.reduce((a, x) => a + x.amount, 0) || 0,
      due: data?.customers?.reduce((a, x) => a + x.outstanding, 0) || 0,
      stock:
        data?.products?.reduce((a, x) => a + x.stock * x.purchaseRate, 0) || 0,
    }),
    [data],
  );
  async function save(path: string, body: Record<string, unknown>) {
    if (
      !window.confirm(
        "Please review the entered details. Do you want to save this record?",
      )
    )
      throw new Error("Save cancelled");
    setBusy(true);
    setMsg("");
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMsg(out.error || "Unable to save");
      throw new Error(out.error || "Unable to save");
    }
    setModal(null);
    await load();
    setMsg("Saved successfully");
    return out;
  }
  if (data === undefined)
    return (
      <div className="loading">
        <div className="brand">
          <span>M+</span>MediBill <b>Pro</b>
        </div>
        <p>Opening your secure workspace…</p>
      </div>
    );
  if (data === null)
    return (
      <Setup
        user={user}
        busy={busy}
        msg={msg}
        create={async (form) => {
          setBusy(true);
          const r = await fetch("/api/workspace", {
            method: "POST",
            body: form,
          });
          setBusy(false);
          if (r.ok) setData(await r.json());
          else setMsg((await r.json()).error);
        }}
      />
    );
  if (data.approvalPending) return <PendingApproval user={user} />;
  const nav = [
    ["dashboard", "Dashboard", Home],
    ["sales", "Sales & Billing", ShoppingCart],
    ["purchases", "Purchases", Truck],
    ["payables", "Suppliers & Payables", WalletCards],
    ["returns", "Returns", RotateCcw],
    ["customers", "Customers", Users],
    ["catalog", "Product Master", PackagePlus],
    ["inventory", "Inventory & Stock", Boxes],
    ["accounting", "Accounting & GST", IndianRupee],
    ["reports", "Reports", BarChart3],
    ["admin", "Settings", ShieldCheck],
  ] as const;
  return (
    <div className="shell pharmly-shell">
      <aside className={mobile ? "side open" : "side"}>
        <div className="brand">
          <span>M+</span>MediBill <b>Pro</b>
        </div>
        <nav aria-label="Main navigation">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => {
                setSearchTarget({page:"",query:""});
                setPage(id);
                setMobile(false);
              }}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="upgrade-card">
            <span className="upgrade-icon"><TrendingUp size={20} /></span>
            <b>Upgrade Pro</b>
            <p>Bring your pharmacy workflow together in one organised workspace.</p>
            <button type="button" onClick={() => {setSearchTarget({page:"",query:""});setPage("admin");setMobile(false);}}>
              Manage workspace <ChevronRight size={16} />
            </button>
          </div>
          <a className="logout" href="/api/auth/logout">
            <LogOut />
            Log out
          </a>
        </div>
      </aside>
      <main className="main">
        <header className="top">
          <button className="menu" aria-label="Toggle navigation" aria-expanded={mobile} onClick={() => setMobile(!mobile)}>
            <Menu />
          </button>
          <WorkspaceSearch navigate={(nextPage,query,record)=>{setSearchTarget({page:nextPage,query,record});setPage(nextPage);setMobile(false);}}/>
          <div className="profile">
            <div>{initials(user.name)}</div>
            <span>
              <b>{user.name}</b>
              <small>{data.tenant.companyName}</small>
            </span>
          </div>
        </header>
        <div className="workspace">
          {msg && (
            <div className="notice" onClick={() => setMsg("")}>
              {msg}
              <span>×</span>
            </div>
          )}
          {page === "dashboard" && (
            <Dashboard data={data} totals={totals} open={setModal} />
          )}{" "}
          {page === "sales" && (
            <SalesRegistry
              initialSearch={searchTarget.page==="sales"?searchTarget.query:""}
              data={searchTarget.page==="sales"?{...data,invoices:withSearchMatch(data.invoices,searchTarget.record)}:data}
              newInvoice={() => setModal("invoice")}
              changed={load}
              notify={setMsg}
            />
          )}{" "}
          {page === "purchases" && (
            <PurchaseHistory
              initialSearch={searchTarget.page==="purchases"?searchTarget.query:""}
              rows={withSearchMatch(data.purchaseInwards || [],searchTarget.page==="purchases"?searchTarget.record:undefined)}
              canDelete={["admin", "super_admin"].includes(data.member.role)}
              onImport={() => setModal("purchase")}
              onChanged={load}
            />
          )}{" "}
          {page === "payables" && <Payables data={searchTarget.page==="payables" ? {...data,suppliers:withSearchMatch(data.suppliers,searchTarget.record).filter(x=>x.name.toLowerCase().includes(searchTarget.query.toLowerCase()))} : data} open={setModal} />}{" "}
          {page === "returns" && (
            <List
              title="Returns"
              sub="Sales and purchase return register with source references."
              action="Record return"
              click={() => setModal("return")}
            >
              <Returns rows={data.returns} />
            </List>
          )}{" "}
          {page === "customers" && (
            <List
              title="Customers"
              sub="Firm profiles, balances and GST details."
              action="Add customer"
              click={() => setModal("customer")}
            >
              <Customers rows={searchTarget.page==="customers" ? withSearchMatch(data.customers,searchTarget.record).filter(x=>x.name.toLowerCase().includes(searchTarget.query.toLowerCase())) : data.customers} changed={load} />
            </List>
          )}{" "}
          {page === "catalog" && (
            <>
              <Head
              title="Product Master"
              sub="Unique catalog items. HSN and manufacturer are maintained once."
            >
                <Button onClick={() => setModal("product")}><Plus />Add new product</Button>
              </Head>
              <ProductOverview data={data} />
              <ProductCatalogEditor
                initialSearch={searchTarget.page==="catalog"?searchTarget.query:""}
                rows={withSearchMatch(data.productMasters,searchTarget.page==="catalog"?searchTarget.record:undefined)}
                changed={load}
                notify={setMsg}
                allowDelete={["owner", "admin", "super_admin"].includes(
                  data.member.role,
                )}
              />
            </>
          )}{" "}
          {page === "inventory" && (
            <>
              <Head
                title="Inventory & Stock"
                sub="Physical stock organised by product, pack and batch."
              />
              <ProductOverview data={data} categories={false} />
              <InventoryEditor
                initialSearch={searchTarget.page==="inventory"?searchTarget.query:""}
                allowDelete={["admin", "super_admin"].includes(data.member.role)}
                rows={withSearchMatch(data.products,searchTarget.page==="inventory"?searchTarget.record:undefined)}
                masters={data.productMasters}
                changed={load}
                notify={setMsg}
              />
            </>
          )}{" "}
          {page === "accounting" && <Accounting data={data} />}{" "}
          {page === "reports" && <Reports data={data} totals={totals} />}{" "}
          {page === "admin" && <Admin data={data} user={user} />}
        </div>
      </main>
      <Entry
        type={modal}
        close={() => setModal(null)}
        data={data}
        busy={busy}
        save={save}
      />
    </div>
  );
}
function Setup({
  user,
  busy,
  msg,
  create,
}: {
  user: { name: string; email?: string };
  busy: boolean;
  msg: string;
  create: (f: FormData) => void;
}) {
  const [f, setF] = useState({
      companyName: "",
      username: "",
      mobile: "",
      address: "",
      gstin: "",
    }),
    [logo, setLogo] = useState<File | null>(null);
  const submit = () => {
    const d = new FormData();
    Object.entries(f).forEach(([k, v]) => d.set(k, v));
    if (logo) d.set("logo", logo);
    create(d);
  };
  return (
    <main className="setup registration-setup">
      <div className="setup-card registration-card">
        <div className="brand">
          <span>M+</span>MediBill <b>Pro</b>
        </div>
        <p className="eyebrow dark">SECURE FIRM REGISTRATION</p>
        <h1>Register your medical agency</h1>
        <p>
          Your verified identity is used for sign-in. Submit the firm details
          below for Super Admin approval.
        </p>
        <div className="form-row">
          <Label>
            Username
            <Input
              required
              value={f.username}
              onChange={(e) => setF({ ...f, username: e.target.value })}
            />
          </Label>
          <Label>
            Verified Email
            <Input disabled value={user.email || "Verified account"} />
          </Label>
        </div>
        <div className="form-row">
          <Label>
            Mobile Number
            <Input
              maxLength={10}
              value={f.mobile}
              onChange={(e) =>
                setF({ ...f, mobile: e.target.value.replace(/\D/g, "") })
              }
            />
          </Label>
          <Label>
            GSTIN
            <Input
              maxLength={15}
              value={f.gstin}
              onChange={(e) =>
                setF({ ...f, gstin: e.target.value.toUpperCase() })
              }
            />
          </Label>
        </div>
        <Label>
          Firm Name
          <Input
            value={f.companyName}
            onChange={(e) => setF({ ...f, companyName: e.target.value })}
          />
        </Label>
        <Label>
          Firm Address
          <Input
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
          />
        </Label>
        <Label>
          Logo / Branding
          <Input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setLogo(e.target.files?.[0] || null)}
          />
        </Label>
        {msg && <p className="error">{msg}</p>}
        <Button
          className="wide"
          disabled={
            busy || !logo || f.companyName.length < 3 || f.mobile.length !== 10
          }
          onClick={submit}
        >
          {busy ? "Submitting…" : "Submit for Admin Approval"}
          <ChevronRight />
        </Button>
        <small>
          MediBill never receives or stores your password. Password recovery and
          verification remain with the identity provider.
        </small>
      </div>
    </main>
  );
}
function PendingApproval({ user }: { user: { name: string; email: string } }) {
  return (
    <main className="setup">
      <div className="setup-card pending-card">
        <div className="brand">
          <span>M+</span>MediBill <b>Pro</b>
        </div>
        <ShieldCheck />
        <p className="eyebrow dark">REGISTRATION RECEIVED</p>
        <h1>Approval is pending</h1>
        <p>
          Your firm registration is awaiting Super Admin review. Dashboard
          access will activate after approval.
        </p>
        <b>{user.email}</b>
        <Button asChild variant="outline">
          <a href="/api/auth/logout">Sign out</a>
        </Button>
      </div>
    </main>
  );
}
function Dashboard({
  data,
  totals,
  open,
}: {
  data: Data;
  totals: { sales: number; due: number; stock: number };
  open: (m: Modal) => void;
}) {
  const today = new Date().toISOString().slice(0, 10),
    month = today.slice(0, 7),
    todayRows = data.invoices.filter((x) => x.invoiceDate === today),
    monthRows = data.invoices.filter((x) => x.invoiceDate.startsWith(month));
  const todaySales = todayRows.reduce((a, x) => a + x.amount, 0),
    monthlySales = monthRows.reduce((a, x) => a + x.amount, 0),
    collections = todayRows
      .filter((x) => x.status === "Paid")
      .reduce((a, x) => a + x.amount, 0),
    todayPurchases =
      data.purchases
        .filter((x) => x.purchaseDate === today)
        .reduce((a, x) => a + x.amount, 0) +
      (data.purchaseInwards || [])
        .filter((x) => x.invoiceDate === today)
        .reduce((a, x) => a + x.grandTotal, 0),
    payables = data.suppliers.reduce((a, x) => a + x.outstanding, 0);
  const avgMargin = data.products.length
    ? data.products.reduce(
        (a, p) => a + Math.max(0, p.mrp - p.purchaseRate) / Math.max(1, p.mrp),
        0,
      ) / data.products.length
    : 0;
  const now = new Date(),
    near = new Date(now);
  near.setMonth(near.getMonth() + 3);
  const expired = data.products.filter(
      (p) => p.stock > 0 && new Date(p.expiry + "-01") < now,
    ).length,
    nearExpiry = data.products.filter((p) => {
      const d = new Date(p.expiry + "-01");
      return p.stock > 0 && d >= now && d <= near;
    }).length,
    low = data.products.filter((p) => p.stock < 50).length;
  const trend = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return {
      day: d.toLocaleDateString("en-IN", { weekday: "short" }),
      sales: data.invoices
        .filter((x) => x.invoiceDate === key)
        .reduce((a, x) => a + x.amount, 0),
    };
  });
  return (
    <>
      <section className="dash-hero">
        <div>
          <p>WELCOME BACK</p>
          <h1>Run today&apos;s business from one screen</h1>
          <span>
            Billing, stock, collections and risk signals for{" "}
            {data.tenant.companyName}.
          </span>
        </div>
        <div>
          <Button className="hero-primary" onClick={() => open("invoice")}>
            <Plus />
            Create sale
          </Button>
          <Button className="hero-secondary" onClick={() => open("purchase")}>
            <PackagePlus />
            Record purchase
          </Button>
        </div>
      </section>
      <div className="section-title">
        <div>
          <h2>Business overview</h2>
          <p>Operational numbers from your current workspace records.</p>
        </div>
        <span className="live-pill">● LIVE</span>
      </div>
      <div className="metrics usp-metrics">
        <Metric
          l="Today’s sales"
          v={money(todaySales)}
          m={todayRows.length + " invoices billed today"}
          i={<IndianRupee />}
        />
        <Metric
          l="Today’s collections"
          v={money(collections)}
          m="Paid invoices received today"
          i={<CircleDollarSign />}
        />
        <Metric
          l="Outstanding credit"
          v={money(totals.due)}
          m="Customer receivables"
          i={<Users />}
        />
        <Metric
          l="Supplier payables"
          v={money(payables)}
          m="Outstanding supplier balance"
          i={<WalletCards />}
        />
        <Metric
          l="Current stock value"
          v={money(totals.stock)}
          m={data.products.reduce((a, p) => a + p.stock, 0) + " units in stock"}
          i={<Boxes />}
        />
        <Metric
          l="Today’s purchases"
          v={money(todayPurchases)}
          m="Purchase value recorded today"
          i={<ShoppingCart />}
        />
        <Metric
          l="Monthly sales"
          v={money(monthlySales)}
          m="Current calendar month"
          i={<BarChart3 />}
        />
        <Metric
          l="Est. gross profit"
          v={money(todaySales * avgMargin)}
          m="Estimated from product margins"
          i={<TrendingUp />}
        />
      </div>
      <div className="insight-grid">
        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h3>7-day sales pulse</h3>
              <p>Daily invoice value</p>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e7efed"
                />
                <XAxis dataKey="day" axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Area
                  type="monotone"
                  dataKey="sales"
                  stroke="#0b7e75"
                  strokeWidth={3}
                  fill="#d8eee8"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel attention">
          <div className="panel-head">
            <div>
              <h3>Needs attention</h3>
              <p>Act before these affect billing.</p>
            </div>
          </div>
          <AlertRow
            i={<PackagePlus />}
            t="Low stock items"
            v={low}
            tone="amber"
          />
          <AlertRow
            i={<Clock3 />}
            t="Near-expiry batches"
            v={nearExpiry}
            tone="amber"
          />
          <AlertRow
            i={<AlertTriangle />}
            t="Expired batches"
            v={expired}
            tone="red"
          />
        </section>
      </div>
      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Recent invoices</h3>
              <p>Latest billing activity</p>
            </div>
          </div>
          <Invoices rows={data.invoices.slice(0, 5)} />
        </section>
        <section className="panel attention">
          <div className="panel-head">
            <div>
              <h3>Quick actions</h3>
              <p>Your common daily tasks</p>
            </div>
          </div>
          <Action
            i={<ShoppingCart />}
            t="Create sale invoice"
            d="Bill a customer and track payment."
            c={() => open("invoice")}
          />
          <Action
            i={<Users />}
            t="Add customer"
            d="Create a new firm profile."
            c={() => open("customer")}
          />
          <Action
            i={<PackagePlus />}
            t="Add product batch"
            d="Record stock, cost and expiry."
            c={() => open("product")}
          />
        </section>
      </div>
    </>
  );
}
function Head({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{sub}</p>
      </div>
      {children}
    </div>
  );
}
function Metric({
  l,
  v,
  m,
  i,
}: {
  l: string;
  v: string;
  m: string;
  i: React.ReactNode;
}) {
  return (
    <div className="metric">
      <div>
        <span>{l}</span>
        <b>{v}</b>
        <small>{m}</small>
      </div>
      <i>{i}</i>
    </div>
  );
}

function ProductOverview({ data, categories = true }: { data: Data; categories?: boolean }) {
  const entries = new Map<string, {name: string; category: string; stock: number}>();
  const names = new Map<string, string>();
  for (const master of data.productMasters) {
    entries.set(master.id, {name:master.name, category:master.category?.trim() || "Uncategorised", stock:0});
    names.set(master.name.trim().toLowerCase(), master.id);
  }
  for (const batch of data.products) {
    const key = batch.productMasterId && entries.has(batch.productMasterId)
      ? batch.productMasterId : names.get(batch.name.trim().toLowerCase()) || "legacy:" + batch.name.trim().toLowerCase();
    const entry = entries.get(key) || {name:batch.name, category:"Uncategorised", stock:0};
    entry.stock += Number(batch.stock) || 0;
    entries.set(key,entry);
  }
  const products = [...entries.values()];
  const low = products.filter(p => p.stock > 0 && p.stock < 50).length;
  const out = products.filter(p => p.stock <= 0).length;
  const categoryCounts = new Map<string,{name:string;total:number;available:number}>();
  for (const p of products) {
    const key=p.category.toLowerCase(), item=categoryCounts.get(key) || {name:p.category,total:0,available:0};
    item.total++; if(p.stock>0)item.available++;
    categoryCounts.set(key,item);
  }
  const groups=[...categoryCounts.values()].sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name));
  return <section className="product-overview" aria-label="Product and stock summary">
    <div className="catalog-metrics">
      <article className="catalog-stat stat-mint"><span className="stat-icon"><Boxes size={22}/></span><div><span>Total products</span><strong>{products.length}</strong><small>Unique products in this workspace view</small></div></article>
      <article className="catalog-stat stat-amber"><span className="stat-icon"><AlertTriangle size={22}/></span><div><span>Low stock</span><strong>{low}</strong><small>Between 1 and 49 available</small></div></article>
      <article className="catalog-stat stat-rose"><span className="stat-icon"><PackagePlus size={22}/></span><div><span>Out of stock</span><strong>{out}</strong><small>Ready for stock replenishment</small></div></article>
    </div>
    {categories && groups.length>0 && <div className="category-section">
      <div className="section-title"><div><h2>Product categories</h2><p>Category mix from your saved product master.</p></div><span className="category-summary-note">Current snapshot</span></div>
      <div className="category-grid">{groups.map((group,i)=><article className={"category-card category-tone-"+(i%4)} key={group.name}>
        <div className="category-card-head"><span className="category-icon"><PackagePlus size={18}/></span><span>{Math.round(group.total / Math.max(products.length,1)*100)}% of catalog</span></div>
        <h3>{group.name}</h3><div className="category-card-total"><strong>{group.total}</strong><span>products</span></div>
        <div className="category-availability"><span>{group.available} in stock</span><span>{group.total-group.available} to replenish</span></div>
        <div className="category-meter" role="meter" aria-label={group.name+" products in stock"} aria-valuemin={0} aria-valuemax={group.total} aria-valuenow={group.available}><span style={{width:(group.available / group.total*100)+"%"}}/></div>
      </article>)}</div>
    </div>}
    <p className="stock-summary-scope">Based on catalog and batch records currently loaded. Low stock means fewer than 50 available.</p>
  </section>;
}
function Action({
  i,
  t,
  d,
  c,
}: {
  i: React.ReactNode;
  t: string;
  d: string;
  c: () => void;
}) {
  return (
    <button className="action" onClick={c}>
      <i>{i}</i>
      <span>
        <b>{t}</b>
        <small>{d}</small>
      </span>
      <ChevronRight />
    </button>
  );
}
function AlertRow({
  i,
  t,
  v,
  tone,
}: {
  i: React.ReactNode;
  t: string;
  v: number;
  tone: "amber" | "red";
}) {
  return (
    <div className={"alert-row " + tone}>
      <i>{i}</i>
      <span>
        <b>{t}</b>
        <small>
          {v ? "Review these records now" : "Nothing requires action"}
        </small>
      </span>
      <strong>{v}</strong>
    </div>
  );
}
function List({
  title,
  sub,
  action,
  click,
  children,
}: {
  title: string;
  sub: string;
  action: string;
  click: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <Head title={title} sub={sub}>
        <Button onClick={click}>
          <Plus />
          {action}
        </Button>
      </Head>
      <section className="panel table-panel">{children}</section>
    </>
  );
}
function Invoices({ rows }: { rows: Invoice[] }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Print</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.invoiceNo}</b>
              </td>
              <td>{r.invoiceDate}</td>
              <td>{r.customerName}</td>
              <td>{money(r.amount)}</td>
              <td>
                <em className={r.status === "Paid" ? "paid" : "pending"}>
                  {r.status}
                </em>
              </td>
              <td>
                <Button size="sm" variant="outline" asChild>
                  <a href={`/invoices/${r.id}/print`} target="_blank">
                    View / Print
                  </a>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty text="No invoices yet." />
  );
}
function Customers({ rows, changed }: { rows: Customer[]; changed: () => Promise<void> | void }) {
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  async function update(body: Record<string, unknown>) {
    if (!editing || !window.confirm("Are you sure you want to update this customer?")) return;
    setSaving(true); setFeedback("");
    try {
      const response = await fetch(`/api/customers/${encodeURIComponent(editing.id)}`, {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || "Unable to update customer");
      setEditing(null); setFeedback("Customer updated successfully.");
      try { await changed(); }
      catch { setFeedback("Customer saved successfully, but the list could not refresh. Reload to see the saved changes."); }
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Unable to update customer"); }
    finally { setSaving(false); }
  }
  return (
    <div>
      {feedback && <p role="status">{feedback}</p>}
      {editing && <section className="card" aria-label="Edit customer">
        <h3>Edit customer</h3>
        {feedback && <p role="alert" className="lookup-message">{feedback}</p>}
        <button type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
        <CustomerForm key={editing.id} initial={editing} busy={saving} go={update} />
      </section>}
      <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Firm</th>
            <th>GSTIN</th>
            <th>Phone</th>
            <th>Outstanding</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.name}</b>
              </td>
              <td>{r.gstin || "Unregistered"}</td>
              <td>{r.phone}</td>
              <td>{money(r.outstanding)}</td><td><button type="button" onClick={() => {setEditing(r); setFeedback("");}}>Edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div></div>
  );
}
function ProductCatalog({ rows }: { rows: ProductMaster[] }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Product Name</th>
            <th>HSN</th>
            <th>MFR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.name}</b>
              </td>
              <td>{r.hsn}</td>
              <td>{r.manufacturer}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty text="No products registered yet." />
  );
}
function Inventory({ rows }: { rows: Product[] }) {
  const [q, setQ] = useState(""),
    filtered = rows.filter((r) =>
      (r.name + " " + r.batch).toLowerCase().includes(q.toLowerCase()),
    );
  return (
    <>
      <Head
        title="Inventory & Stock"
        sub="Physical stock organised by product, pack and batch."
      />
      <div className="inventory-search">
        <Search />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search product name or batch number"
        />
      </div>
      <section className="panel table-panel">
        {filtered.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Pack</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Available Stock</th>
                  <th>Net Rate</th>
                  <th>MRP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.name}</b>
                    </td>
                    <td>{r.pack}</td>
                    <td>{r.batch}</td>
                    <td>{r.expiry}</td>
                    <td>{r.stock}</td>
                    <td>{money(r.purchaseRate)}</td>
                    <td>{money(r.mrp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No matching stock found." />
        )}
      </section>
    </>
  );
}
function Returns({ rows }: { rows: ReturnRow[] }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Return</th>
            <th>Date</th>
            <th>Type</th>
            <th>Party</th>
            <th>Reference</th>
            <th>Amount</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b>{r.returnNo}</b>
              </td>
              <td>{r.returnDate}</td>
              <td>{r.type}</td>
              <td>{r.partyName}</td>
              <td>{r.referenceNo}</td>
              <td>{money(r.amount)}</td>
              <td>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty text="No returns recorded yet." />
  );
}
function Payables({ data, open }: { data: Data; open: (m: Modal) => void }) {
  const due = data.suppliers.reduce((a, x) => a + x.outstanding, 0);
  return (
    <>
      <Head
        title="Suppliers & Payables"
        sub="Supplier masters, outstanding balances and payment history."
      >
        <div className="head-actions">
          <Button variant="outline" onClick={() => open("supplier")}>
            <Plus />
            Add supplier
          </Button>
          <Button onClick={() => open("payment")}>
            <CircleDollarSign />
            Record payment
          </Button>
        </div>
      </Head>
      <div className="metrics mini-metrics">
        <Metric
          l="Total payables"
          v={money(due)}
          m={
            data.suppliers.filter((x) => x.outstanding > 0).length +
            " suppliers with balance"
          }
          i={<WalletCards />}
        />
        <Metric
          l="Supplier payments"
          v={money(
            data.payments
              .filter((x) => x.type === "Supplier payment")
              .reduce((a, x) => a + x.amount, 0),
          )}
          m="All recorded payments"
          i={<CircleDollarSign />}
        />
      </div>
      <section className="panel table-panel module-gap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>GSTIN</th>
                <th>Phone</th>
                <th>Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>{r.gstin || "Unregistered"}</td>
                  <td>{r.phone}</td>
                  <td>{money(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Accounting({ data }: { data: Data }) {
  const sales = data.invoices.reduce((a, x) => a + x.amount, 0),
    inwards = data.purchaseInwards || [],
    purchasesTotal =
      data.purchases.reduce((a, x) => a + x.amount, 0) +
      inwards.reduce((a, x) => a + x.grandTotal, 0),
    receipts = data.payments
      .filter((x) => x.type === "Customer receipt")
      .reduce((a, x) => a + x.amount, 0),
    supplierPaid = data.payments
      .filter((x) => x.type === "Supplier payment")
      .reduce((a, x) => a + x.amount, 0),
    outputGst = (sales * 18) / 118,
    inputGst =
      data.purchases.reduce(
        (a, x) => a + (x.amount - x.amount / (1 + x.gstRate / 100)),
        0,
      ) + inwards.reduce((a, x) => a + x.igst + x.cgst + x.sgst, 0),
    net = Math.max(0, outputGst - inputGst);
  return (
    <>
      <Head
        title="Accounting & GST"
        sub="Cash movement, trading position and estimated GST from posted records."
      />
      <div className="metrics usp-metrics">
        <Metric
          l="Sales ledger"
          v={money(sales)}
          m="Gross invoiced sales"
          i={<IndianRupee />}
        />
        <Metric
          l="Purchase ledger"
          v={money(purchasesTotal)}
          m="GST-inclusive purchases"
          i={<ShoppingCart />}
        />
        <Metric
          l="Customer receipts"
          v={money(receipts)}
          m="Collections recorded"
          i={<CircleDollarSign />}
        />
        <Metric
          l="Supplier payments"
          v={money(supplierPaid)}
          m="Payments recorded"
          i={<WalletCards />}
        />
        <Metric
          l="Output GST estimate"
          v={money(outputGst)}
          m="Assumes 18% where invoice lines are unavailable"
          i={<BarChart3 />}
        />
        <Metric
          l="Input GST"
          v={money(inputGst)}
          m="From recorded purchase taxes"
          i={<BarChart3 />}
        />
        <Metric
          l="Net GST payable"
          v={money(net)}
          m="Output less eligible input"
          i={<ShieldCheck />}
        />
        <Metric
          l="Gross trading margin"
          v={money(sales - purchasesTotal)}
          m="Before returns and operating costs"
          i={<TrendingUp />}
        />
      </div>
      <section className="panel table-panel module-gap">
        <div className="panel-head">
          <div>
            <h3>Payment register</h3>
            <p>Receipts and supplier payments</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Payment</th>
                <th>Date</th>
                <th>Type</th>
                <th>Party</th>
                <th>Method</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.paymentNo}</b>
                  </td>
                  <td>{r.paymentDate}</td>
                  <td>{r.type}</td>
                  <td>{r.partyName}</td>
                  <td>{r.method}</td>
                  <td>{money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}
function Reports({
  data,
  totals,
}: {
  data: Data;
  totals: { sales: number; due: number; stock: number };
}) {
  return (
    <>
      <Head title="Reports" sub="Operational and compliance summaries." />
      <div className="report-grid">
        {[
          ["Sales register", money(totals.sales)],
          ["Outstanding ageing", money(totals.due)],
          ["Stock statement", money(totals.stock)],
          [
            "Expiry report",
            String(data.products.filter((p) => p.stock > 0).length),
          ],
          ["GST summary", "Ready"],
          ["Gross profit", "Live"],
        ].map((x) => (
          <div className="report" key={x[0]}>
            <BarChart3 />
            <span>
              <b>{x[0]}</b>
              <strong>{x[1]}</strong>
              <small>Based on central records</small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
function Admin({
  data,
  user,
  notify,
  reload,
}: {
  data: Data;
  user: { email: string };
  notify?: (s: string) => void;
  reload?: () => Promise<void> | void;
}) {
  const superAdmin =
    data.member.role === "admin" || data.member.role === "super_admin";
  return (
    <>
      <Head
        title="Settings"
        sub="Agency identity, invoice printing, access control, backups and disaster recovery."
      />
      <div className="admin-grid">
        <Info
          i={<ShieldCheck />}
          t="Verified identity"
          v={user.email}
          d="Passwords and recovery are handled by your identity provider."
        />
        <Info
          i={<Building2 />}
          t="Tenant isolation"
          v={data.tenant.companyName}
          d="All database operations are restricted to this agency."
        />
        <Info
          i={<Boxes />}
          t="Access level"
          v={superAdmin ? "Super Admin" : "Firm Owner"}
          d={
            superAdmin
              ? "Approval and override privileges enabled."
              : "Firm identity is locked after approval."
          }
        />
      </div>
      <AdminApprovals enabled={superAdmin} />
      <AgencyProfile />
      <BackupRecovery
        notify={notify || (() => {})}
        reload={reload || (() => window.location.reload())}
      />
    </>
  );
}
function Info({
  i,
  t,
  v,
  d,
}: {
  i: React.ReactNode;
  t: string;
  v: string;
  d: string;
}) {
  return (
    <div className="panel admin-card">
      {i}
      <h3>{t}</h3>
      <p>{v}</p>
      <small>{d}</small>
    </div>
  );
}
function Entry({
  type,
  close,
  data,
  busy,
  save,
}: {
  type: Modal;
  close: () => void;
  data: Data;
  busy: boolean;
  save: (p: string, b: Record<string, unknown>) => Promise<any>;
}) {
  const titles: Record<Exclude<Modal, null>, string> = {
    customer: "Add customer",
    product: "Add product",
    invoice: "Create sales invoice",
    supplier: "Add supplier",
    purchase: "Import purchase invoice",
    payment: "Record payment",
    return: "Record return",
  };
  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className={
          type === "purchase"
            ? "entry-dialog purchase-dialog"
            : type === "invoice"
              ? "entry-dialog sales-dialog"
              : type === "product"
                ? "entry-dialog product-dialog"
                : "entry-dialog"
        }
      >
        <DialogHeader>
          <DialogTitle>{type ? titles[type] : "New record"}</DialogTitle>
          <DialogDescription>
            {type === "purchase"
              ? "Extract every invoice line, verify the batch-stock review, then post the complete inward."
              : type === "invoice"
                ? "Build a multi-item GST invoice, validate each batch and save it to the sales ledger."
                : type === "product"
                  ? "Upload 2–3 views of one product, verify the extracted values, then save the product and batch."
                  : "Review the details before confirming. Every change is stored in your secure workspace."}
          </DialogDescription>
        </DialogHeader>
        {type === "customer" && (
          <CustomerForm busy={busy} go={(b) => save("/api/customers", b)} />
        )}{" "}
        {type === "product" && (
          <ProductForm busy={busy} go={(b) => save("/api/products", b)} />
        )}{" "}
        {type === "invoice" && (
          <SalesInvoiceForm
            busy={busy}
            customers={data.customers}
            products={data.products}
            productMasters={data.productMasters}
            prior={data.invoiceLines}
            go={(b) => save("/api/invoices", b)}
          />
        )}{" "}
        {type === "supplier" && (
          <SupplierForm busy={busy} go={(b) => save("/api/suppliers", b)} />
        )}{" "}
        {type === "purchase" && (
          <PurchaseInwardForm
            busy={busy}
            go={(b) => save("/api/purchase-inwards", b)}
          />
        )}{" "}
        {type === "payment" && (
          <PaymentForm
            busy={busy}
            data={data}
            go={(b) => save("/api/payments", b)}
          />
        )}{" "}
        {type === "return" && (
          <ReturnForm
            busy={busy}
            data={data}
            go={(b) => save("/api/returns", b)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
function PartyLookup({
  type,
  apply,
}: {
  type: "customer" | "supplier";
  apply: (party: LookupParty) => void;
}) {
  const [q, setQ] = useState(""),
    [loading, setLoading] = useState(false),
    [results, setResults] = useState<LookupParty[]>([]),
    [message, setMessage] = useState(""),
    [verifyUrl, setVerifyUrl] = useState("");
  async function search() {
    const value = q.trim();
    if (value.length < 2) {
      setMessage(
        "Enter a GSTIN, DL number, or at least 2 characters of the firm name.",
      );
      return;
    }
    setLoading(true);
    setMessage("");
    setVerifyUrl("");
    try {
      const response = await fetch(
          `/api/party-lookup?mode=online&type=${type}&q=${encodeURIComponent(value)}`,
        ),
        body = await response.json();
      if (!response.ok) throw new Error(body.error || "Lookup failed");
      setResults(body.results || []);
      setVerifyUrl(body.verificationUrl || "");
      if (!body.results?.length)
        setMessage(
          body.onlineConfigured
            ? "No active online record was found. Verify the identifier or enter the details manually."
            : "Online registry access needs a free-tier or approved provider API key. Manual entry remains available.",
        );
    } catch (error) {
      setResults([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "The online registry is temporarily unavailable. Enter details manually.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const value = q.trim().toUpperCase();
    if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value)) return;
    const timer = window.setTimeout(search, 600);
    return () => window.clearTimeout(timer);
  }, [q]);
  return (
    <div className="party-lookup">
      <label>
        <span>Online business registry lookup</span>
        <div>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
            placeholder="GSTIN, DL number or firm / trade name"
          />
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={search}
          >
            {loading ? "Checking registry…" : "Fetch from Online Registry"}
          </Button>
        </div>
      </label>
      <p className="lookup-help">
        Exact GSTINs are checked automatically. Name searches may return
        multiple branches.
      </p>
      {message && (
        <p className="lookup-message">
          {message}
          {verifyUrl && (
            <>
              {" "}
              <a href={verifyUrl} target="_blank" rel="noreferrer">
                Open government verification
              </a>
            </>
          )}
        </p>
      )}
      {results.length > 0 && (
        <div className="lookup-results">
          {results.map((x, index) => (
            <button
              type="button"
              key={x.id || `${x.gstin || x.dlNo}-${index}`}
              onClick={() => {
                apply(x);
                setResults([]);
                setMessage(
                  `${x.tradeName || x.name} was populated from ${x.registry || "the online registry"}. All fields remain editable.`,
                );
              }}
            >
              <b>{x.tradeName || x.name}</b>
              <span>
                {[x.address, x.state, x.gstin || x.dlNo]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <small>
                {x.registrationStatus || "Registry result"} ·{" "}
                {x.registry || "Online source"}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function CustomerForm({
  initial,
  busy,
  go,
}: {
  initial?: Customer;
  busy: boolean;
  go: (b: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
      name: initial?.name || "",
      legalName: initial?.legalName || "",
      tradeName: initial?.tradeName || "",
      phone: initial?.phone || "",
      gstin: initial?.gstin || "",
      dlNo: initial?.dlNo || "",
      address: initial?.address || "",
      city: initial?.city || "",
      state: initial?.state || "Telangana",
      stateCode: initial?.stateCode || "36",
      pinCode: initial?.pinCode || "",
      registrationStatus: initial?.registrationStatus || "Unverified",
    }),
    apply = (x: LookupParty) =>
      setF({
        ...f,
        name: x.tradeName || x.name || f.name,
        legalName: x.legalName || "",
        tradeName: x.tradeName || x.name || "",
        phone: x.phone || f.phone,
        gstin: x.gstin || "",
        dlNo: x.dlNo || "",
        address: x.address || "",
        city: x.city || "",
        state: x.state || f.state,
        stateCode: x.stateCode || x.gstin?.slice(0, 2) || f.stateCode,
        pinCode: x.pinCode || "",
        registrationStatus: x.registrationStatus || "Unverified",
      });
  return (
    <form
      className="form party-form"
      noValidate={Boolean(initial)}
      onSubmit={(e) => {
        e.preventDefault();
        go(f);
      }}
    >
      <PartyLookup type="customer" apply={apply} />
      <div className="form-row">
        <Label>
          Trade / Firm name
          <Input
            required
            value={f.name}
            onChange={(e) =>
              setF({ ...f, name: e.target.value, tradeName: e.target.value })
            }
          />
        </Label>
        <Label>
          Legal name
          <Input
            value={f.legalName}
            onChange={(e) => setF({ ...f, legalName: e.target.value })}
          />
        </Label>
      </div>
      <div className="form-row">
        <Label>
          Phone
          <Input
            required
            inputMode="tel"
            autoComplete="tel"
            pattern="[0-9]{10}"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
        </Label>
        <Label>
          GSTIN
          <Input
            maxLength={15}
            value={f.gstin}
            onChange={(e) =>
              setF({
                ...f,
                gstin: e.target.value.toUpperCase(),
                stateCode:
                  e.target.value.slice(0, 2).replace(/\D/g, "") || f.stateCode,
              })
            }
          />
        </Label>
      </div>
      <div className="form-row">
        <Label>
          Drug License No
          <Input
            value={f.dlNo}
            onChange={(e) => setF({ ...f, dlNo: e.target.value.toUpperCase() })}
          />
        </Label>
        <Label>
          Registration status
          <Input
            value={f.registrationStatus}
            onChange={(e) => setF({ ...f, registrationStatus: e.target.value })}
          />
        </Label>
      </div>
      <Label>
        Billing / Shipping address
        <Input
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
        />
      </Label>
      <div className="form-row three">
        <Label>
          City
          <Input
            value={f.city}
            onChange={(e) => setF({ ...f, city: e.target.value })}
          />
        </Label>
        <Label>
          State
          <Input
            value={f.state}
            onChange={(e) => setF({ ...f, state: e.target.value })}
          />
        </Label>
        <Label>
          Pincode
          <Input
            maxLength={6}
            value={f.pinCode}
            onChange={(e) =>
              setF({ ...f, pinCode: e.target.value.replace(/\D/g, "") })
            }
          />
        </Label>
      </div>
      <Label>
        State code
        <Input
          maxLength={2}
          value={f.stateCode}
          onChange={(e) =>
            setF({ ...f, stateCode: e.target.value.replace(/\D/g, "") })
          }
        />
      </Label>
      <Button disabled={busy}>{busy ? "Saving…" : initial ? "Update customer" : "Save customer"}</Button>
    </form>
  );
}
function ProductForm({
  busy,
  go,
}: {
  busy: boolean;
  go: (b: Record<string, unknown>) => void;
}) {
  const h1Warning =
    "Schedule H1 drug: Dispense only on the prescription of a Registered Medical Practitioner. Medical supervision is required.";
  const [f, setF] = useState({
      name: "",
      composition: "",
      hsn: "",
      manufacturer: "",
      marketedBy: "",
      pack: "",
      batch: "",
      mfgDate: "",
      expiry: "",
      mrp: "",
      isScheduleH1: false,
      isPrescriptionRequired: false,
      isHighCaution: false,
      cautionNotes: "",
    }),
    [confidence, setConfidence] = useState<Record<string, number>>({}),
    [manual, setManual] = useState<Set<string>>(new Set());
  const map: Record<string, string> = {
    name: "product_name",
    composition: "composition",
    manufacturer: "manufactured_by",
    marketedBy: "marketed_by",
    pack: "pack_size",
    batch: "batch_number",
    mfgDate: "mfg_date",
    expiry: "expiry_date",
    mrp: "mrp",
  };
  const field = (key: string) =>
    manual.has(key)
      ? "manual-field"
      : confidence[map[key]] != null && confidence[map[key]] < 0.9
        ? "low-confidence"
        : "";
  const change = (key: string, value: string) => {
    setF((x) => ({ ...x, [key]: value }));
    setManual((x) => new Set(x).add(key));
  };
  const scanned = (x: ProductScan) => {
    const values = {
      name: x.product_name,
      composition: x.composition,
      manufacturer: x.manufactured_by,
      marketedBy: x.marketed_by,
      pack: x.pack_size,
      batch: x.batch_number,
      mfgDate: x.mfg_date,
      expiry: x.expiry_date,
      mrp: x.mrp,
    };
    setF(
      (current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [
            key,
            values[key as keyof typeof values] ?? value,
          ]),
        ) as typeof current,
    );
    setConfidence(x.confidence || {});
    setManual(new Set());
  };
  return (
    <form
      className="form product-scan-form"
      onSubmit={(e) => {
        e.preventDefault();
        go(f);
      }}
    >
      <ProductImageScanner onResult={scanned} />
      <div className="scan-field-legend">
        <span>
          <i className="confidence-dot" />
          Needs verification
        </span>
        <span>
          <i className="manual-dot" />
          Manually corrected
        </span>
      </div>
      <Label>
        Product Name
        <Input
          className={field("name")}
          required
          value={f.name}
          onChange={(e) => change("name", e.target.value)}
        />
      </Label>
      <Label>
        Composition / Strength
        <Input
          className={field("composition")}
          value={f.composition}
          onChange={(e) => change("composition", e.target.value)}
        />
      </Label>
      <div className="form-row">
        <Label>
          Manufacturer
          <Input
            className={field("manufacturer")}
            required
            placeholder="Enter manufacturer"
            value={f.manufacturer}
            onChange={(e) => change("manufacturer", e.target.value)}
          />
        </Label>
        <Label>
          Marketed By
          <Input
            className={field("marketedBy")}
            placeholder="Enter marketing company"
            value={f.marketedBy}
            onChange={(e) => change("marketedBy", e.target.value)}
          />
        </Label>
      </div>
      <div className="form-row">
        <Label>
          HSN Code (optional if not printed)
          <Input
            className={field("hsn")}
            value={f.hsn}
            onChange={(e) => change("hsn", e.target.value)}
          />
        </Label>
        <Label>
          Pack Size
          <Input
            className={field("pack")}
            placeholder="Enter printed pack size"
            value={f.pack}
            onChange={(e) => change("pack", e.target.value)}
          />
        </Label>
      </div>
      <div className="review-divider">
        <span>Regulatory classification</span>
      </div>
      <div className="compliance-options">
        <label>
          <input
            type="checkbox"
            checked={f.isScheduleH1}
            onChange={(e) =>
              setF({
                ...f,
                isScheduleH1: e.target.checked,
                isPrescriptionRequired:
                  e.target.checked || f.isPrescriptionRequired,
                cautionNotes:
                  e.target.checked && !f.cautionNotes.trim()
                    ? h1Warning
                    : f.cautionNotes,
              })
            }
          />
          Schedule H1
        </label>
        <label>
          <input
            type="checkbox"
            checked={f.isPrescriptionRequired}
            onChange={(e) =>
              setF({ ...f, isPrescriptionRequired: e.target.checked })
            }
          />
          Prescription required (Rx)
        </label>
        <label>
          <input
            type="checkbox"
            checked={f.isHighCaution}
            onChange={(e) => setF({ ...f, isHighCaution: e.target.checked })}
          />
          High-caution medicine
        </label>
      </div>
      <label>
        Caution / precautions
        <small>{f.cautionNotes.length}/280 · keep to 1–2 short sentences</small>
        <textarea
          rows={3}
          maxLength={280}
          required={
            f.isScheduleH1 || f.isPrescriptionRequired || f.isHighCaution
          }
          value={f.cautionNotes}
          onChange={(e) => setF({ ...f, cautionNotes: e.target.value })}
          placeholder="Prescription-only medicine. Dispense only against a valid RMP prescription."
        />
      </label>
      <div className="review-divider">
        <span>Scanned batch details</span>
      </div>
      <div className="form-row">
        <Label>
          Batch / Lot Number
          <Input
            className={field("batch")}
            value={f.batch}
            onChange={(e) => change("batch", e.target.value.toUpperCase())}
          />
        </Label>
        <Label>
          Mfg Date (MM/YYYY)
          <Input
            className={field("mfgDate")}
            placeholder="MM/YYYY"
            value={f.mfgDate}
            onChange={(e) => change("mfgDate", e.target.value)}
          />
        </Label>
      </div>
      <div className="form-row">
        <Label>
          Expiry (MM/YYYY)
          <Input
            className={field("expiry")}
            placeholder="MM/YYYY"
            value={f.expiry}
            onChange={(e) => change("expiry", e.target.value)}
          />
        </Label>
        <Label>
          MRP ₹
          <Input
            className={field("mrp")}
            type="number"
            min="0"
            step=".01"
            value={f.mrp}
            onChange={(e) => change("mrp", e.target.value)}
          />
        </Label>
      </div>
      <div className="master-note">
        <ShieldCheck />
        <span>
          <b>Review before saving</b>Only visually supported values are filled.
          Missing values remain unchanged; batch stock is added through
          Purchase.
        </span>
      </div>
      <Button disabled={busy}>
        {busy ? "Saving…" : "Review & add product"}
      </Button>
    </form>
  );
}
function InvoiceForm({
  busy,
  data,
  go,
}: {
  busy: boolean;
  data: Data;
  go: (b: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
    customerId: data.customers[0]?.id || "",
    productId: data.products[0]?.id || "",
    quantity: "",
    freeQuantity: "0",
    unitRate: data.products[0]?.mrp?.toFixed(2) || "",
    discountPercent: "0",
    gstRate: "12",
    status: "Pending",
  });
  const recall = (customerId: string, productId: string) => {
    const prev = data.invoiceLines.find(
      (x) => x.customerId === customerId && x.productId === productId,
    );
    if (prev)
      setF((x) => ({
        ...x,
        customerId,
        productId,
        unitRate: prev.unitRate.toFixed(2),
        freeQuantity: String(prev.freeQuantity),
        discountPercent: String(prev.discountPercent),
        gstRate: String(prev.gstRate),
      }));
    else {
      const p = data.products.find((x) => x.id === productId);
      setF((x) => ({
        ...x,
        customerId,
        productId,
        unitRate: p?.mrp?.toFixed(2) || "",
        freeQuantity: "0",
        discountPercent: "0",
      }));
    }
  };
  const subtotal =
      Number(f.quantity || 0) *
      Number(f.unitRate || 0) *
      (1 - Number(f.discountPercent || 0) / 100),
    total = subtotal * (1 + Number(f.gstRate || 0) / 100),
    prior = data.invoiceLines.find(
      (x) => x.customerId === f.customerId && x.productId === f.productId,
    );
  return (
    <form
      className="form invoice-form"
      onSubmit={(e) => {
        e.preventDefault();
        go(f);
      }}
    >
      <div className="form-row">
        <Label>
          Customer
          <select
            value={f.customerId}
            onChange={(e) => recall(e.target.value, f.productId)}
          >
            {data.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Label>
        <Label>
          Product / batch
          <select
            value={f.productId}
            onChange={(e) => recall(f.customerId, e.target.value)}
          >
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.batch} · Stock {p.stock}
              </option>
            ))}
          </select>
        </Label>
      </div>
      {prior && (
        <div className="history-tip">
          <b>Previous deal found</b>
          <span>
            Rate {money(prior.unitRate)} · Free {prior.freeQuantity} · Discount{" "}
            {prior.discountPercent}% · GST {prior.gstRate}%
          </span>
        </div>
      )}
      <div className="form-row three">
        <Label>
          Sale Qty
          <Input
            required
            type="number"
            min="1"
            value={f.quantity}
            onChange={(e) => setF({ ...f, quantity: e.target.value })}
          />
        </Label>
        <Label>
          Free Qty
          <Input
            required
            type="number"
            min="0"
            value={f.freeQuantity}
            onChange={(e) => setF({ ...f, freeQuantity: e.target.value })}
          />
        </Label>
        <Label>
          Rate
          <Input
            required
            type="number"
            min=".01"
            step=".01"
            value={f.unitRate}
            onChange={(e) => setF({ ...f, unitRate: e.target.value })}
          />
        </Label>
      </div>
      <div className="form-row three">
        <Label>
          Discount %
          <Input
            required
            type="number"
            min="0"
            max="100"
            step=".01"
            value={f.discountPercent}
            onChange={(e) => setF({ ...f, discountPercent: e.target.value })}
          />
        </Label>
        <Label>
          GST %
          <select
            value={f.gstRate}
            onChange={(e) => setF({ ...f, gstRate: e.target.value })}
          >
            <option>0</option>
            <option>5</option>
            <option>12</option>
            <option>18</option>
            <option>28</option>
          </select>
        </Label>
        <Label>
          Status
          <select
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
          >
            <option>Pending</option>
            <option>Paid</option>
          </select>
        </Label>
      </div>
      <div className="invoice-total">
        <span>Invoice total</span>
        <b>{money(total)}</b>
        <small>Taxable {money(subtotal)}</small>
      </div>
      <Button disabled={busy || !f.customerId || !f.productId}>
        {busy ? "Saving…" : "Review & create invoice"}
      </Button>
    </form>
  );
}
function SupplierForm({
  busy,
  go,
}: {
  busy: boolean;
  go: (b: Record<string, unknown>) => void;
}) {
  const [f, setF] = useState({
      name: "",
      legalName: "",
      tradeName: "",
      phone: "",
      gstin: "",
      dlNo: "",
      address: "",
      city: "",
      state: "Telangana",
      stateCode: "36",
      pinCode: "",
      registrationStatus: "Unverified",
    }),
    apply = (x: LookupParty) =>
      setF({
        ...f,
        name: x.tradeName || x.name || f.name,
        legalName: x.legalName || "",
        tradeName: x.tradeName || x.name || "",
        phone: x.phone || f.phone,
        gstin: x.gstin || "",
        dlNo: x.dlNo || "",
        address: x.address || "",
        city: x.city || "",
        state: x.state || f.state,
        stateCode: x.stateCode || x.gstin?.slice(0, 2) || f.stateCode,
        pinCode: x.pinCode || "",
        registrationStatus: x.registrationStatus || "Unverified",
      });
  return (
    <form
      className="form party-form"
      onSubmit={(e) => {
        e.preventDefault();
        go(f);
      }}
    >
      <PartyLookup type="supplier" apply={apply} />
      <div className="form-row">
        <Label>
          Trade / Supplier name
          <Input
            required
            value={f.name}
            onChange={(e) =>
              setF({ ...f, name: e.target.value, tradeName: e.target.value })
            }
          />
        </Label>
        <Label>
          Legal name
          <Input
            value={f.legalName}
            onChange={(e) => setF({ ...f, legalName: e.target.value })}
          />
        </Label>
      </div>
      <div className="form-row">
        <Label>
          Phone
          <Input
            required
            pattern="\d{10}"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
        </Label>
        <Label>
          GSTIN
          <Input
            maxLength={15}
            value={f.gstin}
            onChange={(e) =>
              setF({
                ...f,
                gstin: e.target.value.toUpperCase(),
                stateCode:
                  e.target.value.slice(0, 2).replace(/\D/g, "") || f.stateCode,
              })
            }
          />
        </Label>
      </div>
      <div className="form-row">
        <Label>
          Drug License No
          <Input
            value={f.dlNo}
            onChange={(e) => setF({ ...f, dlNo: e.target.value.toUpperCase() })}
          />
        </Label>
        <Label>
          Registration status
          <Input
            value={f.registrationStatus}
            onChange={(e) => setF({ ...f, registrationStatus: e.target.value })}
          />
        </Label>
      </div>
      <Label>
        Billing / Shipping address
        <Input
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
        />
      </Label>
      <div className="form-row three">
        <Label>
          City
          <Input
            value={f.city}
            onChange={(e) => setF({ ...f, city: e.target.value })}
          />
        </Label>
        <Label>
          State
          <Input
            value={f.state}
            onChange={(e) => setF({ ...f, state: e.target.value })}
          />
        </Label>
        <Label>
          Pincode
          <Input
            maxLength={6}
            value={f.pinCode}
            onChange={(e) =>
              setF({ ...f, pinCode: e.target.value.replace(/\D/g, "") })
            }
          />
        </Label>
      </div>
      <Label>
        State code
        <Input
          maxLength={2}
          value={f.stateCode}
          onChange={(e) =>
            setF({ ...f, stateCode: e.target.value.replace(/\D/g, "") })
          }
        />
      </Label>
      <Button disabled={busy}>{busy ? "Saving…" : "Save supplier"}</Button>
    </form>
  );
}
function PaymentForm({
  busy,
  data,
  go,
}: {
  busy: boolean;
  data: Data;
  go: (b: Record<string, unknown>) => void;
}) {
  const [type, setType] = useState("Customer receipt"),
    parties = type === "Customer receipt" ? data.customers : data.suppliers;
  const [f, setF] = useState({
    partyId: "",
    amount: "",
    method: "Bank",
    notes: "",
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        go({ ...f, type, partyId: f.partyId || parties[0]?.id });
      }}
    >
      <div className="form-row">
        <Label>
          Transaction type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setF({ ...f, partyId: "" });
            }}
          >
            <option>Customer receipt</option>
            <option>Supplier payment</option>
          </select>
        </Label>
        <Label>
          Party
          <select
            value={f.partyId}
            onChange={(e) => setF({ ...f, partyId: e.target.value })}
          >
            <option value="">Select</option>
            {parties.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <div className="form-row">
        <Label>
          Amount
          <Input
            required
            type="number"
            min=".01"
            step=".01"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
        </Label>
        <Label>
          Method
          <select
            value={f.method}
            onChange={(e) => setF({ ...f, method: e.target.value })}
          >
            <option>Bank</option>
            <option>UPI</option>
            <option>Cash</option>
            <option>Cheque</option>
          </select>
        </Label>
      </div>
      <Label>
        Notes
        <Input
          value={f.notes}
          onChange={(e) => setF({ ...f, notes: e.target.value })}
        />
      </Label>
      <Button disabled={busy || !parties.length}>
        {busy ? "Saving…" : "Post payment"}
      </Button>
    </form>
  );
}
function ReturnForm({
  busy,
  data,
  go,
}: {
  busy: boolean;
  data: Data;
  go: (b: Record<string, unknown>) => void;
}) {
  const [type, setType] = useState("Sales return"),
    parties = type === "Sales return" ? data.customers : data.suppliers;
  const [f, setF] = useState({
    partyId: "",
    referenceNo: "",
    amount: "",
    reason: "",
  });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        go({ ...f, type, partyId: f.partyId || parties[0]?.id });
      }}
    >
      <div className="form-row">
        <Label>
          Return type
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setF({ ...f, partyId: "" });
            }}
          >
            <option>Sales return</option>
            <option>Purchase return</option>
          </select>
        </Label>
        <Label>
          Party
          <select
            value={f.partyId}
            onChange={(e) => setF({ ...f, partyId: e.target.value })}
          >
            <option value="">Select</option>
            {parties.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <div className="form-row">
        <Label>
          Invoice / purchase reference
          <Input
            required
            value={f.referenceNo}
            onChange={(e) => setF({ ...f, referenceNo: e.target.value })}
          />
        </Label>
        <Label>
          Return amount
          <Input
            required
            type="number"
            min=".01"
            step=".01"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
          />
        </Label>
      </div>
      <Label>
        Reason
        <Input
          required
          value={f.reason}
          onChange={(e) => setF({ ...f, reason: e.target.value })}
        />
      </Label>
      <Button disabled={busy || !parties.length}>
        {busy ? "Saving…" : "Post return"}
      </Button>
    </form>
  );
}
function initials(n: string) {
  return n
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
