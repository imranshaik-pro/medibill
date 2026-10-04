import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = process.argv[2] || path.join(root, "data", "d1-full-export.json");
const outputPath = process.argv[3] || path.join(root, "data", "d1-full-import.sql");
const snapshot = JSON.parse(fs.readFileSync(inputPath, "utf8"));
if (!snapshot?.tables || typeof snapshot.tables !== "object") throw new Error("Invalid D1 export");

const childFirst = [
  "audit_logs", "backup_records", "stock_adjustments", "invoice_lines",
  "purchase_charges", "purchase_inward_items", "payments", "returns",
  "purchases", "invoices", "purchase_inwards", "products", "product_masters",
  "customers", "suppliers", "agency_profiles", "backup_settings",
  "firm_registrations", "users", "tenants",
];
const parentFirst = [...childFirst].reverse();
const quoteId = (value) => `"${String(value).replaceAll('"', '""')}"`;
const quoteValue = (value) => value === null || value === undefined
  ? "NULL"
  : typeof value === "number"
    ? (Number.isFinite(value) ? String(value) : "NULL")
    : typeof value === "boolean"
      ? (value ? "1" : "0")
      : `'${String(value).replaceAll("'", "''")}'`;

const statements = ["PRAGMA foreign_keys = OFF;", "BEGIN IMMEDIATE;"];
for (const table of childFirst) {
  if (snapshot.tables[table]) statements.push(`DELETE FROM ${quoteId(table)};`);
}
for (const table of parentFirst) {
  const payload = snapshot.tables[table];
  if (!payload) continue;
  for (const row of payload.rows || []) {
    const columns = Object.keys(row);
    if (!columns.length) continue;
    statements.push(
      `INSERT INTO ${quoteId(table)} (${columns.map(quoteId).join(", ")}) VALUES (${columns.map((column) => quoteValue(row[column])).join(", ")});`,
    );
  }
}
statements.push("COMMIT;", "PRAGMA foreign_keys = ON;", "PRAGMA optimize;");
fs.writeFileSync(outputPath, `${statements.join("\n")}\n`, { mode: 0o600 });
console.log(`Created ${outputPath}`);
