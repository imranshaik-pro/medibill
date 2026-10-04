import fs from "node:fs";
const [databaseId,bucketName,origin]=process.argv.slice(2);
if (!/^[a-f0-9-]{36}$/.test(databaseId||"") || !/^[a-z0-9-]{3,63}$/.test(bucketName||"")) throw new Error("Usage: node scripts/prepare-cloudflare.mjs DATABASE_ID BUCKET_NAME HTTPS_ORIGIN");
const u=new URL(origin);
if(u.protocol!=="https:" || u.pathname!=="/" || u.search || u.hash || u.username || u.password) throw new Error("Provide the exact HTTPS deployment origin");
const source=JSON.parse(fs.readFileSync("dist/server/wrangler.json","utf8"));
const config={name:"medibill-pro",main:source.main,compatibility_date:source.compatibility_date,compatibility_flags:source.compatibility_flags,assets:source.assets,d1_databases:[{binding:"DB",database_name:"medibill-production",database_id:databaseId}],r2_buckets:[{binding:"BUCKET",bucket_name:bucketName}],vars:{AUTH_MODE:"google",AUTH_BASE_URL:u.origin}};
fs.writeFileSync("dist/server/wrangler.cloudflare.json",JSON.stringify(config,null,2));
console.log("Cloudflare configuration prepared. Credentials must be set separately as Worker secrets. Nothing was deployed.");
