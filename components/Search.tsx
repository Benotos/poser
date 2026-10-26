"use client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CoinImg from "./CoinImg";
import { useMc } from "./useMc";
import { ago, compact } from "@/lib/format";

type Hit = { mint: string; name: string | null; symbol: string | null; image: string | null; mc_sol: number | null; mc_usd: number | null; complete: boolean; created_at: string | null };
const MINT = /[1-9A-HJ-NP-Za-km-z]{32,44}/;

const Ctx = createContext<{ open: () => void }>({ open: () => {} });
export const useSearch = () => useContext(Ctx);

/** search menu like pump.fun: type a name or ticker, or paste a CA and it opens the chart straight away. "/" or Ctrl+K opens it anywhere */
export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  const open = useCallback(() => setShow(true), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|textarea|select/i.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setShow(true); }
    };
    // pasting a CA anywhere on the page (outside a text box) opens it too
    const onPaste = (e: ClipboardEvent) => {
      const typing = /input|textarea/i.test((e.target as HTMLElement)?.tagName ?? "");
      const m = e.clipboardData?.getData("text")?.match(MINT);
      if (!typing && m) { e.preventDefault(); window.location.href = `/coin/${m[0]}`; }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("paste", onPaste); };
  }, []);
  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {show && <SearchModal onClose={() => setShow(false)} />}
    </Ctx.Provider>
  );
}

/** the bar that opens the menu (header and terminal) */
export function SearchButton({ className = "", wide = false }: { className?: string; wide?: boolean }) {
  const { open } = useSearch();
  return (
    <button type="button" onClick={open}
      className={"group flex items-center gap-2 rounded-md border border-line bg-ink/80 px-3 py-1.5 text-sm text-mute transition hover:border-pop/60 hover:text-white " + className}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      <span className={"truncate " + (wide ? "flex-1 text-left" : "")}>Search name, ticker or paste CA</span>
      <span className="kbd ml-auto">/</span>
    </button>
  );
}

function SearchModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const mc = useMc();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  const go = useCallback((mint: string) => { onClose(); router.push(`/coin/${mint}`); }, [onClose, router]);

  useEffect(() => {
    const ca = q.match(MINT)?.[0];
    if (ca) { go(ca); return; } // pasted a CA: straight to the chart
    if (q.trim().length < 2) { setHits([]); return; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((j) => {
        if (!alive) return;
        if (j.ca) return go(j.ca);
        setHits(j.coins ?? []); setSel(0);
      }).catch(() => {}).finally(() => alive && setBusy(false));
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q, go]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && hits[sel]) go(hits[sel].mint);
  };
  const mcText = (h: Hit) => (mc.inUsd && h.mc_usd ? "$" + compact(h.mc_usd) : mc.fmt(h.mc_sol));

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="sol-frame w-full max-w-xl overflow-hidden rounded-xl shadow-2xl shadow-pop/20" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9945ff" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={input} style={{ outline: "none" }} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search by name or ticker, or paste a contract address"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-mute focus:outline-none focus-visible:outline-none" />
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-pop border-t-transparent" /> : <span className="kbd">esc</span>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {hits.map((h, i) => (
            <button key={h.mint} onMouseEnter={() => setSel(i)} onClick={() => go(h.mint)}
              className={"flex w-full items-center gap-3 px-4 py-2.5 text-left " + (i === sel ? "bg-pop/15" : "hover:bg-panel")}>
              <CoinImg src={h.image} symbol={h.symbol} mint={h.mint} size={36} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{h.symbol}</span>
                  <span className="truncate text-xs text-mute">{h.name}</span>
                  {h.complete && <span className="rounded bg-pop/20 px-1.5 text-[10px] text-pop">migrated</span>}
                </span>
                <span className="num block truncate text-[11px] text-mute">{h.mint.slice(0, 6)}…{h.mint.slice(-6)}{h.created_at ? ` · ${ago(h.created_at)}` : ""}</span>
              </span>
              <span className="num text-sm font-semibold text-mint">{mcText(h)}</span>
            </button>
          ))}
          {!hits.length && (
            <p className="px-4 py-8 text-center text-sm text-mute">
              {q.trim().length < 2 ? "Type a name or ticker. Paste a CA and the chart opens right away." : busy ? "Searching" : "No coins found."}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}