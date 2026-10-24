"use client";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function PrintActions() {
  const started = useRef(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("print") !== "1" || started.current) return;
    started.current = true;
    let cancelled = false;
    const images = Array.from(document.images).map(image => image.decode().catch(() => undefined));
    // Wait for invoice fonts and logos so the first print matches the visible bill.
    Promise.all([document.fonts.ready, ...images]).then(() => {
      if (!cancelled) window.print();
    });
    return () => { cancelled = true; started.current = false; };
  }, []);
  return <div className="print-actions">
    <Button type="button" onClick={() => window.print()}>Print / Download PDF</Button>
    <a href="/">Back to billing</a>
    <small>If the print dialog does not open, use Print / Download PDF. Your invoice is already saved.</small>
  </div>;
}
