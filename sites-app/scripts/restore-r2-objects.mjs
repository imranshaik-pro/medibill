import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bucket = process.argv[2];
if (!bucket) throw new Error("Usage: node scripts/restore-r2-objects.mjs <R2_BUCKET_NAME> [--remote]");
const remote = process.argv.includes("--remote");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "r2-object-manifest.json"), "utf8"));
for (const object of manifest.objects || []) {
  if (!/^(agency-assets|registration-assets|purchase-documents|backups)\//.test(object.key))
    throw new Error(`Unsafe object key: ${object.key}`);
  const file = path.join(root, "object-storage", ...object.key.split("/"));
  if (!fs.existsSync(file)) throw new Error(`Missing exported object: ${object.key}`);
  const args = ["wrangler", "r2", "object", "put", `${bucket}/${object.key}`, "--file", file];
  if (remote) args.push("--remote");
  const result = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`Failed to restore ${object.key}`);
}
console.log(`Restored ${(manifest.objects || []).length} objects to ${bucket}`);
