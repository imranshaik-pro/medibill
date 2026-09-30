"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Customer = {
  id: string;
  name: string;
  phone: string;
  gstin: string | null;
  dlNo?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  stateCode?: string | null;
};
type Product = {
  id: string;
  productMasterId?: string | null;
  name: string;
  hsn: string;
  pack: string;
  manufacturer: string;
  batch: string;
  stock: number;
  expiry: string;
  purchaseRate: number;
  mrp: number;
};
type Master = {
  id: string;
  name: string;
  composition: string;
  isScheduleH1?: boolean;
  isPrescriptionRequired?: boolean;
  isHighCaution?: boolean;
  cautionNotes?: string;
};
type Prior = {
  customerId: string;
  productId: string;
  unitRate: number;
  freeQuantity: number;
  discountPercent: number;
  gstRate: number;
};
type Row = {
  productName: string;
  productId: string;
  quantity: number;
  freeQuantity: number;
  unitRate: number;
  discountPercent: number;
  gstRate: number;
};
const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100,
  empty = (): Row => ({
    productName: "",
    productId: "",
    quantity: 0,
    freeQuantity: 0,
    unitRate: 0,
    discountPercent: 0,
    gstRate: 5,
  });
function words(n: number) {
  const o = [
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
    t = [
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
    u = (x: number): string =>
      x < 20 ? o[x] : t[Math.floor(x / 10)] + (x % 10 ? " " + o[x % 10] : ""),
    h = (x: number) =>
      x < 100
        ? u(x)
        : o[Math.floor(x / 100)] +
          " Hundred" +
          (x % 100 ? " " + u(x % 100) : "");
  let x = Math.max(0, Math.round(n)),
    s = "";
  for (const [v, k] of [
    [1e7, "Crore"],
    [1e5, "Lakh"],
    [1e3, "Thousand"],
  ] as const)
    if (x >= v) {
      s += h(Math.floor(x / v)) + " " + k + " ";
      x %= v;
    }
  return (s + h(x)).trim() + " Rupees Only";
}
export function SalesInvoiceForm({
  busy,
  customers,
  products,
  productMasters,
  prior,
  initial,
  go,
}: {
  busy: boolean;
  customers: Customer[];
  products: Product[];
  productMasters: Master[];
  prior: Prior[];
  initial?: { header: Record<string, any>; lines: Array<Record<string, any>> };
  go: (b: Record<string, unknown>) => Promise<{ id: string }>;
}) {
  const now = new Date(),
    h = initial?.header,
    [head, setHead] = useState({
      invoiceType: h?.invoiceType || "Tax Invoice",
      invoiceDate: h?.invoiceDate || now.toISOString().slice(0, 10),
      invoiceTime: h?.invoiceTime || now.toTimeString().slice(0, 5),
      paymentMode: h?.paymentMode || "Credit",
      paymentTerms: h?.paymentTerms || "30 Days",
      dueDate: h?.dueDate || "",
      customerId: h?.customerId || customers[0]?.id || "",
      sellerStateCode: h?.sellerStateCode || "36",
      transportName: h?.transportName || "",
      vehicleNo: h?.vehicleNo || "",
      lrNo: h?.lrNo || "",
      freightAmount: Number(h?.freightAmount || 0),
      freightGstRate: Number(h?.freightGstRate || 5),
      insuranceAmount: Number(h?.insuranceAmount || 0),
      insuranceGstRate: Number(h?.insuranceGstRate || 18),
      cashDiscountType: "flat",
      cashDiscount: Number(h?.cashDiscount || 0),
      status: h?.status || "Pending",
      prescriptionDoctorName: h?.prescriptionDoctorName || "",
      prescriptionDoctorRegistration:
        h?.prescriptionDoctorRegistration || "",
      complianceAcknowledged: Boolean(h?.complianceAcknowledged),
    }),
    [rows, setRows] = useState<Row[]>(
      initial?.lines?.map((x) => ({
        productName: String(x.productName),
        productId: String(x.productId),
        quantity: Number(x.quantity),
        freeQuantity: Number(x.freeQuantity),
        unitRate: Number(x.unitRate),
        discountPercent: Number(x.discountPercent),
        gstRate: Number(x.gstRate),
      })) || [empty()],
    );
  const [complianceAlert, setComplianceAlert] = useState<Master | null>(null),
    [acknowledgedProducts, setAcknowledgedProducts] = useState<Set<string>>(
      new Set(
        h?.complianceAcknowledged
          ? productMasters
              .filter(
                (m) =>
                  m.isScheduleH1 ||
                  m.isPrescriptionRequired ||
                  m.isHighCaution,
              )
              .map((m) => m.id)
          : [],
      ),
    );
  const customer = customers.find((c) => c.id === head.customerId),
    setRow = (i: number, p: Partial<Row>) =>
      setRows((x) => x.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const masterFor = (p?: Product) =>
      productMasters.find(
        (m) => m.id === p?.productMasterId || m.name === p?.name,
      ),
    alertIfRequired = (p?: Product) => {
      const master = masterFor(p);
      if (
        master &&
        (master.isScheduleH1 ||
          master.isPrescriptionRequired ||
          master.isHighCaution) &&
        !acknowledgedProducts.has(master.id)
      )
        setComplianceAlert(master);
    };
  const chooseProduct = (i: number, name: string) => {
    const options = products.filter((p) => p.name === name && p.stock > 0),
      p = options[0],
      deal =
        p &&
        prior.find(
          (x) => x.customerId === head.customerId && x.productId === p.id,
        );
    setRow(i, {
      productName: name,
      productId: p?.id || "",
      unitRate: deal?.unitRate ?? p?.mrp ?? 0,
      freeQuantity: deal?.freeQuantity ?? 0,
      discountPercent: deal?.discountPercent ?? 0,
      gstRate: deal?.gstRate ?? 5,
    });
    alertIfRequired(p);
  };
  const chooseBatch = (i: number, id: string) => {
    const p = products.find((x) => x.id === id),
      deal = prior.find(
        (x) => x.customerId === head.customerId && x.productId === id,
      );
    setRow(i, {
      productId: id,
      productName: p?.name || "",
      unitRate: deal?.unitRate ?? p?.mrp ?? 0,
      freeQuantity: deal?.freeQuantity ?? 0,
      discountPercent: deal?.discountPercent ?? 0,
      gstRate: deal?.gstRate ?? 5,
    });
    alertIfRequired(p);
  };
  const regulatedMasters = Array.from(
      new Map(
        rows
          .map((r) => masterFor(products.find((p) => p.id === r.productId)))
          .filter(
            (m): m is Master =>
              Boolean(
                m &&
                  (m.isScheduleH1 ||
                    m.isPrescriptionRequired ||
                    m.isHighCaution),
              ),
          )
          .map((m) => [m.id, m]),
      ).values(),
    ),
    complianceRequired = regulatedMasters.length > 0;
  const calc = useMemo(() => {
    const lines = rows.map((r) => {
        const p = products.find((x) => x.id === r.productId),
          gross = r.quantity * r.unitRate,
          discount = (gross * r.discountPercent) / 100,
          taxable = round(gross - discount),
          gst = round((taxable * r.gstRate) / 100);
        return {
          ...r,
          p,
          gross,
          discount,
          taxable,
          gst,
          total: round(taxable + gst),
          invalid: Boolean(p && r.quantity + r.freeQuantity > p.stock),
        };
      }),
      lineTaxable = lines.reduce((s, r) => s + r.taxable, 0),
      lineDiscount = lines.reduce((s, r) => s + r.discount, 0),
      charges = head.freightAmount + head.insuranceAmount,
      chargeTax =
        (head.freightAmount * head.freightGstRate) / 100 +
        (head.insuranceAmount * head.insuranceGstRate) / 100,
      before = lineTaxable + charges,
      cash =
        head.cashDiscountType === "percent"
          ? (before * head.cashDiscount) / 100
          : head.cashDiscount,
      taxScale = before ? Math.max(0, before - cash) / before : 1,
      totalTax = round(
        (lines.reduce((s, r) => s + r.gst, 0) + chargeTax) * taxScale,
      ),
      intra = Boolean(
        customer?.stateCode &&
        customer.stateCode.padStart(2, "0") ===
          head.sellerStateCode.padStart(2, "0"),
      ),
      taxable = round(Math.max(0, before - cash)),
      net = round(taxable + totalTax),
      grand = Math.round(net);
    return {
      lines,
      lineTaxable,
      lineDiscount,
      cash,
      totalTax,
      cgst: intra ? round(totalTax / 2) : 0,
      sgst: intra ? round(totalTax - round(totalTax / 2)) : 0,
      igst: intra ? 0 : totalTax,
      roundOff: round(grand - net),
      grand,
      totalQty: rows.reduce((s, r) => s + r.quantity + r.freeQuantity, 0),
      invalid: lines.some((r) => r.invalid),
    };
  }, [rows, products, head, customer]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (calc.invalid) return;
    if (
      complianceRequired &&
      (!head.prescriptionDoctorName.trim() ||
        !head.prescriptionDoctorRegistration.trim())
    ) {
      setComplianceAlert(regulatedMasters[0]);
      return;
    }
    const out = await go({
      ...head,
      complianceAcknowledged:
        complianceRequired &&
        regulatedMasters.every((m) => acknowledgedProducts.has(m.id)),
      items: rows.map(({ productName, ...r }) => r),
    });
    window.open(`/invoices/${out.id}/print`, `_blank`, `noopener,noreferrer`);
  }
  return (
    <form className="sales-engine" onSubmit={submit}>
      {complianceAlert && (
        <div className="compliance-alert-backdrop" role="presentation">
          <section
            className="compliance-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="medicine-warning-title"
          >
            <AlertTriangle />
            <div>
              <span className="alert-kicker">Regulatory medicine warning</span>
              <h2 id="medicine-warning-title">{complianceAlert.name}</h2>
              <div className="compliance-tags">
                {complianceAlert.isScheduleH1 && <em>Schedule H1</em>}
                {complianceAlert.isPrescriptionRequired && <em>Rx required</em>}
                {complianceAlert.isHighCaution && <em>High caution</em>}
              </div>
              <p>
                {complianceAlert.cautionNotes ||
                  "Prescription-only medicine. Dispense only against a valid RMP prescription."}
              </p>
              <small>
                Doctor name and registration number are mandatory before this
                invoice can be saved.
              </small>
            </div>
            <Button
              type="button"
              onClick={() => {
                setAcknowledgedProducts(
                  (current) => new Set(current).add(complianceAlert.id),
                );
                setComplianceAlert(null);
              }}
            >
              I understand — continue
            </Button>
          </section>
        </div>
      )}
      <section className="sales-card">
        <header>
          <h3>Invoice & payment</h3>
          <span>
            Next number: INV-{String(now.getFullYear()).slice(-2)}-XXXX
          </span>
        </header>
        <div className="sales-fields">
          <L l="Invoice type">
            <select
              value={head.invoiceType}
              onChange={(e) =>
                setHead({ ...head, invoiceType: e.target.value })
              }
            >
              <option>Tax Invoice</option>
              <option>Bill of Supply</option>
            </select>
          </L>
          <L l="Invoice date">
            <Input
              type="date"
              value={head.invoiceDate}
              onChange={(e) =>
                setHead({ ...head, invoiceDate: e.target.value })
              }
            />
          </L>
          <L l="Time">
            <Input
              type="time"
              value={head.invoiceTime}
              onChange={(e) =>
                setHead({ ...head, invoiceTime: e.target.value })
              }
            />
          </L>
          <L l="Payment mode">
            <select
              value={head.paymentMode}
              onChange={(e) =>
                setHead({
                  ...head,
                  paymentMode: e.target.value,
                  status: e.target.value === "Credit" ? "Pending" : "Paid",
                })
              }
            >
              {["Cash", "Credit", "UPI", "Cheque", "Bank Transfer"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </L>
          <L l="Payment terms">
            <select
              value={head.paymentTerms}
              onChange={(e) =>
                setHead({ ...head, paymentTerms: e.target.value })
              }
            >
              {["Immediate", "15 Days", "30 Days", "45 Days", "60 Days"].map(
                (x) => (
                  <option key={x}>{x}</option>
                ),
              )}
            </select>
          </L>
          <L l="Due date">
            <Input
              type="date"
              value={head.dueDate}
              onChange={(e) => setHead({ ...head, dueDate: e.target.value })}
            />
          </L>
          <L l="Seller state code">
            <Input
              maxLength={2}
              value={head.sellerStateCode}
              onChange={(e) =>
                setHead({
                  ...head,
                  sellerStateCode: e.target.value.replace(/\D/g, ""),
                })
              }
            />
          </L>
        </div>
      </section>
      {complianceRequired && (
        <section className="sales-card prescription-card">
          <header>
            <div>
              <h3>Prescription & RMP details</h3>
              <span>Required for Schedule H1 / Rx items in this invoice</span>
            </div>
            <div className="compliance-tags">
              {regulatedMasters.map((m) => (
                <em key={m.id}>{m.name}</em>
              ))}
            </div>
          </header>
          <div className="sales-fields">
            <L l="Doctor / RMP name">
              <Input
                required
                value={head.prescriptionDoctorName}
                onChange={(e) =>
                  setHead({
                    ...head,
                    prescriptionDoctorName: e.target.value,
                  })
                }
              />
            </L>
            <L l="RMP registration number">
              <Input
                required
                value={head.prescriptionDoctorRegistration}
                onChange={(e) =>
                  setHead({
                    ...head,
                    prescriptionDoctorRegistration:
                      e.target.value.toUpperCase(),
                  })
                }
              />
            </L>
          </div>
        </section>
      )}
      <section className="sales-card">
        <header>
          <h3>Customer / buyer</h3>
        </header>
        <div className="sales-fields customer-fields">
          <L l="Search customer">
            <select
              required
              value={head.customerId}
              onChange={(e) => setHead({ ...head, customerId: e.target.value })}
            >
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </L>
          <Info l="DL No" v={customer?.dlNo} />
          <Info l="GSTIN" v={customer?.gstin} />
          <Info l="Phone" v={customer?.phone} />
          <Info
            l="Address"
            v={[customer?.address, customer?.city, customer?.state]
              .filter(Boolean)
              .join(", ")}
          />
          <Info l="State code" v={customer?.stateCode} />
        </div>
      </section>
      <section className="sales-card">
        <header>
          <h3>Medicine items</h3>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRows((x) => [...x, empty()])}
          >
            <Plus />
            Add Product Row
          </Button>
        </header>
        <div className="sales-grid">
          <table>
            <thead>
              <tr>
                {[
                  "#",
                  "Medicine",
                  "Batch / Expiry / Stock / MRP",
                  "Expiry",
                  "Pack",
                  "HSN",
                  "Available",
                  "Billed",
                  "Free",
                  "MRP ₹",
                  "Sale rate ₹",
                  "Disc %",
                  "Taxable ₹",
                  "GST %",
                  "GST ₹",
                  "Net ₹",
                  "",
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calc.lines.map((r, i) => (
                <tr key={i} className={r.invalid ? "stock-error" : ""}>
                  <td>{i + 1}</td>
                  <td>
                    <input
                      list="medicine-list"
                      value={r.productName}
                      onChange={(e) => chooseProduct(i, e.target.value)}
                      placeholder="Search brand"
                    />
                    <datalist id="medicine-list">
                      {productMasters.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.composition || m.name}
                        </option>
                      ))}
                    </datalist>
                  </td>
                  <td>
                    <select
                      required
                      value={r.productId}
                      onChange={(e) => chooseBatch(i, e.target.value)}
                    >
                      <option value="">Select batch</option>
                      {products
                        .filter((p) => p.name === r.productName && p.stock > 0)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.batch} | {p.expiry} | Stock {p.stock} | MRP ₹
                            {p.mrp}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td>{r.p?.expiry || "—"}</td>
                  <td>{r.p?.pack || "—"}</td>
                  <td>{r.p?.hsn || "—"}</td>
                  <td>
                    <span
                      className={
                        (r.p?.stock || 0) < 20 ? "stock-low" : "stock-ok"
                      }
                    >
                      {r.p?.stock || 0}
                    </span>
                  </td>
                  <td>
                    <N v={r.quantity} c={(v) => setRow(i, { quantity: v })} />
                  </td>
                  <td>
                    <N
                      v={r.freeQuantity}
                      c={(v) => setRow(i, { freeQuantity: v })}
                    />
                  </td>
                  <td>{r.p?.mrp?.toFixed(2) || "0.00"}</td>
                  <td>
                    <N v={r.unitRate} c={(v) => setRow(i, { unitRate: v })} />
                  </td>
                  <td>
                    <N
                      v={r.discountPercent}
                      c={(v) => setRow(i, { discountPercent: v })}
                    />
                  </td>
                  <td>
                    <b>{r.taxable.toFixed(2)}</b>
                  </td>
                  <td>
                    <select
                      value={r.gstRate}
                      onChange={(e) =>
                        setRow(i, { gstRate: Number(e.target.value) })
                      }
                    >
                      {[0, 5, 12, 18, 28].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </td>
                  <td>{r.gst.toFixed(2)}</td>
                  <td>
                    <b>{r.total.toFixed(2)}</b>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="row-delete"
                      onClick={() =>
                        setRows((x) => x.filter((_, j) => j !== i))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && i === rows.length - 1) {
                          e.preventDefault();
                          setRows((x) => [...x, empty()]);
                        }
                      }}
                    >
                      <Trash2 />
                    </button>
                    {r.invalid && (
                      <small className="stock-warning">
                        <AlertTriangle />
                        Exceeds stock
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="sales-lower">
        <section className="sales-card">
          <header>
            <h3>Charges & transport</h3>
          </header>
          <div className="sales-fields">
            <L l="Freight ₹">
              <N
                v={head.freightAmount}
                c={(v) => setHead({ ...head, freightAmount: v })}
              />
            </L>
            <L l="Freight GST %">
              <select
                value={head.freightGstRate}
                onChange={(e) =>
                  setHead({ ...head, freightGstRate: Number(e.target.value) })
                }
              >
                {[0, 5, 12, 18, 28].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </L>
            <L l="Insurance / handling ₹">
              <N
                v={head.insuranceAmount}
                c={(v) => setHead({ ...head, insuranceAmount: v })}
              />
            </L>
            <L l="Insurance GST %">
              <select
                value={head.insuranceGstRate}
                onChange={(e) =>
                  setHead({ ...head, insuranceGstRate: Number(e.target.value) })
                }
              >
                {[0, 5, 12, 18, 28].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </L>
            <L l="Transport">
              <Input
                value={head.transportName}
                onChange={(e) =>
                  setHead({ ...head, transportName: e.target.value })
                }
              />
            </L>
            <L l="Vehicle No">
              <Input
                value={head.vehicleNo}
                onChange={(e) =>
                  setHead({ ...head, vehicleNo: e.target.value })
                }
              />
            </L>
            <L l="LR No">
              <Input
                value={head.lrNo}
                onChange={(e) => setHead({ ...head, lrNo: e.target.value })}
              />
            </L>
            <L l="Cash / scheme discount">
              <span className="joined">
                <select
                  value={head.cashDiscountType}
                  onChange={(e) =>
                    setHead({ ...head, cashDiscountType: e.target.value })
                  }
                >
                  <option value="flat">₹</option>
                  <option value="percent">%</option>
                </select>
                <N
                  v={head.cashDiscount}
                  c={(v) => setHead({ ...head, cashDiscount: v })}
                />
              </span>
            </L>
          </div>
        </section>
        <section className="sale-summary">
          <h3>Bill summary</h3>
          {[
            ["Total quantity", calc.totalQty],
            ["Gross taxable", calc.lineTaxable],
            ["Line discount", calc.lineDiscount],
            ["Cash / scheme discount", calc.cash],
            ["CGST", calc.cgst],
            ["SGST", calc.sgst],
            ["IGST", calc.igst],
            ["Round off", calc.roundOff],
          ].map(([l, v]) => (
            <p key={String(l)}>
              <span>{l}</span>
              <b>
                {typeof v === "number" && l !== "Total quantity"
                  ? `₹${v.toFixed(2)}`
                  : v}
              </b>
            </p>
          ))}
          <div>
            <span>Net payable</span>
            <strong>₹{calc.grand.toFixed(2)}</strong>
            <small>{words(calc.grand)}</small>
          </div>
        </section>
      </div>
      <footer className="sales-actions">
        <span>
          {calc.invalid
            ? "Correct stock warnings before saving."
            : `${rows.length} line(s) ready · stock will be deducted by billed + free quantity.`}
        </span>
        <Button
          disabled={
            busy ||
            calc.invalid ||
            !head.customerId ||
            (complianceRequired &&
              (!head.prescriptionDoctorName.trim() ||
                !head.prescriptionDoctorRegistration.trim() ||
                !regulatedMasters.every((m) =>
                  acknowledgedProducts.has(m.id),
                ))) ||
            rows.some((r) => !r.productId || r.quantity <= 0)
          }
        >
          {busy ? "Saving invoice…" : "Save & Print"}
        </Button>
      </footer>
    </form>
  );
}
function L({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <label>
      {l}
      {children}
    </label>
  );
}
function Info({ l, v }: { l: string; v?: string | null }) {
  return (
    <label>
      <span>{l}</span>
      <b>{v || "Not recorded"}</b>
    </label>
  );
}
function N({ v, c }: { v: number; c: (n: number) => void }) {
  return (
    <Input
      type="number"
      min="0"
      step="any"
      value={v || ""}
      onChange={(e) => c(Number(e.target.value))}
    />
  );
}
