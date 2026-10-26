// Streams pump.fun launches + trades from PumpPortal into Supabase.
import WebSocket from "ws";
import { db } from "../lib/admin";
import { metaplexMeta } from "../lib/meta";
import { INITIAL_REAL_TOKENS, TOTAL_SUPPLY } from "../lib/constants";
import { log } from "./log";
import { getQuotes, getSolUsd } from "../lib/price";
import { pumpList, pumpImage, pumpCoin } from "../lib/pumpapi";
import { isStored, saveRawImage, storeCoinImage } from "../lib/imgstore";
import { fetchMeta } from "../lib/meta";

const VIRTUAL_TOKEN_OFFSET = 279_900_000; // virtual minus real token reserves on pump.fun curves
// with a PumpPortal key we stream every trade of fresh launches for 8 minutes.
// without one (free mode) we poll bonding curves from chain, so fresh launches get a shorter window.
// every bulk write to the coins table goes through this one at a time, in mint order, so Postgres never deadlocks
let coinChain: Promise<unknown> = Promise.resolve();
function coinLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = coinChain.then(async () => {
    for (let i = 0; ; i++) {
      try { return await fn(); } catch (e: any) {
        if (i < 2 && /deadlock|statement timeout/i.test(e?.message ?? "")) { await new Promise((r) => setTimeout(r, 300 * (i + 1))); continue; }
        throw e;
      }
    }
  });
  coinChain = run.catch(() => {});
  return run;
}
const byMint = (a: any, b: any) => (a.mint < b.mint ? -1 : a.mint > b.mint ? 1 : 0);
/** Postgres refuses null bytes and broken unicode in text, which some coin names and descriptions carry */
const clean = (v: any) => (typeof v === "string" ? v.replace(/\u0000/g, "").replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "") : v);
const cleanRow = (r: Record<string, any>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, clean(v)]));
// public RPC rate limits: back off instead of hammering it
let rpcPauseUntil = 0;
const rateLimited = (e: any) => /429|too many/i.test(String(e?.message ?? e));

const POLL_MODE = !process.env.PUMPPORTAL_API_KEY;
const NEW_COIN_WATCH_MS = (POLL_MODE ? 3 : 8) * 60_000;
const POLL_MS = Math.max(2, Number(process.env.POLL_SECONDS || 5)) * 1000;
const MAX_POLL = Math.max(10, Number(process.env.MAX_POLL_COINS || 100));
const MAX_WATCH = 400;

type Stat = { vSol: number; vTokens: number; mc: number; ath: number; last: number; window: { t: number; sol: number }[]; dirty: boolean };
const stats = new Map<string, Stat>();
const watch = new Map<string, number>(); // mint -> watch until (ms), Infinity for pinned
let pendingTrades: any[] = [];

// ───── picture queue: every coin's picture gets stored once at coin-images/<mint>.webp ─────
const imgQueue = new Map<string, string>(); // mint -> source url
const imgDone = new Set<string>();
const imgFailed = new Map<string, number>(); // mint -> attempts
let imgBusy = 0;
function queueImage(mint: string, src?: string | null) {
  if (!src || isStored(src) || imgDone.has(mint) || imgQueue.has(mint) || (imgFailed.get(mint) ?? 0) >= 3) return;
  imgQueue.set(mint, src);
  pumpImages();
}
function pumpImages() {
  while (imgBusy < 4 && imgQueue.size) {
    const [mint, src] = imgQueue.entries().next().value as [string, string];
    imgQueue.delete(mint);
    imgBusy++;
    storeCoinImage(mint, src)
      .then((url) => { if (url) imgDone.add(mint); else imgFailed.set(mint, (imgFailed.get(mint) ?? 0) + 1); })
      .catch(() => imgFailed.set(mint, (imgFailed.get(mint) ?? 0) + 1))
      .finally(() => { imgBusy--; pumpImages(); });
  }
}
let pendingTicks: { mint: string; ts: string; mc: number }[] = [];
const tick = (mint: string, mc: number) => { if (mc > 0) pendingTicks.push({ mint, ts: new Date().toISOString(), mc }); };
type Candle = { mint: string; t: number; o: number; h: number; l: number; c: number; v: number; n: number; dirty: boolean };
const candles = new Map<string, Candle>(); // `${mint}:${minute}`
// pump.fun coins can be quoted in tokens other than SOL (USDC, DOGE, other pump coins).
// PumpPortal amounts for those are in the quote token, so we price them from chain instead.
const nonSol = new Set<string>();
const verified = new Set<string>();
const unverified = new Set<string>();
let ws: WebSocket | null = null;

const progressOf = (vTokens: number) => Math.min(1, Math.max(0, 1 - (vTokens - VIRTUAL_TOKEN_OFFSET) / INITIAL_REAL_TOKENS));

export function startFeed() {
  const key = process.env.PUMPPORTAL_API_KEY;
  const url = "wss://pumpportal.fun/api/data" + (key ? `?api-key=${key}` : "");
  const connect = () => {
    ws = new WebSocket(url);
    ws.on("open", () => {
      log("feed", "connected");
      ws!.send(JSON.stringify({ method: "subscribeNewToken" }));
      ws!.send(JSON.stringify({ method: "subscribeMigration" }));
      const keys = [...watch.keys()];
      if (keys.length && key) ws!.send(JSON.stringify({ method: "subscribeTokenTrade", keys }));
    });
    ws.on("message", (raw) => { try { onMessage(JSON.parse(raw.toString())); } catch {} });
    ws.on("close", () => { log("feed", "closed, reconnecting in 5s"); setTimeout(connect, 5000); });
    ws.on("error", (e) => log("feed", "error", e.message));
  };
  connect();
  setInterval(flush, 2000);
  setInterval(refreshWatch, 30_000);
  setInterval(pullWatchRequests, 10_000);
  setInterval(() => resolveForeign().catch((e) => log("feed", "foreign", e.message)), 15_000);
  // pump.fun's own lists fill in coins we missed (launched before the worker started, final stretch, migrated)
  let sweepTurn = 0;
  const runSweep = () => sweep(sweepTurn++).catch((e) => log("sweep", e.message));
  runSweep();
  setInterval(runSweep, 8_000);
  setInterval(() => backfillImages().catch((e) => log("images", e.message)), 20_000);
  backfillImages().catch(() => {});
  setInterval(() => coinLock(async () => { const { error } = await db().rpc("prune_coins"); if (error) throw error; }).catch((e) => log("prune", e.message)), 10 * 60_000);
  // old history cleared in small batches (006_speed.sql); falls back to the old tick prune if 006 isn't run yet
  setInterval(() => db().rpc("prune_history").then(({ error }) => { if (error) db().rpc("prune_ticks").then(() => {}); }), 2 * 60_000);
  if (POLL_MODE) {
    log("feed", `free mode: no PUMPPORTAL_API_KEY, polling up to ${MAX_POLL} coins from chain every ${POLL_MS / 1000}s`);
    let busy = false;
    setInterval(async () => {
      if (busy || Date.now() < rpcPauseUntil) return;
      busy = true;
      try { await pollCurves(); } catch (e: any) {
        if (rateLimited(e)) { rpcPauseUntil = Date.now() + 15_000; log("poll", "RPC rate limited, pausing 15s (a free Helius RPC fixes this)"); }
        else log("poll", e.message);
      }
      busy = false;
    }, POLL_MS);
  }
}

function send(method: string, keys: string[]) {
  if (!keys.length || !process.env.PUMPPORTAL_API_KEY || ws?.readyState !== WebSocket.OPEN) return;
  for (let i = 0; i < keys.length; i += 100) ws.send(JSON.stringify({ method, keys: keys.slice(i, i + 100) }));
}

function track(mint: string, until: number) {
  const had = watch.has(mint);
  watch.set(mint, Math.max(watch.get(mint) ?? 0, until));
  if (!had) send("subscribeTokenTrade", [mint]);
}

async function onMessage(m: any) {
  if (!m?.mint) return;
  if (m.txType === "create") {
    // SOL curves start at 30 virtual SOL plus the dev buy. Anything else is quoted in another token.
    const vq = Number(m.vSolInBondingCurve), dev = Number(m.solAmount) || 0;
    if (vq && Math.abs(vq - 30 - dev) > 2) nonSol.add(m.mint); else verified.add(m.mint);
    const s = upd(m);
    track(m.mint, Date.now() + NEW_COIN_WATCH_MS);
    // row first so the coin shows up instantly, image and socials follow when the metadata JSON loads
    await db().from("coins").upsert(cleanRow({
      mint: m.mint, name: m.name, symbol: m.symbol, uri: m.uri,
      creator: m.traderPublicKey, created_at: new Date().toISOString(),
      v_sol: s.vSol, v_tokens: s.vTokens, mc_sol: nonSol.has(m.mint) ? null : s.mc, ath_mc_sol: nonSol.has(m.mint) ? null : s.mc, progress: progressOf(s.vTokens),
    }));
    metaplexMeta(m.mint, m.uri).then((meta) => {
      if (!meta.image && !meta.twitter && !meta.website && !meta.telegram) return;
      saveRawImage(m.mint, meta.image).catch(() => {});
      queueImage(m.mint, meta.image);
      return db().from("coins").update({ description: meta.description ?? null, twitter: meta.twitter ?? null,
        telegram: meta.telegram ?? null, website: meta.website ?? null, ...(m.name ? {} : { name: meta.name, symbol: meta.symbol }) }).eq("mint", m.mint);
    }).catch(() => {});
    if (m.solAmount > 0) pushTrade(m, "buy");
  } else if (m.txType === "buy" || m.txType === "sell") {
    if (!verified.has(m.mint) && !nonSol.has(m.mint)) unverified.add(m.mint);
    upd(m);
    pushTrade(m, m.txType);
  } else if (m.txType === "migrate" || m.pool === "pump-amm") {
    await db().from("coins").update({ complete: true, progress: 1, migrated_at: new Date().toISOString() }).eq("mint", m.mint);
  }
}

function upd(m: any): Stat {
  let s = stats.get(m.mint);
  if (!s) { s = { vSol: 0, vTokens: 0, mc: 0, ath: 0, last: 0, window: [], dirty: false }; stats.set(m.mint, s); }
  const foreign = nonSol.has(m.mint);
  if (m.vTokensInBondingCurve) s.vTokens = Number(m.vTokensInBondingCurve);
  if (!foreign && m.vSolInBondingCurve && m.vTokensInBondingCurve) {
    s.vSol = Number(m.vSolInBondingCurve); s.vTokens = Number(m.vTokensInBondingCurve);
    s.mc = Number(m.marketCapSol) || (s.vSol / s.vTokens) * TOTAL_SUPPLY;
    s.ath = Math.max(s.ath, s.mc);
  }
  s.last = Date.now();
  if (m.solAmount) s.window.push({ t: Date.now(), sol: foreign ? 0 : Number(m.solAmount) });
  s.dirty = true;
  return s;
}

function candle(mint: string, mc: number, sol: number) {
  if (!(mc > 0)) return;
  const t = Math.floor(Date.now() / 60_000) * 60_000;
  const k = `${mint}:${t}`;
  let c = candles.get(k);
  if (!c) {
    const prev = [...candles.values()].filter((x) => x.mint === mint && x.t < t).sort((a, b) => b.t - a.t)[0];
    const o = prev ? prev.c : mc; // open at last close so candles connect
    c = { mint, t, o, h: Math.max(o, mc), l: Math.min(o, mc), c: mc, v: 0, n: 0, dirty: true };
    candles.set(k, c);
  }
  c.h = Math.max(c.h, mc); c.l = Math.min(c.l, mc); c.c = mc; c.v += sol; c.n += 1; c.dirty = true;
}

function pushTrade(m: any, side: "buy" | "sell") {
  const foreign = nonSol.has(m.mint) || unverified.has(m.mint);
  const mc = foreign ? stats.get(m.mint)?.mc || 0 : Number(m.marketCapSol) || 0;
  if (!foreign) { candle(m.mint, mc, Number(m.solAmount) || 0); tick(m.mint, mc); }
  pendingTrades.push({
    mint: m.mint, side, sol: foreign ? 0 : Number(m.solAmount) || 0, tokens: Number(m.tokenAmount ?? m.initialBuy) || 0,
    mc_sol: mc || null, trader: m.traderPublicKey, sig: m.signature,
  });
}

/** classify coins we first saw mid stream, and keep non SOL coins priced from chain */
async function resolveForeign() {
  const check = [...unverified].slice(0, 200);
  if (check.length) {
    const qs = await getQuotes(check);
    for (const q of qs) { unverified.delete(q.mint); (q.quoteMint ? nonSol : verified).add(q.mint); }
    check.forEach((m) => unverified.delete(m));
  }
  const now = Date.now();
  const active = [...nonSol].filter((m) => { const s = stats.get(m); return s && now - s.last < 10 * 60_000; });
  if (!active.length) return;
  for (const q of await getQuotes(active)) {
    const s = stats.get(q.mint);
    if (!s) continue;
    s.mc = q.mc; s.ath = Math.max(s.ath, q.mc); s.dirty = true;
    candle(q.mint, q.mc, 0);
    tick(q.mint, q.mc);
  }
}

async function flush() {
  const now = Date.now();
  const rows: any[] = [];
  for (const [mint, s] of stats) {
    s.window = s.window.filter((w) => now - w.t < 5 * 60_000);
    if (!s.dirty) {
      if (now - s.last > 15 * 60_000 && !watch.has(mint)) stats.delete(mint);
      continue;
    }
    s.dirty = false;
    rows.push({
      mint, v_sol: s.vSol || null, v_tokens: s.vTokens || null, mc_sol: s.mc || null, ath_mc_sol: s.ath || null,
      progress: s.vTokens ? progressOf(s.vTokens) : undefined, last_trade_at: new Date(s.last).toISOString(),
      vol_5m_sol: s.window.reduce((a, w) => a + w.sol, 0), trades_5m: s.window.length, updated_at: new Date().toISOString(),
    });
  }
  // decay volume on coins that went quiet so Trending stays honest
  const quiet = [...stats.entries()].filter(([, s]) => !s.window.length && now - s.last < 6 * 60_000 && now - s.last > 5 * 60_000).map(([m]) => m);
  const trades = pendingTrades; pendingTrades = [];
  try {
    if (rows.length || quiet.length) await coinLock(async () => {
      if (rows.length) {
        // update only: coins we never saw created are skipped until a create or a POSER trade inserts them
        const { error } = await db().rpc("update_coin_stats", { p_rows: rows.sort(byMint) });
        if (error) throw error;
      }
      if (quiet.length) {
        const { error } = await db().from("coins").update({ vol_5m_sol: 0, trades_5m: 0 }).in("mint", quiet.sort());
        if (error) throw error;
      }
    });
    if (trades.length) await db().from("coin_trades").insert(trades);
    const tk = pendingTicks; pendingTicks = [];
    if (tk.length) {
      // one point per coin per second is plenty
      const seen = new Map<string, { mint: string; ts: string; mc: number }>();
      for (const t of tk) seen.set(t.mint + t.ts.slice(0, 19), { ...t, ts: t.ts.slice(0, 19) + "Z" });
      await db().from("coin_ticks").upsert([...seen.values()], { onConflict: "mint,ts", ignoreDuplicates: true });
    }
    const cs = [...candles.values()].filter((c) => c.dirty);
    if (cs.length) {
      cs.forEach((c) => (c.dirty = false));
      await db().rpc("upsert_candles", { p_rows: cs.map((c) => ({ mint: c.mint, t: new Date(c.t).toISOString(), o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, n: c.n })) });
    }
    // keep only the last 2 minutes of buckets in memory (plus the latest per coin for the next open)
    const cutoff = now - 2 * 60_000;
    for (const [k, c] of candles) if (c.t < cutoff) candles.delete(k);
  } catch (e: any) { log("feed", "flush failed", e.message); }
}

/** coin pages that are open right now */
async function pullWatchRequests() {
  const { data } = await db().from("coin_watch").select("mint,until").gt("until", new Date().toISOString());
  (data ?? []).forEach((r: any) => track(r.mint, new Date(r.until).getTime()));
}

/** keep trade streams on coins that posers hold, watch, or that are still hot */
async function refreshWatch() {
  const now = Date.now();
  const [{ data }, { data: wl }, { data: ord }] = await Promise.all([
    db().from("positions").select("mint"),
    db().from("watchlist").select("mint"),
    db().from("orders").select("mint").eq("status", "open"),
  ]);
  const held = new Set([...(data ?? []), ...(wl ?? []), ...(ord ?? [])].map((r: any) => r.mint));
  held.forEach((m) => track(m, Infinity));
  for (const [m, s] of stats) if (s.window.length >= 10) track(m, now + 3 * 60_000);
  const drop: string[] = [];
  for (const [m, until] of watch) if (until < now && !held.has(m)) { watch.delete(m); drop.push(m); }
  // hard cap: drop the oldest non held coins
  if (watch.size > MAX_WATCH) {
    const extra = [...watch.entries()].filter(([m]) => !held.has(m)).sort((a, b) => a[1] - b[1]).slice(0, watch.size - MAX_WATCH);
    extra.forEach(([m]) => { watch.delete(m); drop.push(m); });
  }
  send("unsubscribeTokenTrade", drop);
}


// ───── free mode: read curves from chain instead of a paid trade stream ─────
const prevQuote = new Map<string, { vq: number; mc: number }>();

/** which coins to poll: held / watched / open pages first, then the newest launches, then whatever is moving */
function pollSet(): string[] {
  const now = Date.now();
  return [...watch.entries()]
    .filter(([, until]) => until > now)
    .sort((a, b) => {
      const pa = a[1] === Infinity ? 1 : 0, pb = b[1] === Infinity ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return b[1] - a[1];
    })
    .slice(0, MAX_POLL)
    .map(([m]) => m);
}

async function pollCurves() {
  const mints = pollSet();
  if (!mints.length) return;
  const now = Date.now();
  for (const q of await getQuotes(mints)) {
    let s = stats.get(q.mint);
    if (!s) { s = { vSol: 0, vTokens: 0, mc: 0, ath: 0, last: 0, window: [], dirty: false }; stats.set(q.mint, s); }
    const prev = prevQuote.get(q.mint);
    const vq = q.curve ? q.curve.vSol : 0;
    // SOL that moved through the curve since the last poll, as a volume estimate (net, so it undercounts)
    const moved = prev && q.curve && !q.quoteMint ? Math.abs(vq - prev.vq) : 0;
    const changed = !prev || Math.abs(q.mc - prev.mc) > prev.mc * 1e-6;
    prevQuote.set(q.mint, { vq, mc: q.mc });
    if (!changed) continue;
    if (q.curve && !q.quoteMint) { s.vSol = q.curve.vSol; s.vTokens = q.curve.vTokens; }
    else if (q.curve) s.vTokens = q.curve.vTokens;
    s.mc = q.mc;
    s.ath = Math.max(s.ath, q.mc);
    if (prev) { s.window.push({ t: now, sol: moved }); s.last = now; }
    s.dirty = true;
    candle(q.mint, q.mc, moved);
    tick(q.mint, q.mc);
    // anything moving stays polled a little longer
    if (prev) track(q.mint, now + 3 * 60_000);
  }
  for (const m of prevQuote.keys()) if (!watch.has(m)) prevQuote.delete(m);
}


// ───── pump.fun list sweep ─────
const SWEEPS = ["last_trade_timestamp", "market_cap", "created_timestamp"] as const;
let sweepWarned = false;

async function sweep(turn: number) {
  const sort = SWEEPS[turn % SWEEPS.length];
  const list = await pumpList(sort, 50);
  if (!list.length) {
    if (!sweepWarned) { log("sweep", "pump.fun list API not reachable from here, skipping (live launches still stream)"); sweepWarned = true; }
    return;
  }
  const usd = await getSolUsd();
  const now = Date.now();
  const rows = list.map((c) => {
    const vq = (c.virtual_sol_reserves ?? 0) / 1e9;
    const vt = (c.virtual_token_reserves ?? 0) / 1e6;
    const solLike = vq >= 29 && vq <= 130; // SOL curves live in this range; anything else is quoted in another token
    if (!c.complete && !solLike) nonSol.add(c.mint); else if (!c.complete) verified.add(c.mint);
    const mc = usd && c.usd_market_cap ? c.usd_market_cap / usd : solLike ? c.market_cap ?? null : null;
    return {
      mint: c.mint, name: c.name, symbol: c.symbol, uri: c.metadata_uri ?? null, description: c.description?.slice(0, 400) ?? null,
      twitter: c.twitter || null, telegram: c.telegram || null, website: c.website || null, creator: c.creator ?? null,
      created_at: new Date(c.created_timestamp || now).toISOString(),
      last_trade_at: c.last_trade_timestamp ? new Date(c.last_trade_timestamp).toISOString() : null,
      complete: !!c.complete,
      progress: c.complete ? 1 : vt ? progressOf(vt) : 0,
      ...(mc ? { mc_sol: mc } : {}),
      updated_at: new Date().toISOString(),
    };
  });
  // every row in one upsert must have the same columns, so rows with and without a market cap go separately
  // which graduated coins did we just see flip? (old big caps seen for the first time are not "just migrated")
  const gradList = list.filter((c) => c.complete).map((c) => c.mint);
  const before = new Map<string, boolean>();
  if (gradList.length) {
    const { data: prev } = await db().from("coins").select("mint,complete").in("mint", gradList);
    for (const p of prev ?? []) before.set(p.mint, !!p.complete);
  }
  const ok = await coinLock(async () => {
    for (const group of [rows.filter((r) => "mc_sol" in r), rows.filter((r) => !("mc_sol" in r))]) {
      if (!group.length) continue;
      const { error } = await db().from("coins").upsert(group.map(cleanRow).sort(byMint), { onConflict: "mint" });
      if (error) throw error;
    }
    return true;
  }).catch((e) => { log("sweep", e.message); return false; });
  if (!ok) return;
  for (const c of list) {
    const src = pumpImage(c.image_uri);
    if (src && !imgDone.has(c.mint)) saveRawImage(c.mint, src).catch(() => {});
    queueImage(c.mint, src);
  }
  const justGrad = list.filter((c) => c.complete && (before.get(c.mint) === false || (!before.has(c.mint) && now - (c.created_timestamp || 0) < 24 * 3600_000))).map((c) => c.mint);
  if (justGrad.length) await coinLock(async () => { await db().from("coins").update({ migrated_at: new Date().toISOString() }).in("mint", justGrad.sort()).is("migrated_at", null); }).catch(() => {});
  // anything trading right now gets polled / streamed for a few minutes so it has live prices, candles and volume
  for (const c of list) if (c.last_trade_timestamp && now - c.last_trade_timestamp < 2 * 60_000) track(c.mint, now + 3 * 60_000);
}


// ───── retry images for coins whose metadata failed to load ─────
async function backfillImages() {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  // anything new or still trading today, so final stretch and migrated coins get stored too
  const { data } = await db().from("coins").select("mint,uri,image").not("name", "is", null)
    .or(`created_at.gt.${since},last_trade_at.gt.${since}`)
    .or("image.is.null,image.not.like.%/coin-images/%").order("last_trade_at", { ascending: false, nullsFirst: false }).limit(30);
  for (const c of data ?? []) {
    if (imgQueue.has(c.mint) || imgDone.has(c.mint)) continue;
    let src = c.image && !isStored(c.image) ? c.image : null;
    if (!src) {
      const p = await pumpCoin(c.mint);
      // the chain lookup costs RPC calls, so only when pump.fun doesn't know the coin and the RPC isn't rate limited
      src = pumpImage(p?.image_uri) ?? null;
      if (!src && Date.now() > rpcPauseUntil) src = (await fetchMeta(c.mint, c.uri ?? undefined).catch(() => ({} as any))).image ?? null;
    }
    queueImage(c.mint, src);
  }
}