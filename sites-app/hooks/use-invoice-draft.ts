"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readInvoiceDraft, writeInvoiceDraft, removeInvoiceDraft, type InvoiceDraftState } from "@/lib/invoice-drafts";

export function useInvoiceDraft(scope: string | undefined, invoiceId: string | null,
  state: InvoiceDraftState, restore: (state: InvoiceDraftState) => void) {
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const generation = useRef<string | null>(null);
  const stopped = useRef(false);
  const completed = useRef(false);
  const lastWritten = useRef<string | null>(null);
  const baseline = useRef(JSON.stringify(state));
  const latest = useRef(state);
  latest.current = state;
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const notify = () => window.dispatchEvent(new Event("medibill-drafts-changed"));
  function persist() {
    if (!scope || stopped.current || completed.current) return false;
    const serialized = JSON.stringify(latest.current);
    if (serialized === lastWritten.current) return true;
    if (!generation.current && serialized === baseline.current) return true;
    try {
      const draft = writeInvoiceDraft(window.localStorage, scope, invoiceId, latest.current, generation.current);
      generation.current = draft.generation;
      lastWritten.current = serialized;
      setNotice(`Draft saved in this browser at ${new Date(draft.updatedAt).toLocaleTimeString()}.`);
      setError("");
      notify();
      return true;
    } catch (e) {
      stopped.current = true;
      setError(e instanceof Error ? e.message : "Draft could not be saved. Keep this window open and copy your entries.");
      return false;
    }
  }
  useEffect(() => {
    if (!scope) { setError("Draft saving is unavailable until your workspace identity loads."); setReady(true); return; }
    try {
      const saved = readInvoiceDraft(window.localStorage, scope, invoiceId);
      if (saved) {
        generation.current = saved.generation;
        lastWritten.current = JSON.stringify(saved.state);
        restoreRef.current(saved.state);
        setNotice("Recovered your unfinished invoice. Review the entries before saving.");
      }
    } catch (e) { stopped.current = true; setError(e instanceof Error ? e.message : "Draft recovery is unavailable."); }
    setReady(true);
    return () => { /* The persistence effect below flushes the latest entries. */ };
  }, [scope, invoiceId]);
  useLayoutEffect(() => {
    if (!ready) return;
    persist();
  }, [ready, state, scope, invoiceId]);
  useEffect(() => {
    if (!ready) return;
    const flush = () => persist();
    const connectivity = () => {
      setOffline(window.navigator?.onLine === false);
      persist();
    };
    connectivity();
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
    window.addEventListener("offline", connectivity);
    window.addEventListener("online", connectivity);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener("online", connectivity);
      document.removeEventListener("visibilitychange", flush);
      persist();
    };
  }, [ready, scope, invoiceId]);
  function discard() {
    if (!scope) return false;
    try {
      removeInvoiceDraft(window.localStorage, scope, invoiceId, generation.current);
      generation.current = null;
      completed.current = true;
      notify();
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Draft could not be removed."); return false; }
  }
  // Persist the retry key synchronously before the request, including if the tab closes.
  function beforeSave(next: InvoiceDraftState) {
    latest.current = next;
    return persist();
  }
  return { ready, notice, error, offline, beforeSave, discard, complete: discard };
}
