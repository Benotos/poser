"use client";
import { useState } from "react";
import { useAuth } from "./Auth";
import { useToast } from "./Toasts";
import { useSettings } from "@/lib/settings";
import { sfx } from "@/lib/sfx";
import { compact, sol } from "@/lib/format";

const ERR: Record<string, string> = { insufficient_sol: "Not enough fake SOL left", sign_in: "Sign in to trade", price_unavailable: "No live price yet", slow_down: "One trade at a time", curve_full: "Curve is graduating" };

export function useQuickBuy() {
  const { me, refresh, setJoinOpen } = useAuth();
  const toast = useToast();
  const [s] = useSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const buy = async (mint: string, symbol?: string | null, amount = s.quickBuy) => {
    if (!me.profile) return setJoinOpen(true);
    setBusy(mint);
    const r = await fetch("/api/trade", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint, side: "buy", sol: amount, reason: "quick" }) }).then((r) => r.json()).catch(() => ({ error: "network" }));
    setBusy(null);
    if (r.error) { sfx.loss(); return toast({ tone: "bleed", title: ERR[r.error] ?? r.error.replace(/_/g, " ") }); }
    sfx.buy();
    toast({ tone: "mint", title: `Bought $${symbol ?? mint.slice(0, 4)}`, body: `${compact(r.tokens)} tokens for ${sol(r.sol, 3)} SOL` });
    refresh();
  };
  return { buy, busy, size: s.quickBuy };
}

export default function QuickBuyButton({ mint, symbol, className = "" }: { mint: string; symbol?: string | null; className?: string }) {
  const { buy, busy, size } = useQuickBuy();
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); buy(mint, symbol); }} disabled={busy === mint}
      className={"num inline-flex items-center gap-1 rounded-md bg-mint/15 px-2 py-1 text-xs font-semibold text-mint hover:bg-mint hover:text-ink disabled:opacity-50 " + className}
      title={`Quick buy ${size} SOL`}>
      <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden><path d="M6 0 0 7h4l-1 5 7-8H6z" /></svg>{size}
    </button>
  );
}
