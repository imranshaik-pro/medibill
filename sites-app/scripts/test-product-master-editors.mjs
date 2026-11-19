import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {create,act} from 'react-test-renderer';
const root=fileURLToPath(new URL('../',import.meta.url));
const temp=fs.mkdtempSync(root+'.product-editor-test-');
const originalFetch=globalThis.fetch,originalConfirm=globalThis.confirm;
let tree;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.confirm=()=>true;
try {
 await build({entryPoints:[root+'app/master-stock-editors.tsx'],outfile:temp+'/editors.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'inline-dialog',setup(b){
  b.onResolve({filter:/components\/ui\/dialog$/},()=>({path:'dialog',namespace:'test-ui'}));
  b.onLoad({filter:/.*/,namespace:'test-ui'},()=>({contents:`import {createElement as h} from 'react';
   export const Dialog=({open,children})=>open?h('section',{},children):null;
   export const DialogContent=({children})=>h('div',{},children);
   export const DialogHeader=DialogContent,DialogTitle=DialogContent,DialogDescription=DialogContent,DialogFooter=DialogContent,DialogClose=DialogContent;`,loader:'js',resolveDir:root}));
 }}]});
 await build({entryPoints:[root+'app/shared-product-editor.tsx'],outfile:temp+'/shared.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'});
 const {ProductCatalogEditor,InventoryEditor}=await import(pathToFileURL(temp+'/editors.mjs'));
 const {SharedProductEditor}=await import(pathToFileURL(temp+'/shared.mjs'));
 const product={id:'M',name:'Original',composition:'Ingredient',defaultPack:'10 tablets',hsn:'3004',manufacturer:'Maker',marketedBy:'Agency',defaultGstRate:5,category:'General',isScheduleH1:false,isPrescriptionRequired:false,isHighCaution:false,cautionNotes:''};
 const {id,...original}=product;
 const notices=[],requests=[];let refreshed=0;
 const labelText=node=>node.children.map(child=>typeof child==='string'?child:labelText(child)).join('');
 const button=label=>tree.root.findAllByType('button').find(node=>labelText(node)===label);
 const change=async(oldValue,value)=>act(async()=>tree.root.findAllByType('input').find(node=>node.props.value===oldValue).props.onChange({target:{value}}));
 async function unmount(){if(tree){await act(async()=>tree.unmount());tree=null;}}
 let finish;
 globalThis.fetch=(url,options)=>{requests.push({url,...options});return new Promise(resolve=>{finish=resolve;});};
 await act(async()=>{tree=create(createElement(SharedProductEditor,{product,notify:m=>notices.push(m),onSaved:()=>refreshed++,onCancel:()=>{}}));});
 await change('Original','Edited');
 // A parent refresh cannot replace the snapshot captured when the editor opened.
 await act(async()=>tree.update(createElement(SharedProductEditor,{product:{...product,manufacturer:'Refreshed elsewhere'},notify:m=>notices.push(m),onSaved:()=>refreshed++,onCancel:()=>{}})));
 let saving;
 act(()=>{saving=button('Update Product').props.onClick();});
 assert.equal(tree.root.findByType('fieldset').props.disabled,true);
 assert.deepEqual(JSON.parse(requests[0].body).original,original);
 assert.equal(JSON.parse(requests[0].body).name,'Edited');
 await act(async()=>{finish(Response.json({error:'Product changed; reload.'},{status:409}));await saving;});
 assert.equal(refreshed,0);assert.equal(tree.root.findByProps({role:'alert'}).children.join(''),'Product changed; reload.');
 assert(tree.root.findAllByType('input').some(node=>node.props.value==='Edited'));
 globalThis.fetch=async(url,options)=>{requests.push({url,...options});return Response.json({backupWarning:'Saved; backup unavailable.'});};
 await act(async()=>{await button('Update Product').props.onClick();});
 assert.deepEqual(JSON.parse(requests[1].body).original,original);assert.equal(refreshed,1);assert(notices.at(-1).includes('backup unavailable'));
 await unmount();
 console.log('PASS: shared editor preserves original snapshot across edits/parent refresh, blocks busy inputs, keeps stale edits visible and reports committed-backup warnings');

 globalThis.fetch=async(url,options)=>{requests.push({url,...options});return Response.json({error:'Stale catalog edit'},{status:409});};
 const catalogProps={rows:[product],changed:()=>refreshed++,notify:m=>notices.push(m),allowDelete:true};
 await act(async()=>{tree=create(createElement(ProductCatalogEditor,catalogProps));});
 await act(async()=>button('Edit').props.onClick());await change('Original','Catalog edit');
 await act(async()=>{await button('Update Product').props.onClick();});
 assert.deepEqual(JSON.parse(requests.at(-1).body).original,original);
 assert.equal(tree.root.findByProps({role:'alert'}).children.join(''),'Stale catalog edit');
 assert.equal(JSON.parse(requests.at(-1).body).name,'Catalog edit');
 globalThis.fetch=async(url,options)=>{requests.push({url,...options});return Response.json({backupWarning:'Backup retry needed'});};
 await act(async()=>{await button('Update Product').props.onClick();});
 assert(notices.at(-1).includes('Backup retry needed'));
 await unmount();
 console.log('PASS: catalog editor submits separate original values, retains stale form and shows backup warnings');

 const batch={id:'P',name:'Original',productMasterId:'M',pack:'10 tablets',batch:'B1',stock:12,expiry:'2028-12',purchaseRate:10,mrp:20,saleRate:15};
 await act(async()=>{tree=create(createElement(InventoryEditor,{rows:[batch],masters:[product],changed:()=>refreshed++,notify:m=>notices.push(m)}));});
 await act(async()=>button('Edit Product Details').props.onClick());await change('Original','Inventory edit');
 await act(async()=>{await button('Update Product').props.onClick();});
 assert.equal(requests.at(-1).url,'/api/products/M');
 assert.deepEqual(JSON.parse(requests.at(-1).body).original,original);
 assert.equal(JSON.parse(requests.at(-1).body).name,'Inventory edit');
 assert(!('stock' in JSON.parse(requests.at(-1).body)));
 console.log('PASS: linked Inventory editor uses Product Master PATCH and original snapshot without submitting stock or batch edits');
}finally{
 if(tree)await act(async()=>tree.unmount());
 globalThis.fetch=originalFetch;globalThis.confirm=originalConfirm;
 fs.rmSync(temp,{recursive:true,force:true});
}
