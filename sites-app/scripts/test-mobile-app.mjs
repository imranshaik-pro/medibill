import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('public/manifest.webmanifest',root),'utf8'));
assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');
for(const icon of manifest.icons){const bytes=fs.readFileSync(new URL('public'+icon.src,root));assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),Number(icon.sizes.split('x')[0]));}
const handlers={}, cached=[], deleted=[];
const context={URL,Response, self:{location:{origin:'https://medibill.invalid'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>({add:async path=>cached.push(path)}),keys:async()=>['medibill-offline-old','other-app'],delete:async key=>deleted.push(key),match:async()=>new Response('offline notice')},fetch:async()=>new Response('private network response')};
vm.runInNewContext(fs.readFileSync(new URL('public/sw.js',root),'utf8'),context);
let job;handlers.install({waitUntil:p=>job=p});await job;assert.deepEqual(cached,['/offline.html']);
handlers.activate({waitUntil:p=>job=p});await job;assert.deepEqual(deleted,['medibill-offline-old']);
const request=(path,mode='navigate')=>({url:'https://medibill.invalid'+path,mode});
for(const [path,mode] of [['/api/dashboard','navigate'],['/api/invoices','cors'],['/assets/app.js','cors']]){let handled=false;handlers.fetch({request:request(path,mode),respondWith:()=>handled=true});assert.equal(handled,false,path+' bypasses the worker');}
handlers.fetch({request:request('/'),respondWith:p=>job=p});assert.equal(await (await job).text(),'private network response');assert.deepEqual(cached,['/offline.html'],'private pages never enter cache');
context.fetch=async()=>{throw new Error('offline')};handlers.fetch({request:request('/'),respondWith:p=>job=p});assert.equal(await (await job).text(),'offline notice');
console.log('PASS: installable manifest, PNG dimensions, offline fallback, API bypass and no private response caching');
