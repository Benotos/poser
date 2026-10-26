"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./Auth";
import { useToast } from "./Toasts";
import { useMc } from "./useMc";
import { confetti } from "./Confetti";
import { shareToX } from "./share";
import { fillBuy, fillSell, CurveState } from "@/lib/curve";
import { MAX_NOTE } from "@/lib/constants";
import { useSettings } from "@/lib/settings";
import { sfx } from "@/lib/sfx";
import { compact, pct, sol } from "@/lib/format";

export type LiveQuote = { curve: CurveState | null; price: number; mc: number; progress: number; migrated: boolean };

const TP = [null, 1.5, 2, 3, 5, 10];
const SL = [null, 0.8, 0.7, 0.5];
const ERR: Record<string, string> = {
  insufficient_sol: "Not enough fake SOL left today.",
  no_position: "You don't hold this coin.",
  price_unavailable: "Couldn't read a live price. Try again in a moment.",
  slow_down: "One trade at a time.",
  sign_in: "Hit Play now first.",
  bad_amount: "Enter an amount of at least 0.001 SOL.",
  bad_trigger: "Enter a market cap for the order.",
  too_many_orders: "You can have 20 open orders.",
};

export default function TradePanel({ mint, symbol, quote, onOrder }: { mint: string; symbol: string; quote: LiveQuote | null; onOrder?: () => void }) {
  const { me, refresh, setJoinOpen } = useAuth();
  const toast = useToast();
  const [settings] = useSettings();
  const mcf = useMc();
  const [mode, setMode] = useState<"market" | "limit">("market");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amt, setAmt] = useState("0.5");
  const [sellPct, setSellPct] = useState(1);
  const [tp, setTp] = useState<number | null>(null);
  const [sl, setSl] = useState<number | null>(null);
  const [trigger, setTrigger] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const cash = me.entry?.cash_sol ?? 10;
  const pos = me.positions?.find((p) => p.mint === mint);
  const posTokens = pos ? Number(pos.tokens) : 0;

  const preview = useMemo(() => {
    if (!quote || mode === "limit") return null;
    if (side === "buy") {
      const a = Number(amt);
      if (!(a > 0)) return null;
      const r = fillBuy(quote.price, a);
      return { line1: `${compact(r.tokensOut)} ${symbol}`, fee: r.fee };
    }
    const tokens = posTokens * sellPct;
    if (!(tokens > 0)) return null;
    const out = fillSell(quote.price, tokens);
    const cost = Number(pos.cost_sol) * sellPct;
    return { line1: `${sol(out.solOut, 4)} SOL`, fee: out.fee, pnl: out.solOut - cost };
  }, [quote, side, amt, sellPct, posTokens, pos, symbol, mode]);

  const trade = useCallback(async (s: "buy" | "sell", body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/trade", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint, side: s, ...body }) }).then((r) => r.json()).catch(() => ({ error: "network" }));
    setBusy(false);
    if (r.error) { sfx.loss(); return setMsg({ ok: false, text: ERR[r.error] ?? r.error }); }
    const win = s === "sell" && Number(r.pnl_sol) > 0;
    if (s === "buy") sfx.buy(); else if (win) { sfx.win(); confetti(); } else sfx.loss();
    const text = s === "buy" ? `Bought ${compact(r.tokens)} ${symbol} for ${sol(r.sol, 3)} SOL`
      : `Sold for ${sol(r.sol, 3)} SOL (${r.pnl_sol >= 0 ? "+" : ""}${sol(r.pnl_sol, 3)}${r.pnl_pct != null ? `, ${pct(r.pnl_pct)}` : ""})`;
    setMsg({ ok: true, text });
    if (r.trade_id) {
      const brag = s === "buy" ? `just aped $${symbol} on POSER` : `${r.pnl_sol >= 0 ? "+" : ""}${r.pnl_pct != null ? Math.round(r.pnl_pct * 100) + "%" : sol(r.pnl_sol, 2) + " SOL"} on $${symbol}`;
      toast({ tone: win ? "mint" : s === "buy" ? "pop" : "bleed", title: text, action: { label: "Share", run: () => shareToX(`${brag}. paper trading the trenches, top 10 get paid in real SOL`, `/share/trade/${r.trade_id}`) } });
    }
    setNote("");
    refresh();
  }, [mint, symbol, toast, refresh]);

  const submit = () => (side === "buy" ? trade("buy", { sol: Number(amt), note, tp, sl }) : trade("sell", { pct: sellPct, note }));

  const placeOrder = async () => {
    const mcSol = mcf.fromUnit(Number(trigger));
    if (!(mcSol > 0)) return setMsg({ ok: false, text: ERR.bad_trigger });
    const curMc = quote?.mc ?? 0;
    const trig = mcSol < curMc ? "mc_below" : "mc_above";
    setBusy(true); setMsg(null);
    const r = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint, side, trigger: trig, trigger_mc: mcSol, sol: Number(amt), pct: sellPct, note }) }).then((r) => r.json());
    setBusy(false);
    if (r.error) return setMsg({ ok: false, text: ERR[r.error] ?? r.error });
    sfx.click();
    setMsg({ ok: true, text: `Order set: ${side} when mc ${trig === "mc_below" ? "drops to" : "hits"} ${mcf.fmt(mcSol)}` });
    setTrigger("");
    onOrder?.();
  };

  // hotkeys: B quick buy, S sell all, 1-4 presets, L limit tab
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.metaKey || e.ctrlKey || e.altKey || !me.profile || busy) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); trade("buy", { sol: settings.quickBuy, reason: "quick" }); }
      else if (k === "s" && posTokens > 0) { e.preventDefault(); trade("sell", { pct: 1 }); }
      else if (k === "l") setMode((m) => (m === "market" ? "limit" : "market"));
      else if (["1", "2", "3", "4"].includes(k) && settings.presets[Number(k) - 1]) { setSide("buy"); setAmt(String(settings.presets[Number(k) - 1])); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [me.profile, busy, posTokens, settings, trade]);

  return (
    <div className="card p-4">
      <div className="mb-3 flex gap-4 border-b border-line text-sm">
        {(["market", "limit"] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={"-mb-px border-b-2 pb-2 capitalize " + (mode === m ? "border-pop text-white" : "border-transparent text-mute hover:text-white")}>{m}</button>
        ))}
        <span className="ml-auto self-center pb-2 text-xs text-mute">{sol(cash, 3)} SOL</span>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-ink p-1">
        <button onClick={() => setSide("buy")} className={"rounded py-2 font-semibold " + (side === "buy" ? "bg-mint text-ink" : "text-mute")}>Buy</button>
        <button onClick={() => setSide("sell")} className={"rounded py-2 font-semibold " + (side === "sell" ? "bg-bleed text-white" : "text-mute")}>Sell</button>
      </div>

      {mode === "limit" && (
        <label className="mb-3 block text-sm">
          <span className="flex justify-between text-mute"><span>{side === "buy" ? "Buy when market cap reaches" : "Sell when market cap reaches"}</span><span className="num">now {mcf.fmt(quote?.mc)}</span></span>
          <div className="relative mt-1">
            <input className="input num pr-14 text-lg" inputMode="decimal" value={trigger} placeholder={quote ? String(Math.round(mcf.toUnit(quote.mc))) : ""} onChange={(e) => setTrigger(e.target.value.replace(/[^0-9.]/g, ""))} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-mute">{mcf.inUsd ? "USD" : "SOL"}</span>
          </div>
          {quote && (
            <div className="mt-1.5 grid grid-cols-4 gap-1">
              {(side === "buy" ? [-0.5, -0.3, -0.2, -0.1] : [0.5, 1, 2, 4]).map((d) => (
                <button key={d} className="btn-ghost num px-0 py-1 text-xs" onClick={() => setTrigger(String(Math.round(mcf.toUnit(quote.mc * (1 + d)))))}>{d > 0 ? "+" : ""}{d * 100}%</button>
              ))}
            </div>
          )}
        </label>
      )}

      {side === "buy" ? (
        <>
          <label className="mb-1 flex justify-between text-sm text-mute" htmlFor="amt"><span>Amount</span></label>
          <div className="relative">
            <input id="amt" className="input num pr-12 text-lg" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ""))} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-mute">SOL</span>
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {settings.presets.map((v, i) => (
              <button key={v} className="btn-ghost num relative px-0 py-1 text-xs" onClick={() => setAmt(String(v))}>{v}<span className="absolute right-1 top-0.5 text-[8px] text-mute">{i + 1}</span></button>
            ))}
            <button className="btn-ghost px-0 py-1 text-xs" onClick={() => setAmt(String(Math.floor(cash * 1000) / 1000))}>max</button>
          </div>
          {mode === "market" && (
            <fieldset className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <label className="text-mute">Take profit
                <select className="input mt-1 py-1.5" value={tp ?? ""} onChange={(e) => setTp(e.target.value ? Number(e.target.value) : null)}>
                  {TP.map((v) => <option key={String(v)} value={v ?? ""}>{v ? pct(v - 1) : "off"}</option>)}
                </select>
              </label>
              <label className="text-mute">Stop loss
                <select className="input mt-1 py-1.5" value={sl ?? ""} onChange={(e) => setSl(e.target.value ? Number(e.target.value) : null)}>
                  {SL.map((v) => <option key={String(v)} value={v ?? ""}>{v ? pct(v - 1) : "off"}</option>)}
                </select>
              </label>
            </fieldset>
          )}
        </>
      ) : (
        <>
          <p className="mb-1 flex justify-between text-sm text-mute"><span>You hold</span><span className="num">{compact(posTokens)} {symbol}</span></p>
          <div className="grid grid-cols-4 gap-1">
            {[0.25, 0.5, 0.75, 1].map((v) => (
              <button key={v} onClick={() => setSellPct(v)} className={"btn num px-0 py-2 text-sm " + (sellPct === v ? "bg-bleed text-white" : "border border-line text-mute")}>{v * 100}%</button>
            ))}
          </div>
        </>
      )}

      <label className="mt-4 block text-sm text-mute" htmlFor="note">Why? <span className="text-xs">(public, optional)</span></label>
      <input id="note" className="input mt-1 text-sm" maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} placeholder={side === "buy" ? "chart looks clean" : "taking profits"} />

      {preview && (
        <dl className="mt-4 space-y-1 rounded-md bg-ink p-3 text-sm">
          <div className="flex justify-between"><dt className="text-mute">You get</dt><dd className="num">{preview.line1}</dd></div>
          <div className="flex justify-between"><dt className="text-mute">Fill price</dt><dd className="num">{mcf.fmt(quote?.mc)} mc</dd></div>
          <div className="flex justify-between"><dt className="text-mute">Fee (1%)</dt><dd className="num">{sol(preview.fee, 4)} SOL</dd></div>
          {"pnl" in preview && preview.pnl != null && (
            <div className="flex justify-between"><dt className="text-mute">PnL</dt><dd className={"num " + (preview.pnl >= 0 ? "text-mint" : "text-bleed")}>{preview.pnl >= 0 ? "+" : ""}{sol(preview.pnl, 3)} SOL</dd></div>
          )}
        </dl>
      )}

      <div className="mt-4">
        {me.profile ? (
          mode === "market" ? (
            <button className={(side === "buy" ? "btn-mint" : "btn-bleed") + " w-full py-3"} disabled={busy || !quote || (side === "sell" && !posTokens)} onClick={submit}>
              {busy ? "Filling" : side === "buy" ? `Buy ${symbol}` : `Sell ${sellPct * 100}%`}
            </button>
          ) : (
            <button className="btn-pop w-full py-3" disabled={busy || !quote || !trigger} onClick={placeOrder}>{busy ? "Placing" : `Place ${side} order`}</button>
          )
        ) : (
          <button className="btn-pop w-full py-3" onClick={() => setJoinOpen(true)}>Play now to trade</button>
        )}
        {msg && <p role="status" className={"mt-2 text-sm " + (msg.ok ? "text-mint" : "text-bleed")}>{msg.text}</p>}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mute">
        <span><span className="kbd">B</span> buy {settings.quickBuy}</span>
        <span><span className="kbd">S</span> sell all</span>
        <span><span className="kbd">1</span>–<span className="kbd">4</span> presets</span>
        <span><span className="kbd">L</span> limit</span>
      </p>
    </div>
  );
}