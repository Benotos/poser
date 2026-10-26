import { recentTrades } from "@/lib/gecko";
import { getSolUsd } from "@/lib/price";

// Real swaps for any coin, newest first, in market cap SOL. Feeds the Live trades tab and the 1s / 15s charts.
// pump.fun's own trade feed first (curve and PumpSwap, every trade), GeckoTerminal as the fallback.
const SUPPLY = 1e9; // every pump.fun coin
const cache = new Map<string, { at: number; body: any }>();

type T = { t: number; side: "buy" | "sell"; mc: number; sol: number; trader: string | null; sig: string | null };

async function pumpTrades(mint: string): Promise<T[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3500);
  try {
    const r = await fetch(`https://swap-api.pump.fun/v2/coins/${mint}/trades?limit=100&cursor=0&minSolAmount=0&createdTs=1700000000000`,
      { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error("pump " + r.status);
    const j = await r.json();
    return (j?.trades ?? []).map((x: any) => ({
      t: Math.floor(Date.parse(x.timestamp) / 1000),
      side: x.type === "sell" ? "sell" : "buy",
      mc: Number(x.priceSol) * SUPPLY,
      sol: Number(x.amountSol) || 0,
      trader: x.userAddress ?? null,
      sig: x.tx ?? null,
    })).filter((x: T) => x.t > 0 && x.mc > 0);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(_: Request, { params }: { params: { mint: string } }) {
  const hit = cache.get(params.mint);
  if (hit && Date.now() - hit.at < 2500) return Response.json(hit.body, { headers: { "cache-control": "public, s-maxage=2" } });
  try {
    let trades = await pumpTrades(params.mint).catch(() => [] as T[]);
    let source = "pump";
    if (!trades.length) {
      const [gt, solUsd] = await Promise.all([recentTrades(params.mint), getSolUsd()]);
      if (!solUsd) throw new Error("no_sol_price");
      trades = gt.map((t) => ({ t: t.t, side: t.side, mc: (t.priceUsd * SUPPLY) / solUsd, sol: t.volUsd / solUsd, trader: t.trader, sig: t.sig }));
      source = "geckoterminal";
    }
    // oldest first, the way the chart reads them
    const body = { trades: trades.sort((a, b) => a.t - b.t), source };
    cache.set(params.mint, { at: Date.now(), body });
    return Response.json(body, { headers: { "cache-control": "public, s-maxage=2" } });
  } catch (e: any) {
    if (hit) return Response.json(hit.body, { headers: { "cache-control": "public, s-maxage=2" } });
    return Response.json({ trades: [], error: e.message }, { headers: { "cache-control": "public, s-maxage=2" } });
  }
}