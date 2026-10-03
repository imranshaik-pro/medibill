import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {drizzle} from 'drizzle-orm/d1';
import {Miniflare} from 'miniflare';
const root=fileURLToPath(new URL('../',import.meta.url));const temp=fs.mkdtempSync(root+'.customer-test-');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB'],compatibilityDate:'2026-05-22'});
try {
 for(const [src,out] of [['db/schema.ts','schema.mjs'],['lib/customer-update.ts','update.mjs']])fs.writeFileSync(temp+'/'+out,ts.transpileModule(fs.readFileSync(root+src,'utf8').replace('"../db/schema"','"./schema.mjs"'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
 const {persistCustomerEdit:edit}=await import(pathToFileURL(temp+'/update.mjs'));
 const DB=await mf.getD1Database('DB');
 for(const f of fs.readdirSync(root+'drizzle').filter(x=>x.endsWith('.sql')).sort())for(const sql of fs.readFileSync(root+'drizzle/'+f,'utf8').split(';').filter(s=>s.trim()))await DB.prepare(sql).run();
 for(const sql of ["INSERT INTO tenants VALUES('A','Agency',0),('B','Other',0)","INSERT INTO users(id,tenant_id,email,display_name,role,created_at,status) VALUES('U','A','u@test.invalid','Admin','super_admin',0,'active')", "INSERT INTO customers(id,tenant_id,name,phone,address,outstanding,created_at) VALUES('C','A','Customer','040-12345678','Address',123.45,0),('F','B','Foreign','9000000000','Foreign Address',0,0),('D','A','Duplicate','9000000001',NULL,0,0)"])await DB.prepare(sql).run();
 const db=drizzle(DB);const member={id:'U',tenantId:'A',role:'super_admin',status:'active'};
 let result=await edit(db,member,'C',{name:'Corrected Customer',phone:'040-12345678'});
 assert.equal(result.name,'Corrected Customer');assert.equal(result.address,'Address');assert.equal(result.outstanding,123.45);
 result=await edit(db,member,'C',{phone:'+91 98765-43210',city:'Hyderabad'});assert.equal(result.phone,'9876543210');assert.equal(result.city,'Hyderabad');
 for(const [id,input] of [['F',{name:'Wrong'}],['C',{phone:'123'}],['C',{gstin:'INVALID'}],['C',{name:'Duplicate'}]])await assert.rejects(edit(db,member,id,input));
 assert.equal((await DB.prepare("SELECT name FROM customers WHERE id='C'").first()).name,'Corrected Customer');
 await assert.rejects(edit(db,{...member,role:'staff'},'C',{name:'Denied'}));
 await DB.prepare("UPDATE users SET role='staff' WHERE id='U'").run();
 await assert.rejects(edit(db,member,'C',{name:'Revoked'}));
 assert.equal((await DB.prepare("SELECT name FROM customers WHERE id='C'").first()).name,'Corrected Customer');
 assert.equal((await DB.prepare("SELECT count(*) n FROM audit_logs WHERE action='customer.updated'").first()).n,2);
 console.log('Customer edits, formatted/legacy phones, partial-field preservation, tenant isolation and atomic rollback passed.');
}finally{await mf.dispose();fs.rmSync(temp,{recursive:true,force:true});}
