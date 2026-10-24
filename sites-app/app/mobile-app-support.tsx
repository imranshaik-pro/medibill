"use client";
import { useEffect, useState } from 'react';
type InstallEvent = Event & {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
export function MobileAppSupport() {
 const [install,setInstall]=useState<InstallEvent|null>(null),[offline,setOffline]=useState(false),[ios,setIos]=useState(false),[installed,setInstalled]=useState(false);
 useEffect(()=>{
  const update=()=>setOffline(!navigator.onLine);
  const capture=(event:Event)=>{event.preventDefault();setInstall(event as InstallEvent)};
  const complete=()=>{setInstall(null);setInstalled(true)};
  update();setInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone));
  setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  window.addEventListener('online',update);window.addEventListener('offline',update);window.addEventListener('beforeinstallprompt',capture);window.addEventListener('appinstalled',complete);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{/* Normal online use remains available. */});
  return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('beforeinstallprompt',capture);window.removeEventListener('appinstalled',complete)};
 },[]);
 async function add(){if(!install)return;await install.prompt();await install.userChoice;setInstall(null)}
 return <>{offline&&<div className="mobile-connectivity" role="status">Offline · Server saves need a connection. Check the draft indicator before leaving a bill.</div>}{!installed&&(install||ios)&&<aside className="mobile-install" aria-label="Install MediBill">{install?<button type="button" onClick={add}>Install MediBill on this device</button>:<details><summary>Add MediBill to Home Screen</summary><p>On iPhone or iPad, open MediBill in Safari, tap Share, then Add to Home Screen.</p></details>}</aside>}</>;
}
