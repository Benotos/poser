// pump.fun's public frontend API. Unofficial, so every call is optional and fails soft.
import { ipfs } from "./meta";

const BASE = "https://frontend-api-v3.pump.fun";

export type PumpCoin = {
  mint: string; name: string; symbol: string; image_uri?: string; metadata_uri?: string; description?: string;
  twitter?: string; telegram?: string; website?: string;
  usd_market_cap?: number; market_cap?: number; ath_market_cap?: number; virtual_sol_reserves?: number; virtual_token_reserves?: number;
  complete?: boolean; created_timestamp?: number; last_trade_timestamp?: number; creator?: string;
};

async function get(path: string, ms = 3500): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(BASE + path, { signal: ctrl.signal, headers: { accept: "application/json" }, cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function pumpCoin(mint: string): Promise<PumpCoin | null> {
  const j = await get(`/coins/${mint}`);
  return j && j.mint ? j : null;
}

export async function pumpList(sort: "last_trade_timestamp" | "created_timestamp" | "market_cap", limit = 50): Promise<PumpCoin[]> {
  const j = await get(`/coins?offset=0&limit=${limit}&sort=${sort}&order=DESC&includeNsfw=false`);
  return Array.isArray(j) ? j.filter((c) => c?.mint) : [];
}

export const pumpImage = (u?: string) => (u ? ipfs(u) : undefined);

/** pump.fun's own coin search by name or ticker, biggest first */
export async function pumpSearch(term: string, limit = 12): Promise<PumpCoin[]> {
  const j = await get(`/coins?offset=0&limit=${limit}&sort=market_cap&order=DESC&includeNsfw=false&searchTerm=${encodeURIComponent(term)}`);
  return Array.isArray(j) ? j.filter((c) => c?.mint) : [];
}