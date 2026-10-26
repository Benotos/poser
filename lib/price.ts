import { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_PROGRAM } from "./constants";
import { CurveState, decodeCurve, progress } from "./curve";

let conn: Connection | null = null;
export function rpc() {
  // fail fast on rate limits (callers fall back or back off) instead of the library retrying and spamming the log
  if (!conn) conn = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", { commitment: "confirmed", disableRetryOnRateLimit: true });
  return conn;
}

const program = new PublicKey(PUMP_PROGRAM);
const AMM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
const WSOL_KEY = new PublicKey("So11111111111111111111111111111111111111112");

/** canonical PumpSwap pool a pump.fun coin migrates into */
export function pumpSwapPool(mint: string, quoteMint?: string | null) {
  const m = new PublicKey(mint);
  const authority = PublicKey.findProgramAddressSync([Buffer.from("pool-authority"), m.toBuffer()], program)[0];
  const idx = Buffer.alloc(2); // index 0
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), idx, authority.toBuffer(), m.toBuffer(), (quoteMint ? new PublicKey(quoteMint) : WSOL_KEY).toBuffer()], AMM,
  )[0];
}
export function curvePda(mint: string) {
  return PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()], program)[0];
}

export type Quote = {
  mint: string;
  curve: CurveState | null; // null once migrated (priced from the AMM)
  price: number; // SOL per token, always SOL even for coins quoted in other tokens
  mc: number; // SOL
  progress: number;
  migrated: boolean;
  quoteMint?: string | null; // set when the coin trades against a token other than SOL
};

const cache = new Map<string, { at: number; q: Quote }>();
const TTL = 800;

/** live price for one mint: bonding curve on chain, or DexScreener after migration */
export async function getQuote(mint: string): Promise<Quote> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < TTL) return hit.q;
  const [q] = await getQuotes([mint]);
  if (!q) throw new Error("coin_not_found");
  return q;
}

/** batched: one getMultipleAccounts per 100 mints */
export async function getQuotes(mints: string[], depth = 0): Promise<Quote[]> {
  const out: Quote[] = [];
  const migrated: string[] = [];
  const migratedInfo = new Map<string, { quoteMint: string | null; supply: number }>();
  const foreign: { mint: string; c: CurveState }[] = [];
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100);
    const infos = await rpc().getMultipleAccountsInfo(chunk.map(curvePda));
    infos.forEach((info, j) => {
      const mint = chunk[j];
      if (!info || info.data.length < 49) return migrated.push(mint);
      const c = decodeCurve(info.data);
      if (c.complete || c.vTokens <= 0) { migratedInfo.set(mint, { quoteMint: c.quoteMint, supply: c.supply }); return migrated.push(mint); }
      if (c.quoteMint) return foreign.push({ mint, c });
      const price = c.vSol / c.vTokens;
      out.push(remember({ mint, curve: c, price, mc: price * c.supply, progress: progress(c.realTokens), migrated: false }));
    });
  }

  // coins quoted in another token (USDC, DOGE, another pump coin...): price in that token, then convert to SOL
  if (foreign.length && depth < 5) {
    const qMints = [...new Set(foreign.map((f) => f.c.quoteMint!))];
    const [solPer, decimals] = await Promise.all([quoteInSol(qMints, depth), mintDecimals(qMints)]);
    for (const { mint, c } of foreign) {
      const qs = solPer.get(c.quoteMint!);
      const dec = decimals.get(c.quoteMint!);
      if (!qs || dec == null) continue;
      const priceInQuote = c.vQuoteRaw / 10 ** dec / c.vTokens;
      const price = priceInQuote * qs;
      out.push(remember({ mint, curve: null, price, mc: price * c.supply, progress: progress(c.realTokens), migrated: false, quoteMint: c.quoteMint }));
    }
  }

  if (migrated.length) {
    // live from the PumpSwap pool on chain; DexScreener only for anything we can't read
    const pooled = await poolQuotes(migrated, migratedInfo, depth);
    out.push(...pooled);
    const got = new Set(pooled.map((q) => q.mint));
    const rest = migrated.filter((m) => !got.has(m));
    if (rest.length) out.push(...(await dexQuotes(rest)));
  }
  return out;
}

/** price from PumpSwap pool vaults: (quote vault + virtual quote) / base vault */
async function poolQuotes(mints: string[], info: Map<string, { quoteMint: string | null; supply: number }>, depth: number): Promise<Quote[]> {
  const out: Quote[] = [];
  try {
    const pools = mints.map((m) => pumpSwapPool(m, info.get(m)?.quoteMint));
    const pa = await rpc().getMultipleAccountsInfo(pools);
    const rows: { mint: string; base: PublicKey; quote: PublicKey; vq: number }[] = [];
    pa.forEach((acc, i) => {
      if (!acc || acc.data.length < 203) return;
      const d = acc.data as Buffer;
      let vq = 0;
      if (d.length >= 261) {
        const lo = d.readBigUInt64LE(245), hi = d.readBigInt64LE(253);
        vq = Number((hi << 64n) + lo);
      }
      rows.push({ mint: mints[i], base: new PublicKey(d.subarray(139, 171)), quote: new PublicKey(d.subarray(171, 203)), vq });
    });
    if (!rows.length) return out;
    const vaults = await rpc().getMultipleAccountsInfo(rows.flatMap((r) => [r.base, r.quote]));
    const foreignQ = [...new Set(rows.map((r) => info.get(r.mint)?.quoteMint).filter(Boolean) as string[])];
    const [solPer, decs] = foreignQ.length ? await Promise.all([quoteInSol(foreignQ, depth), mintDecimals(foreignQ)]) : [new Map(), new Map()];
    rows.forEach((r, i) => {
      const b = vaults[i * 2], q = vaults[i * 2 + 1];
      if (!b || !q || b.data.length < 72 || q.data.length < 72) return;
      const baseAmt = Number((b.data as Buffer).readBigUInt64LE(64)) / 1e6;
      const quoteRaw = Number((q.data as Buffer).readBigUInt64LE(64)) + r.vq;
      if (!(baseAmt > 0) || !(quoteRaw > 0)) return;
      const qm = info.get(r.mint)?.quoteMint;
      let price: number;
      if (!qm) price = quoteRaw / 1e9 / baseAmt;
      else {
        const per = solPer.get(qm), dec = decs.get(qm);
        if (!per || dec == null) return;
        price = (quoteRaw / 10 ** dec / baseAmt) * per;
      }
      const supply = info.get(r.mint)?.supply ?? 1e9;
      out.push(remember({ mint: r.mint, curve: null, price, mc: price * supply, progress: 1, migrated: true, quoteMint: qm ?? null }));
    });
  } catch {}
  return out;
}

function remember(q: Quote) {
  cache.set(q.mint, { at: Date.now(), q });
  return q;
}

/** SOL value of one unit of each quote mint */
const quoteCache = new Map<string, { at: number; v: number }>();
async function quoteInSol(mints: string[], depth: number): Promise<Map<string, number>> {
  const res = new Map<string, number>();
  const need = mints.filter((m) => {
    const h = quoteCache.get(m);
    if (h && Date.now() - h.at < 15_000) { res.set(m, h.v); return false; }
    return true;
  });
  if (need.length) {
    const qs = await getQuotes(need, depth + 1); // pump coins as quotes, or DexScreener for anything else
    qs.forEach((q) => { res.set(q.mint, q.price); quoteCache.set(q.mint, { at: Date.now(), v: q.price }); });
  }
  return res;
}

const decCache = new Map<string, number>();
async function mintDecimals(mints: string[]): Promise<Map<string, number>> {
  const need = mints.filter((m) => !decCache.has(m));
  if (need.length) {
    const infos = await rpc().getMultipleAccountsInfo(need.map((m) => new PublicKey(m)));
    infos.forEach((info, i) => { if (info && info.data.length >= 45) decCache.set(need[i], info.data[44]); });
  }
  return new Map(mints.filter((m) => decCache.has(m)).map((m) => [m, decCache.get(m)!]));
}

/** SOL in USD, for converting DexScreener USD prices */
let solUsd: { at: number; v: number } | null = null;
export async function getSolUsd(): Promise<number | null> {
  if (solUsd && Date.now() - solUsd.at < 60_000) return solUsd.v;
  try {
    const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112", { cache: "no-store" });
    const pairs: any[] = await r.json();
    const p = pairs
      .filter((x) => x.baseToken?.symbol === "SOL" && /USD/.test(x.quoteToken?.symbol ?? ""))
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const v = Number(p?.priceUsd);
    if (v > 0) solUsd = { at: Date.now(), v };
  } catch {}
  return solUsd?.v ?? null;
}

async function dexQuotes(mints: string[]): Promise<Quote[]> {
  const out: Quote[] = [];
  const usd = await getSolUsd();
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`, { cache: "no-store" });
      if (!r.ok) continue;
      const pairs: any[] = await r.json();
      for (const mint of chunk) {
        // deepest pool for this token, whatever it is quoted in
        const best = pairs
          .filter((p) => p.baseToken?.address === mint)
          .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
        if (!best) continue;
        // SOL quoted pools: native price. Anything else: USD price converted to SOL
        let price = best.quoteToken?.symbol === "SOL" ? Number(best.priceNative) : usd ? Number(best.priceUsd) / usd : NaN;
        if (!isFinite(price) || price <= 0) continue;
        const supply = Number(best.marketCap) > 0 && Number(best.priceUsd) > 0 ? Number(best.marketCap) / Number(best.priceUsd) : 1e9;
        out.push(remember({ mint, curve: null, price, mc: price * supply, progress: 1, migrated: true }));
      }
    } catch {}
  }
  return out;
}