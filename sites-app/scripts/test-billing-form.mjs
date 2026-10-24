import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSync} from 'esbuild';
import {createElement} from 'react';
import {create,act} from 'react-test-renderer';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.window=Object.assign(new EventTarget(),{localStorage:{getItem:()=>null}});
globalThis.document=new EventTarget();
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const temporary=fs.mkdtempSync(root+'.billing-form-test-');
try {
 const output=temporary+'/form.mjs';
 buildSync({entryPoints:[root+'app/sales-invoice-form.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
 const {SalesInvoiceForm}=await import(pathToFileURL(output));
 const props={busy:false,customers:[{id:'C',name:'Licensed Pharmacy',phone:'9000000000',gstin:null}],products:[{id:'P',productMasterId:'M',name:'Medicine',hsn:'3004',pack:'1',manufacturer:'MFR',batch:'B1',stock:30,expiry:'2028-12',purchaseRate:50,mrp:100}],productMasters:[{id:'M',name:'Medicine',composition:'',isScheduleH1:true,isPrescriptionRequired:true}],prior:[],initial:{header:{customerId:'C'},lines:[{productId:'P',productName:'Medicine',quantity:10,freeQuantity:0,unitRate:80,discountPercent:0,gstRate:5}]},go:async()=>({id:'saved'})};
 const render=async(overrides={})=>{let tree;await act(async()=>{tree=create(createElement(SalesInvoiceForm,{...props,...overrides}))});return tree;};
 const submit=tree=>tree.root.findAllByType('button').find(x=>x.props.type==='submit');
 let tree=await render();assert.equal(submit(tree).props.disabled,false);assert(!JSON.stringify(tree.toJSON()).includes('prescription-card'));await act(async()=>tree.unmount());
 tree=await render({billingMode:'retail'});assert(submit(tree).props.disabled);assert(JSON.stringify(tree.toJSON()).includes('prescription-card'));await act(async()=>tree.unmount());
 tree=await render({busy:true});assert(submit(tree).props.disabled);await act(async()=>tree.unmount());
 tree=await render({products:[{...props.products[0],stock:5}]});assert(submit(tree).props.disabled);await act(async()=>tree.unmount());
 console.log('PASS: actual form renders enabled Save & Print for wholesale scheduled-drug invoice; retail prescription, busy and stock gates remain enforced');
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
