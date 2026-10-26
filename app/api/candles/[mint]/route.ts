import { getSolUsd } from "@/lib/price";
import { ohlcv, poolsFor } from "@/lib/gecko";

// Newest candles come straight from pump.fun's own chart feed (1s and up, curve and PumpSwap): fast, same as pump.fun.
// Older history, page by page as you scroll left: GeckoTerminal (every pool the coin ever traded on, Raydium included).
const PUMP_TF: Record<string, string> = { "1": "1s", "15": "15s", "60": "1m", "300": "5m", "900": "15m", "3600": "1h", "14400": "4h" };
const GT_TF: Record<string, [string, number]> = { "60": ["minute", 1], "300": ["minute", 5], "900": ["minute", 15], "3600": ["hour", 1], "14400": ["hour", 4], "86400": ["day", 1] };
const SUPPLY = 1e9; // every pump.fun coin
const barCache = new Map<string, { at: number; body: any }>();

type Bar = { time: number; open: number; high: number; low: number; close: number; volume: number };

/** pump.fun candles: price per token in SOL, newest 1000 bars */
async function pumpBars(mint: string, tf: string): Promise<Bar[]> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url = `https://swap-api.pump.fun/v2/coins/${mint}/candles?interval=${PUMP_TF[tf]}&limit=1000&currency=SOL&createdTs=1700000000000`;
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error("pump " + r.status);
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error("pump bad body");
    return j.map((c: any) => ({
      time: Math.floor(Number(c.timestamp) / 1000),
      open: +c.open * SUPPLY, high: +c.high * SUPPLY, low: +c.low * SUPPLY, close: +c.close * SUPPLY,
      volume: +c.volume || 0,
    })).filter((b) => b.time > 0 && b.open > 0 && b.close > 0);
  } finally {
    clearTimeout(t);
  }
}

/** GeckoTerminal: one page (up to 1000 bars), newest first, optionally before a time. Deepest pool, then the bonding curve. */
async function geckoBars(mint: string, tf: string, before?: number): Promise<Bar[]> {
  const spec = GT_TF[tf];
  if (!spec) return [];
  const [pools, solUsd] = await Promise.all([poolsFor(mint), getSolUsd()]);
  if (!pools.length || !solUsd) return [];
  const k = SUPPLY / solUsd;
  const out = new Map<number, number[]>();
  for (const p of pools.slice(0, 3)) {
    const list = await ohlcv(p.address, spec[0], spec[1], 1, before).catch(() => [] as number[][]);
    for (const x of list) if (!out.has(x[0]) && (!before || x[0] < before)) out.set(x[0], x);
    if (list.length >= 1000) break; // deep enough, older pools can wait for the next page
  }
  return [...out.values()].map(([t, o, h, l, c, v]) => ({ time: t, open: o * k, high: h * k, low: l * k, close: c * k, volume: v / solUsd }))
    .filter((b) => b.open > 0 && b.close > 0);
}

export async function GET(req: Request, { params }: { params: { mint: string } }) {
  const q = new URL(req.url).searchParams;
  const tf = q.get("tf") ?? "60";
  const before = Number(q.get("before")) || 0;
  if (!PUMP_TF[tf] && !GT_TF[tf]) return Response.json({ bars: [] });
  const fast = Number(tf) < 60;
  const ttl = before ? 600_000 : fast ? 2000 : 10_000;
  const headers = { "cache-control": before ? "public, s-maxage=600" : `public, s-maxage=${fast ? 2 : 10}, stale-while-revalidate=${fast ? 5 : 30}` };
  const key = `${params.mint}:${tf}:${before}`;
  const hit = barCache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Response.json(hit.body, { headers });

  try {
    let bars: Bar[] = [];
    let source = "pump";
    if (before) {
      bars = await geckoBars(params.mint, tf, before);
      source = "geckoterminal";
    } else {
      try { bars = await pumpBars(params.mint, tf); } catch {}
      if (!bars.length && !fast) { bars = await geckoBars(params.mint, tf); source = "geckoterminal"; }
    }
    // strictly ascending, one bar per time, or the chart library freezes
    const uniq = new Map<number, Bar>();
    for (const b of bars) uniq.set(b.time, b);
    const body = { bars: [...uniq.values()].sort((a, b) => a.time - b.time), source };
    if (body.bars.length || before) barCache.set(key, { at: Date.now(), body });
    return Response.json(body, { headers: body.bars.length ? headers : { "cache-control": "public, s-maxage=2" } });
  } catch (e: any) {
    if (hit) return Response.json(hit.body, { headers: { "cache-control": "public, s-maxage=2" } });
    return Response.json({ bars: [], error: e.message }, { headers: { "cache-control": "public, s-maxage=2" } });
  }
}