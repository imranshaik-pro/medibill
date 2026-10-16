import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSync} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const temporary=fs.mkdtempSync(root+'.billing-form-test-');
try {
 const output=temporary+'/form.mjs';
 buildSync({entryPoints:[root+'app/sales-invoice-form.tsx'],outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
 const {SalesInvoiceForm}=await import(pathToFileURL(output));
 const props={busy:false,customers:[{id:'C',name:'Licensed Pharmacy',phone:'9000000000',gstin:null}],products:[{id:'P',productMasterId:'M',name:'Medicine',hsn:'3004',pack:'1',manufacturer:'MFR',batch:'B1',stock:30,expiry:'2028-12',purchaseRate:50,mrp:100}],productMasters:[{id:'M',name:'Medicine',composition:'',isScheduleH1:true,isPrescriptionRequired:true}],prior:[],initial:{header:{customerId:'C'},lines:[{productId:'P',productName:'Medicine',quantity:10,freeQuantity:0,unitRate:80,discountPercent:0,gstRate:5}]},go:async()=>({id:'saved'})};
 const render=(overrides={})=>renderToStaticMarkup(createElement(SalesInvoiceForm,{...props,...overrides}));
 const submitTag=html=>html.match(/<button[^>]*type="submit"[^>]*>/)?.[0];
 const wholesale=render();assert(submitTag(wholesale));assert(!/\sdisabled(?:=|\s|>)/.test(submitTag(wholesale)));assert(!wholesale.includes('prescription-card'));
 const retail=render({billingMode:'retail'});assert(/\sdisabled(?:=|\s|>)/.test(submitTag(retail)));assert(retail.includes('prescription-card'));assert(retail.includes('enter doctor name and registration'));
 assert(/\sdisabled(?:=|\s|>)/.test(submitTag(render({busy:true}))));
 assert(/\sdisabled(?:=|\s|>)/.test(submitTag(render({products:[{...props.products[0],stock:5}]}))));
 console.log('PASS: actual form renders enabled Save & Print for wholesale scheduled-drug invoice; retail prescription, busy and stock gates remain enforced');
} finally {fs.rmSync(temporary,{recursive:true,force:true});}
