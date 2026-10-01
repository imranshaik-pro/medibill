"use client";
import { useEffect, useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InventoryDeleteDialog } from "./inventory-delete-dialog";
import { Input } from "@/components/ui/input";
type Master = {
  id: string;
  name: string;
  composition: string;
  defaultPack?: string;
  hsn: string;
  manufacturer: string;
  marketedBy?: string;
  defaultGstRate?: number;
  category?: string;
  isScheduleH1: boolean;
  isPrescriptionRequired: boolean;
  isHighCaution: boolean;
  cautionNotes: string;
};
type Batch = {
  id: string;
  name: string;
  pack: string;
  batch: string;
  stock: number;
  expiry: string;
  purchaseRate: number;
  mrp: number;
  saleRate?: number;
  productMasterId?: string | null;
  catalogOnly?: boolean;
};
const currency = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  stockValue = (stock: number, rate: number) =>
    Number((Number(stock || 0) * Number(rate || 0)).toFixed(2));
async function patch(url: string, body: unknown) {
  const r = await fetch(url, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    out = await r.json();
  if (!r.ok) throw new Error(out.error);
  return out;
}
export function ProductCatalogEditor({
  rows,
  changed,
  notify,
  allowDelete,
  initialSearch = "",
}: {
  rows: Master[];
  changed: () => void;
  notify: (s: string) => void;
  allowDelete: boolean;
  initialSearch?: string;
}) {
  const [q, setQ] = useState(initialSearch);
  useEffect(() => setQ(initialSearch), [initialSearch]);
  const h1Warning =
    "Schedule H1 drug: Dispense only on the prescription of a Registered Medical Practitioner. Medical supervision is required.";
  const [selected, setSelected] = useState<Master | null>(null),
    [form, setForm] = useState<Master | null>(null),
    [deleting, setDeleting] = useState<Master | null>(null),
    [deletedIds, setDeletedIds] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  async function removeProduct() {
    const target = deleting;
    if (!target || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }),
        out = await response.json();
      if (!response.ok) throw new Error(out.error || "Unable to delete product");
      setDeletedIds((current) => [...current, target.id]);
      setDeleting(null);
      notify("Product deleted successfully");
      changed();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Delete failed");
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!form) return;
    if (
      (form.isScheduleH1 ||
        form.isPrescriptionRequired ||
        form.isHighCaution) &&
      (!form.cautionNotes.trim() || form.cautionNotes.length > 280)
    ) {
      notify("Add a concise caution note of no more than 280 characters.");
      return;
    }
    if (
      !confirm(
        "Are you sure you want to update this product master? Existing invoice snapshots will remain unchanged.",
      )
    )
      return;
    setBusy(true);
    try {
      await patch(`/api/products/${form.id}`, form);
      setSelected(null);
      setForm(null);
      changed();
      notify(`${form.name} updated successfully`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="inventory-search"><span>⌕</span><input aria-label="Search Product Master" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search product, composition, manufacturer or HSN"/>{q&&<button type="button" onClick={()=>setQ("")}>Clear</button>}</div>
      <div className="table-scroll product-master-table">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th className="composition-column">Composition</th>
              <th>Pack</th>
              <th>HSN</th>
              <th>MFR</th>
              <th>GST</th>
              <th>Category</th>
              <th>Compliance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.filter((r) => !deletedIds.includes(r.id) && q.trim().toLowerCase().split(/\s+/).every(token=>[r.name,r.composition,r.manufacturer,r.hsn].join(" ").toLowerCase().includes(token))).map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                </td>
                <td className="composition-column">{r.composition || "—"}</td>
                <td>{r.defaultPack || "—"}</td>
                <td>{r.hsn}</td>
                <td>{r.manufacturer}</td>
                <td>{r.defaultGstRate ?? 5}%</td>
                <td>{r.category || "General"}</td>
                <td>
                  <div className="compliance-tags">
                    {r.isScheduleH1 && <em>H1</em>}
                    {r.isPrescriptionRequired && <em>Rx</em>}
                    {r.isHighCaution && <em>Caution</em>}
                    {!r.isScheduleH1 &&
                      !r.isPrescriptionRequired &&
                      !r.isHighCaution && <span>General</span>}
                  </div>
                </td>
                <td>
                  <div className="row-actions">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelected(r);
                        setForm(null);
                      }}
                    >
                      <Eye />
                      View
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setSelected(r);
                        setForm({ ...r });
                      }}
                    >
                      <Pencil />
                      Edit
                    </Button>
                    {allowDelete && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="delete-product-button"
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(o) => !o && (setSelected(null), setForm(null))}
      >
        <DialogContent className="entry-dialog">
          <DialogHeader>
            <DialogTitle>
              {form ? "Edit Product" : "Product details"}
            </DialogTitle>
            <DialogDescription>
              Master changes flow to active stock batches; historical invoices
              are preserved.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="form edit-form">
              {form ? (
                <>
                  <Field
                    l="Product / brand"
                    v={form.name}
                    c={(v) => setForm({ ...form, name: v })}
                  />
                  <Field
                    l="Generic / composition"
                    v={form.composition}
                    c={(v) => setForm({ ...form, composition: v })}
                  />
                  <div className="form-row">
                    <Field
                      l="Default pack"
                      v={form.defaultPack || ""}
                      c={(v) => setForm({ ...form, defaultPack: v })}
                    />
                    <Field
                      l="HSN code"
                      v={form.hsn}
                      c={(v) => setForm({ ...form, hsn: v })}
                    />
                  </div>
                  <div className="form-row">
                    <Field
                      l="Manufacturer"
                      v={form.manufacturer}
                      c={(v) => setForm({ ...form, manufacturer: v })}
                    />
                    <label>
                      Default GST %
                      <select
                        value={form.defaultGstRate ?? 5}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            defaultGstRate: Number(e.target.value),
                          })
                        }
                      >
                        {[0, 5, 12, 18, 28].map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <Field
                    l="Category / drug schedule"
                    v={form.category || "General"}
                    c={(v) => setForm({ ...form, category: v })}
                  />
                  <div className="compliance-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(form.isScheduleH1)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            isScheduleH1: e.target.checked,
                            isPrescriptionRequired:
                              e.target.checked || form.isPrescriptionRequired,
                            cautionNotes:
                              e.target.checked && !form.cautionNotes.trim()
                                ? h1Warning
                                : form.cautionNotes,
                          })
                        }
                      />
                      Schedule H1
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(form.isPrescriptionRequired)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            isPrescriptionRequired: e.target.checked,
                          })
                        }
                      />
                      Prescription required (Rx)
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(form.isHighCaution)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            isHighCaution: e.target.checked,
                          })
                        }
                      />
                      High-caution medicine
                    </label>
                  </div>
                  <label>
                    Caution / precautions
                    <small>{form.cautionNotes.length}/280 · 1–2 sentences</small>
                    <textarea
                      maxLength={280}
                      rows={3}
                      required={
                        form.isScheduleH1 ||
                        form.isPrescriptionRequired ||
                        form.isHighCaution
                      }
                      value={form.cautionNotes || ""}
                      onChange={(e) =>
                        setForm({ ...form, cautionNotes: e.target.value })
                      }
                      placeholder="Prescription-only medicine. Dispense only against a valid RMP prescription."
                    />
                  </label>
                  <Button disabled={busy} onClick={save}>
                    {busy ? "Updating…" : "Update Product"}
                  </Button>
                </>
              ) : (
                <div className="view-grid">
                  {Object.entries({
                    Product: selected.name,
                    Composition: selected.composition || "—",
                    Pack: selected.defaultPack || "—",
                    HSN: selected.hsn,
                    Manufacturer: selected.manufacturer,
                    GST: `${selected.defaultGstRate ?? 5}%`,
                    Category: selected.category || "General",
                    Compliance:
                      [
                        selected.isScheduleH1 && "Schedule H1",
                        selected.isPrescriptionRequired && "Rx required",
                        selected.isHighCaution && "High caution",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "General",
                    Precautions: selected.cautionNotes || "—",
                  }).map(([k, v]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => !open && !busy && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete product from master?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deleting?.name}? This removes it
              from the master catalog. Products with inventory or invoice
              history cannot be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="row-actions delete-confirm-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy}
              variant="destructive"
              onClick={removeProduct}
            >
              {busy ? "Deleting…" : "Delete product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function InventoryEditor({
  rows,
  masters,
  changed,
  notify,
  allowDelete = false,
  initialSearch = "",
}: {
  rows: Batch[];
  masters: Master[];
  changed: () => void;
  notify: (s: string) => void;
  allowDelete?: boolean;
  initialSearch?: string;
}) {
  const linkedMasterIds = new Set(
      rows.map((row) => row.productMasterId).filter(Boolean),
    ),
    linkedNames = new Set(rows.map((row) => row.name.trim().toLowerCase())),
    catalogOnlyRows: Batch[] = masters
      .filter(
        (master) =>
          !linkedMasterIds.has(master.id) &&
          !linkedNames.has(master.name.trim().toLowerCase()),
      )
      .map((master) => ({
        id: `catalog:${master.id}`,
        productMasterId: master.id,
        name: master.name,
        pack: master.defaultPack || "—",
        batch: "Not inwarded",
        stock: 0,
        expiry: "—",
        purchaseRate: 0,
        mrp: 0,
        saleRate: 0,
        catalogOnly: true,
      })),
    inventoryRows = [...rows, ...catalogOnlyRows];
  const [deleting, setDeleting] = useState<Batch | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [q, setQ] = useState(initialSearch),
    [selected, setSelected] = useState<Batch | null>(null),
    [form, setForm] = useState<(Batch & { reason: string }) | null>(null),
    [busy, setBusy] = useState(false),
    filtered = inventoryRows.filter((r) => !deletedIds.includes(r.id)).filter((r) =>
      q.trim().toLowerCase().split(/\s+/).every(token=>[r.name,r.batch,r.pack].join(" ").toLowerCase().includes(token)),
    );
  useEffect(() => setQ(initialSearch), [initialSearch]);
  async function save() {
    if (
      !form ||
      !confirm(
        "Are you sure you want to update this batch? Stock balances and the audit ledger will be adjusted.",
      )
    )
      return;
    setBusy(true);
    try {
      await patch(`/api/inventory/${form.id}`, form);
      setSelected(null);
      setForm(null);
      changed();
      notify(`Batch ${form.batch} updated successfully`);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="inventory-search">
        <span>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search inventory by product, batch or pack"
          placeholder="Search product name or batch number"
        />
      </div>
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Pack</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Available</th>
                <th>Rate</th>
                <th>MRP</th>
                <th>Sale rate</th>
                <th>Stock Value</th>
                <th>Actions</th>
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
                  <td>{currency.format(r.purchaseRate)}</td>
                  <td>{currency.format(r.mrp)}</td>
                  <td>{currency.format(r.saleRate || 0)}</td>
                  <td>
                    <b>
                      {currency.format(stockValue(r.stock, r.purchaseRate))}
                    </b>
                  </td>
                  <td>
                    {r.catalogOnly ? (
                      <em className="zero-stock-status">No stock yet</em>
                    ) : <div className="row-actions">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(r);
                          setForm(null);
                        }}
                      >
                        <Eye />
                        View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelected(r);
                          setForm({ ...r, reason: "Audit Correction" });
                        }}
                      >
                        <Pencil />
                        Edit Batch
                      </Button>
                      {allowDelete && <Button type="button" size="sm" variant="outline" style={{color:"#b91c1c",borderColor:"#fecaca"}} onClick={() => setDeleting(r)}><Trash2 size={16}/>Delete</Button>}
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Dialog
        open={!!selected}
        onOpenChange={(o) => !o && (setSelected(null), setForm(null))}
      >
        <DialogContent className="entry-dialog">
          <DialogHeader>
            <DialogTitle>
              {form ? "Edit Batch & Stock" : "Batch details"}
            </DialogTitle>
            <DialogDescription>
              Every manual balance change creates a dated stock-adjustment audit
              entry.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="form edit-form">
              {form ? (
                <>
                  <div className="form-row">
                    <Field
                      l="Batch number"
                      v={form.batch}
                      c={(v) => setForm({ ...form, batch: v })}
                    />
                    <Field
                      l="Expiry MM/YY"
                      v={form.expiry}
                      c={(v) => setForm({ ...form, expiry: v })}
                    />
                  </div>
                  <div className="form-row">
                    <Num
                      l="Available stock packs"
                      v={form.stock}
                      c={(v) => setForm({ ...form, stock: v })}
                    />
                    <label>
                      Adjustment reason
                      <select
                        value={form.reason}
                        onChange={(e) =>
                          setForm({ ...form, reason: e.target.value })
                        }
                      >
                        {["Damage", "Audit Correction", "Expiry", "Return"].map(
                          (x) => (
                            <option key={x}>{x}</option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <div className="form-row three">
                    <Num
                      l="MRP ₹"
                      v={form.mrp}
                      c={(v) => setForm({ ...form, mrp: v })}
                    />
                    <Num
                      l="Purchase Rate ₹"
                      v={form.purchaseRate}
                      c={(v) => setForm({ ...form, purchaseRate: v })}
                    />
                    <Num
                      l="Sale Rate ₹"
                      v={form.saleRate || 0}
                      c={(v) => setForm({ ...form, saleRate: v })}
                    />
                  </div>
                  <div className="view-grid">
                    <div>
                      <small>Current Stock Value</small>
                      <b>
                        {currency.format(
                          stockValue(form.stock, form.purchaseRate),
                        )}
                      </b>
                    </div>
                  </div>
                  <Button disabled={busy} onClick={save}>
                    {busy ? "Updating…" : "Update Batch & Stock"}
                  </Button>
                </>
              ) : (
                <div className="view-grid">
                  {Object.entries({
                    Product: selected.name,
                    Pack: selected.pack,
                    Batch: selected.batch,
                    Expiry: selected.expiry,
                    Available: selected.stock,
                    Rate: currency.format(selected.purchaseRate),
                    MRP: currency.format(selected.mrp),
                    "Sale rate": currency.format(selected.saleRate || 0),
                    "Stock value": currency.format(
                      stockValue(selected.stock, selected.purchaseRate),
                    ),
                  }).map(([k, v]) => (
                    <div key={k}>
                      <small>{k}</small>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {deleting && <InventoryDeleteDialog key={deleting.id} target={deleting} onClose={() => setDeleting(null)} onDeleted={message => {setDeletedIds(current => [...current, deleting.id]);notify(message);changed();}}/>}
    </>
  );
}
function Field({ l, v, c }: { l: string; v: string; c: (v: string) => void }) {
  return (
    <label>
      {l}
      <Input value={v} onChange={(e) => c(e.target.value)} />
    </label>
  );
}
function Num({ l, v, c }: { l: string; v: number; c: (v: number) => void }) {
  return (
    <label>
      {l}
      <Input
        type="number"
        min="0"
        step="any"
        value={v}
        onChange={(e) => c(Number(e.target.value))}
      />
    </label>
  );
}
