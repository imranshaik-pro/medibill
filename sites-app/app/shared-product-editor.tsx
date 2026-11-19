"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { productMasterSnapshot } from "@/lib/product-master-values";

export type EditableProductMaster = {
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

type Props = {
  product: EditableProductMaster;
  onSaved: () => void;
  notify: (message: string) => void;
  onCancel: () => void;
};

export function SharedProductEditor({ product, onSaved, notify, onCancel }: Props) {
  const [original] = useState(() => productMasterSnapshot(product));
  const [form, setForm] = useState<EditableProductMaster>({ ...product, ...original });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (busy) return;

    if (!form.name.trim() || !form.manufacturer.trim()) {
      notify("Product name and manufacturer are required.");
      return;
    }

    if (
      (form.isScheduleH1 || form.isPrescriptionRequired || form.isHighCaution) &&
      (!form.cautionNotes.trim() || form.cautionNotes.length > 280)
    ) {
      notify("Flagged medicines require a caution note of up to 280 characters.");
      return;
    }

    if (!confirm("Update this product and its linked inventory batches? Historical invoices will remain unchanged.")) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(form.id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, original }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Unable to update product");
      }

      const warning = result && typeof result === "object" && "backupWarning" in result && typeof result.backupWarning === "string" ? result.backupWarning : "";
      notify(`${form.name} updated successfully${warning ? `. ${warning}` : ""}`);
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Update failed";
      setError(message);
      notify(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="form edit-form" disabled={busy} style={{border: 0, padding: 0, margin: 0, minWidth: 0}}>
      <label>
        Product / brand
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        Generic / composition
        <Input value={form.composition} onChange={(e) => setForm({ ...form, composition: e.target.value })} />
      </label>
      <div className="form-row">
        <label>
          Default pack
          <Input value={form.defaultPack || ""} onChange={(e) => setForm({ ...form, defaultPack: e.target.value })} />
        </label>
        <label>
          HSN code
          <Input value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Manufacturer
          <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
        </label>
        <label>
          Default GST %
          <select
            value={form.defaultGstRate ?? 5}
            onChange={(e) => setForm({ ...form, defaultGstRate: Number(e.target.value) })}
          >
            {[0, 5, 12, 18, 28].map((rate) => (
              <option key={rate} value={rate}>{rate}%</option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Marketed by
        <Input value={form.marketedBy || ""} onChange={(e) => setForm({ ...form, marketedBy: e.target.value })} />
      </label>
      <label>
        Category / drug schedule
        <Input value={form.category || "General"} onChange={(e) => setForm({ ...form, category: e.target.value })} />
      </label>
      <div className="compliance-options">
        <label>
          <input
            type="checkbox"
            checked={form.isScheduleH1}
            onChange={(e) => setForm({
              ...form,
              isScheduleH1: e.target.checked,
              isPrescriptionRequired: e.target.checked || form.isPrescriptionRequired,
            })}
          />
          Schedule H1
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isPrescriptionRequired}
            onChange={(e) => setForm({ ...form, isPrescriptionRequired: e.target.checked })}
          />
          Prescription required
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isHighCaution}
            onChange={(e) => setForm({ ...form, isHighCaution: e.target.checked })}
          />
          High-caution medicine
        </label>
      </div>
      <label>
        Caution / precautions
        <textarea
          rows={3}
          maxLength={280}
          value={form.cautionNotes || ""}
          onChange={(e) => setForm({ ...form, cautionNotes: e.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="row-actions">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={busy} onClick={save}>
          {busy ? "Updating..." : "Update Product"}
        </Button>
      </div>
    </fieldset>
  );
}

