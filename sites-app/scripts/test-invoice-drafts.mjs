import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSync} from 'esbuild';
import {createElement} from 'react';
import {create,act} from 'react-test-renderer';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(root+'.draft-test-');
const store=new Map();
const storage={get length(){return store.size},key:i=>[...store.keys()][i]??null,getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window=Object.assign(new EventTarget(),{localStorage:storage,navigator:{onLine:true},confirm:()=>true,location:{assign:()=>{},reload:()=>{}}});
globalThis.document=new EventTarget();
let renderer;
try {
 for(const [entry,name] of [['app/sales-invoice-form.tsx','form'],['lib/invoice-drafts.ts','drafts']])
  buildSync({entryPoints:[root+entry],outfile:temp+'/'+name+'.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
 const {SalesInvoiceForm}=await import(pathToFileURL(temp+'/form.mjs'));
 const {readInvoiceDraft,listInvoiceDrafts,writeInvoiceDraft,removeInvoiceDraft,draftScope}=await import(pathToFileURL(temp+'/drafts.mjs'));
 const scope=draftScope({id:'U',tenantId:'A'}),other=draftScope({id:'U2',tenantId:'A'}),agency=draftScope({id:'U',tenantId:'B'});
 const props={busy:false,draftScope:scope,customers:[{id:'C',name:'Customer',phone:'9000000000',gstin:null}],products:[{id:'P',productMasterId:'M',name:'Medicine',hsn:'3004',pack:'1',manufacturer:'MFR',batch:'B1',stock:30,expiry:'2028-12',purchaseRate:50,mrp:100}],productMasters:[{id:'M',name:'Medicine',composition:'',isScheduleH1:true}],prior:[],go:async()=>{throw new Error('Network lost')}};
 const mount=async(extra={})=>{await act(async()=>{renderer=create(createElement(SalesInvoiceForm,{...props,...extra}))})};
 const close=async()=>{await act(async()=>{renderer.unmount()});renderer=null;};
 const input=(value)=>({target:{value}});
 const submit=()=>renderer.root.findByType('form').props.onSubmit({preventDefault(){}});
 const submitButton=()=>renderer.root.findAllByType('button').find(n=>n.props.type==='submit');
 await mount();
 await act(async()=>{renderer.root.findByProps({placeholder:'Search brand'}).props.onChange(input('Medicine'))});
 await act(async()=>{renderer.root.findAllByType('input').find(n=>n.props.type==='number').props.onChange(input('10'))});
 assert(!submitButton().props.disabled,'wholesale scheduled-drug entry is ready');
 assert.equal(readInvoiceDraft(storage,scope,null).state.rows[0].quantity,10);
 // Disconnect while entering; local persistence must not need a closing event.
 window.navigator.onLine=false;
 await act(async()=>window.dispatchEvent(new Event('offline')));
 assert(JSON.stringify(renderer.toJSON()).includes('You are offline'));
 await act(async()=>{renderer.root.findAllByType('input').find(n=>n.props.type==='number').props.onChange(input('11'))});
 assert.equal(readInvoiceDraft(storage,scope,null).state.rows[0].quantity,11,'latest input is durable before any close event');
 const durable=JSON.parse(JSON.stringify([...store]));
 await close();
 store.clear();for(const [key,value] of durable)store.set(key,value);
 assert.equal(listInvoiceDrafts(storage,scope).length,1);
 assert.equal(listInvoiceDrafts(storage,other).length,0);assert.equal(listInvoiceDrafts(storage,agency).length,0);
 await mount();assert.equal(renderer.root.findByProps({placeholder:'Search brand'}).props.value,'Medicine');
 assert.equal(renderer.root.findAllByType('input').find(n=>n.props.type==='number').props.value,11);
 window.navigator.onLine=true;
 await act(async()=>window.dispatchEvent(new Event('online')));
 assert(!JSON.stringify(renderer.toJSON()).includes('You are offline'));
 // Failed save, then close/reopen the tab: same payload must use the same key.
 let keys=[];
 await close();await mount({go:async(body,key)=>{keys.push(key);throw new Error('Response lost')}});
 await act(async()=>{await submit()});
 assert(readInvoiceDraft(storage,scope,null).state.pendingSave.key);
 await close();await mount({go:async(body,key)=>{keys.push(key);return {id:'invoice-1'}}});
 await act(async()=>{await submit()});
 assert.equal(keys[0],keys[1]);assert.equal(readInvoiceDraft(storage,scope,null),null);
 await close();assert.equal(readInvoiceDraft(storage,scope,null),null,'unmount cannot recreate posted draft');
 // Edit allowance includes previously issued quantities, even when live stock is zero.
 const initial={header:{id:'invoice-1',customerId:'C'},revision:'a'.repeat(64),lines:[{productId:'P',productName:'Medicine',quantity:10,freeQuantity:2,unitRate:80,discountPercent:0,gstRate:5}]};
 await mount({initial,products:[{...props.products[0],stock:0}]});
 assert(!submitButton().props.disabled,'unchanged sold-out invoice can be edited');
 await act(async()=>{renderer.root.findAllByType('input').find(n=>n.props.type==='number').props.onChange(input('9'))});
 await close();assert.equal(readInvoiceDraft(storage,scope,'invoice-1').state.rows[0].quantity,9);
 await mount({initial:{...initial,revision:'b'.repeat(64)}});
 assert(submitButton().props.disabled,'stale recovered edit is blocked');
 await close();
 // Conflicting tab must neither overwrite nor delete another tab's draft.
 const draft=readInvoiceDraft(storage,scope,'invoice-1');
 const newer=writeInvoiceDraft(storage,scope,'invoice-1',draft.state,draft.generation);
 assert.throws(()=>writeInvoiceDraft(storage,scope,'invoice-1',draft.state,draft.generation),/another tab/);
 assert.throws(()=>removeInvoiceDraft(storage,scope,'invoice-1',draft.generation),/another tab/);
 assert.equal(readInvoiceDraft(storage,scope,'invoice-1').generation,newer.generation);
 // Storage denied/quota errors must be visible and must not claim a draft was saved.
 await mount({draftScope:other});
 const originalSet=storage.setItem;storage.setItem=()=>{throw new Error('Storage quota exceeded')};
 await act(async()=>{renderer.root.findByProps({placeholder:'Search brand'}).props.onChange(input('Medicine'))});
 assert(JSON.stringify(renderer.toJSON()).includes('Storage quota exceeded'));
 storage.setItem=originalSet;
 console.log('PASS: mounted form autosave, close/remount recovery, user/tenant isolation, persisted retry key, post-success cleanup, sold-out edit allowance, stale drafts, cross-tab conflict and visible storage failures');
} finally {
 if(renderer) await act(async()=>renderer.unmount());
 fs.rmSync(temp,{recursive:true,force:true});delete globalThis.window;delete globalThis.document;
}
