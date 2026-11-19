	
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { drizzle } from "drizzle-orm/d1";
const { Miniflare } = createRequire(import.meta.url)("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const temp = mkdtempSync(root + ".master-sync-test-");
await build({entryPoints:[root+"lib/product-master-sync.ts"],outfile:temp+"/sync.mjs",bundle:true,platform:"node",format:"esm",packages:"external"});
await build({entryPoints:[root+"lib/product-master-values.ts"],outfile:temp+"/values.mjs",bundle:true,platform:"node",format:"esm",packages:"external"});
const { syncProductMaster: guardedSync } = await import(pathToFileURL(temp+"/sync.mjs"));
const { productMasterSnapshot } = await import(pathToFileURL(temp+"/values.mjs"));
import { productMasters } from "../db/schema.ts";
import { eq } from "drizzle-orm";
async function syncProductMaster(db,member,id,_previousName,values) {
 const [original] = await db.select().from(productMasters).where(eq(productMasters.id,id)).limit(1);
 return guardedSync(db,member,id,productMasterSnapshot(original),values);
}

const mf = new Miniflare({
  modules: true,
  script: 'export default {fetch(){return new Response("ok")}}',
  d1Databases: ["DB"],
  compatibilityDate: "2026-05-22",
});

const values = (name) => ({
  name,
  composition: "Paracetamol",
  defaultPack: "10 tablets",
  hsn: "3004",
  manufacturer: "Updated Manufacturer",
  marketedBy: "Test Agency",
  defaultGstRate: 5,
  category: "General",
  isScheduleH1: false,
  isPrescriptionRequired: false,
  isHighCaution: false,
  cautionNotes: "",
});

async function rows(db, query) {
  return (await db.prepare(query).all()).results;
}

try {
  const d1 = await mf.getD1Database("DB");
  const migrations = new URL("../drizzle/", import.meta.url);

  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const content = readFileSync(new URL(file, migrations), "utf8");
    for (const statement of content.split(";").filter((s) => s.trim())) {
      await d1.prepare(statement).run();
    }
  }

  await d1.prepare(`
    INSERT INTO tenants(id,company_name,created_at)
    VALUES ('A','Agency A',0),('B','Agency B',0)
  `).run();

  await d1.prepare(`
    INSERT INTO product_masters
  (id,tenant_id,name,hsn,manufacturer,created_at)
VALUES
  ('master-a','A','Original Medicine','3004','Original Maker',0),
  ('master-b','A','Other Medicine','3004','Other Maker',0),
  ('master-foreign','B','Original Medicine','3004','Foreign Maker',0)
  `).run();

  await d1.prepare(`
    INSERT INTO products
      (id,tenant_id,product_master_id,name,batch,stock,
       physical_stock,expiry,purchase_rate,mrp,created_at)
    VALUES
      ('linked-1','A','master-a','Original Medicine','B001',10,10,'2098-12',20,30,0),
      ('linked-2','A','master-a','Original Medicine','B002',15,15,'2098-12',25,35,0),
      ('unlinked','A',NULL,'Original Medicine','B003',8,8,'2098-12',12,22,0),
      ('other','A','master-b','Other Medicine','B001',7,7,'2098-12',10,20,0),
      ('foreign','B','master-foreign','Original Medicine','B001',99,99,'2098-12',50,60,0)
  `).run();

  await d1.prepare("INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('test-user','A','test@example.invalid','Test','staff',0,'active')").run();
  const db = drizzle(d1);
  const member = { id: "test-user", tenantId: "A" };

  // Duplicate Product Master names must be rejected.
  await assert.rejects(
    syncProductMaster(
      db, member, "master-a", "Original Medicine",
      values("Other Medicine"),
    ),
    /Another Product Master/,
  );

  // A conflicting unlinked inventory batch must also be rejected.
  await d1.prepare(`
    INSERT INTO products
      (id,tenant_id,name,batch,stock,expiry,purchase_rate,mrp,created_at)
    VALUES ('collision','A','New Medicine','B001',5,'2098-12',10,20,0)
  `).run();

  await assert.rejects(
    syncProductMaster(
      db, member, "master-a", "Original Medicine",
      values("New Medicine"),
    ),
    /same name and batch/,
  );

  const unchanged = await rows(
    d1,
    "SELECT name FROM product_masters WHERE id='master-a'",
  );
  assert.equal(unchanged[0].name, "Original Medicine");

  const linkedBefore = await rows(
    d1,
    "SELECT name FROM products WHERE id='linked-1'",
  );
  assert.equal(linkedBefore[0].name, "Original Medicine");

  // Successful synchronization must update only linked batches.
  await syncProductMaster(
    db, member, "master-a", "Original Medicine",
    values("Renamed Medicine"),
  );

  const master = await rows(
    d1,
    "SELECT name,hsn,manufacturer FROM product_masters WHERE id='master-a'",
  );
  assert.equal(master[0].name, "Renamed Medicine");
  assert.equal(master[0].hsn, "3004");

  const linked = await rows(
    d1,
    "SELECT name,hsn,manufacturer,stock,physical_stock,expiry,purchase_rate,mrp FROM products WHERE product_master_id='master-a' ORDER BY id",
  );
  assert.equal(linked.length, 2);
  assert.ok(linked.every((r) => r.name === "Renamed Medicine"));
  assert.ok(linked.every((r) => r.hsn === "3004"));
  assert.ok(linked.every((r) => r.manufacturer === "Updated Manufacturer"));
  assert.deepEqual(linked.map((r) => r.stock), [10, 15]);
  assert.deepEqual(linked.map((r) => r.physical_stock), [10, 15]);
  assert.deepEqual(linked.map((r) => r.purchase_rate), [20, 25]);
  assert.deepEqual(linked.map((r) => r.mrp), [30, 35]);
  assert.ok(linked.every((r) => r.expiry === "2098-12"));

  const unlinked = await rows(
    d1,
    "SELECT name FROM products WHERE id='unlinked'",
  );
  assert.equal(unlinked[0].name, "Original Medicine");

  const foreign = await rows(
    d1,
    "SELECT name,stock FROM products WHERE id='foreign'",
  );
  assert.equal(foreign[0].name, "Original Medicine");
  assert.equal(foreign[0].stock, 99);

    // Verify that a failed audit insert rolls back the entire D1 batch.
  // This trigger exists only in the isolated test database.
  await d1.prepare(`
    CREATE TRIGGER reject_product_master_audit
    BEFORE INSERT ON audit_logs
    WHEN NEW.action = 'product_master.updated'
    BEGIN
      SELECT RAISE(ABORT, 'Simulated audit insert failure');
    END
  `).run();

  await assert.rejects(
    syncProductMaster(
      db,
      member,
      "master-a",
      "Renamed Medicine",
      values("Rollback Test Medicine"),
    ),
    /Simulated audit insert failure/,
  );

  const masterAfterFailure = await rows(
    d1,
    "SELECT name FROM product_masters WHERE id='master-a'",
  );
  assert.equal(masterAfterFailure[0].name, "Renamed Medicine");

  const linkedAfterFailure = await rows(
    d1,
    "SELECT name FROM products WHERE product_master_id='master-a'",
  );
  assert.equal(linkedAfterFailure.length, 2);
  assert.ok(
    linkedAfterFailure.every((r) => r.name === "Renamed Medicine"),
  );

  const auditsAfterFailure = await rows(
    d1,
    "SELECT action FROM audit_logs WHERE tenant_id='A'",
  );
  assert.equal(auditsAfterFailure.length, 1);

  console.log(
    "PASS: Product Master synchronization, duplicate names, batch conflicts, linked inventory, tenant isolation, stock preservation and audit.",
  );
} finally {
  await mf.dispose();
  rmSync(temp,{recursive:true,force:true});
}
	