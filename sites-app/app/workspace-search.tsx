"use client";
import {useEffect,useRef,useState} from 'react';
import {Search,X,Loader2} from 'lucide-react';
import type {SearchResult} from '@/lib/workspace-search';
export function WorkspaceSearch({navigate}:{navigate:(page:string,query:string,record:Record<string,unknown>)=>void}){
 const [q,setQ]=useState(''),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[results,setResults]=useState<SearchResult[]>([]),[error,setError]=useState(''),[more,setMore]=useState(false),[active,setActive]=useState(0);
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{const close=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
 useEffect(()=>{
  const abort=new AbortController();setResults([]);setError('');setMore(false);setActive(0);
  if(q.trim().length<2){setLoading(false);return()=>abort.abort();}
  setLoading(true);
  const timer=setTimeout(async()=>{try{
   const response=await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`,{signal:abort.signal,cache:'no-store'});
   const data=await response.json() as {results:SearchResult[];hasMore:boolean;error?:string};
   if(!response.ok)throw new Error(data.error||'Unable to search.');
   if(!abort.signal.aborted){setResults(data.results);setMore(data.hasMore);}
  }catch(error){if(!abort.signal.aborted)setError(error instanceof Error?error.message:'Unable to search.');}
  finally{if(!abort.signal.aborted)setLoading(false);}},300);
  return()=>{clearTimeout(timer);abort.abort();};
 },[q]);
 function choose(row:SearchResult){setOpen(false);navigate(row.page,row.query,row.record);}
 return <div ref={root} style={{position:'relative',width:'min(620px,100%)',minWidth:0}}>
  <div className="search" style={{width:'100%'}}><Search size={18}/><input aria-label="Search MediBill records" aria-controls="medibill-search-results" aria-expanded={open} maxLength={120} value={q} placeholder="Search product, batch, party or invoice…" onFocus={()=>setOpen(true)} onChange={e=>{setQ(e.target.value);setOpen(true);}} onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);return;}if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(x=>Math.min(x+1,results.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setActive(x=>Math.max(0,x-1));}if(e.key==='Enter'&&results[active]){e.preventDefault();choose(results[active]);}}}/>{q&&<button type="button" aria-label="Clear search" onClick={()=>{setQ('');setOpen(false);}} style={{border:0,background:'transparent',color:'#475569',cursor:'pointer'}}><X size={18}/></button>}</div>
  {open&&<div id="medibill-search-results" style={{position:'absolute',top:'calc(100% + 8px)',left:0,right:0,zIndex:60,maxHeight:'65vh',overflowY:'auto',background:'#fff',border:'1px solid #cbd5e1',borderRadius:12,boxShadow:'0 12px 36px #0f172a26',color:'#0f172a'}}>
   {q.trim().length<2?<p style={{padding:16,margin:0}}>Type at least 2 characters to search your agency’s records.</p>:loading?<p role="status" style={{padding:16,margin:0,display:'flex',gap:8}}><Loader2 size={18} className="spin"/>Searching…</p>:error?<p role="alert" style={{padding:16,color:'#991b1b'}}>{error}</p>:!results.length?<p style={{padding:16}}>No matching records found.</p>:<>{results.map((r,i)=><button key={`${r.kind}:${r.id}`} type="button" onClick={()=>choose(r)} onMouseEnter={()=>setActive(i)} style={{display:'block',width:'100%',textAlign:'left',padding:'12px 16px',border:0,borderBottom:'1px solid #e2e8f0',background:i===active?'#edf7f4':'#fff',color:'#0f172a',cursor:'pointer',whiteSpace:'normal',overflowWrap:'anywhere'}}><small style={{display:'block',color:'#64748b'}}>{r.kind}</small><strong>{r.title}</strong><span style={{display:'block',fontSize:13,color:'#475569',marginTop:4}}>{r.subtitle}</span></button>)}{more&&<p style={{padding:12,fontSize:13}}>Showing up to 20 matches per module. Refine your search to find more.</p>}</>}
  </div>}
 </div>;
}
