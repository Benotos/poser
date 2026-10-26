// GeckoTerminal free API (no key): pool lookup, candles and recent trades for any Solana token.
import { curvePda } from "./price";

const GT = "https://api.geckoterminal.com/api/v2/networks/solana";
const poolCache = new Map<string, { at: number; pool: string | null }>();

export async function gt(path: string) {
  const r = await fetch(GT + path, { headers: { accept: "application/json;version=20230302" }, cache: "no-store" });
  if (!r.ok) throw new Error(`gt ${r.status}`);
  return r.json();
}

type PoolRef = { address: string; dex: string; reserve: number };
const poolsCache = new Map<string, { at: number; pools: PoolRef[] }>();

/** every pool for the token: the pump.fun bonding curve (pre migration) and the AMM pool(s) after */
export async function poolsFor(mint: string): Promise<PoolRef[]> {
  const hit = poolsCache.get(mint);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.pools;
  let pools: PoolRef[] = [];
  try {
    const j = await gt(`/tokens/${mint}/pools?page=1`);
    pools = (j.data ?? [])
      .filter((p: any) => p.relationships?.base_token?.data?.id === `solana_${mint}`)
      .map((p: any) => ({ address: p.attributes?.address, dex: p.relationships?.dex?.data?.id ?? "", reserve: Number(p.attributes?.reserve_in_usd ?? 0) }))
      .filter((p: PoolRef) => p.address)
      .sort((a: PoolRef, b: PoolRef) => b.reserve - a.reserve);
  } catch {}
  const curve = curvePda(mint).toBase58();
  if (!pools.some((p) => p.address === curve)) pools.push({ address: curve, dex: "pump-fun", reserve: 0 });
  poolsCache.set(mint, { at: Date.now(), pools });
  return pools;
}

/** deepest pool for a token, or the pump.fun bonding curve before migration */
export async function poolFor(mint: string): Promise<string | null> {
  const hit = poolCache.get(mint);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.pool;
  const pools = await poolsFor(mint);
  const pool = pools[0]?.address ?? null;
  poolCache.set(mint, { at: Date.now(), pool });
  return pool;
}

/** OHLCV (USD per token) for one pool, newest first pages merged, up to `pages` x 1000 bars */
export async function ohlcv(pool: string, frame: string, agg: number, pages = 1, beforeTs?: number): Promise<number[][]> {
  const out: number[][] = [];
  let before = beforeTs ? `&before_timestamp=${Math.floor(beforeTs)}` : "";
  for (let i = 0; i < pages; i++) {
    const j = await gt(`/pools/${pool}/ohlcv/${frame}?aggregate=${agg}&limit=1000&currency=usd&token=base${before}`).catch(() => null);
    const list: number[][] = j?.data?.attributes?.ohlcv_list ?? [];
    if (!list.length) break;
    out.push(...list);
    const oldest = Math.min(...list.map((x) => x[0]));
    if (list.length < 1000) break;
    before = `&before_timestamp=${oldest}`;
  }
  return out;
}

export type GtTrade = { t: number; side: "buy" | "sell"; priceUsd: number; volUsd: number; trader: string | null; sig: string | null };

/** last ~300 swaps on the token's main pool, oldest first */
export async function recentTrades(mint: string): Promise<GtTrade[]> {
  const pool = await poolFor(mint);
  if (!pool) return [];
  const j = await gt(`/pools/${pool}/trades`);
  const out: GtTrade[] = [];
  for (const d of j.data ?? []) {
    const a = d.attributes ?? {};
    const baseIsTo = a.to_token_address === mint;
    const priceUsd = Number(baseIsTo ? a.price_to_in_usd : a.price_from_in_usd);
    const t = Date.parse(a.block_timestamp) / 1000;
    if (!(priceUsd > 0) || !isFinite(t)) continue;
    out.push({ t, side: a.kind === "sell" ? "sell" : "buy", priceUsd, volUsd: Number(a.volume_in_usd) || 0, trader: a.tx_from_address ?? null, sig: a.tx_hash ?? null });
  }
  return out.sort((x, y) => x.t - y.t);
}