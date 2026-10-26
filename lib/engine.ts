import { db } from "./admin";
import { leagueDay, MAX_NOTE } from "./constants";
import { fillBuy, fillSell } from "./curve";
import { fetchMeta } from "./meta";
import { getQuote } from "./price";
import { storeCoinImage } from "./imgstore";

export type TradeInput = {
  profileId: string;
  mint: string;
  side: "buy" | "sell";
  sol?: number; // buy amount (fee included)
  pct?: number; // sell fraction 0..1
  note?: string;
  reason?: "manual" | "tp" | "sl" | "agent" | "limit" | "copy" | "quick";
  tp?: number | null; // multiple of entry, e.g. 2 = +100%
  sl?: number | null; // e.g. 0.5 = -50%
};

export class TradeError extends Error {}

export async function executeTrade(t: TradeInput) {
  const day = leagueDay();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t.mint)) throw new TradeError("bad_mint");
  const q = await getQuote(t.mint).catch(() => null);
  if (!q) throw new TradeError("price_unavailable");

  let sol: number, tokens: number, price: number, fee: number, mcAfter: number;

  if (t.side === "buy") {
    const amt = Number(t.sol);
    if (!(amt >= 0.001 && amt <= 1_000_000)) throw new TradeError("bad_amount");
    const r = fillBuy(q.price, amt);
    sol = amt; tokens = r.tokensOut; fee = r.fee; price = r.avgPrice; mcAfter = q.mc;
  } else {
    const pct = Math.min(1, Math.max(0, Number(t.pct ?? 1)));
    const { data: pos } = await db().from("positions").select("tokens")
      .eq("day", day).eq("profile_id", t.profileId).eq("mint", t.mint).maybeSingle();
    if (!pos || Number(pos.tokens) <= 0) throw new TradeError("no_position");
    tokens = Number(pos.tokens) * pct;
    if (!(tokens > 0)) throw new TradeError("bad_amount");
    const r = fillSell(q.price, tokens);
    sol = r.solOut; fee = r.fee; price = r.avgPrice; mcAfter = q.mc;
  }

  await ensureCoin(t.mint, q.mc);

  const { data, error } = await db().rpc("execute_trade", {
    p_profile: t.profileId, p_day: day, p_mint: t.mint, p_side: t.side,
    p_sol: sol, p_tokens: tokens, p_price: price, p_mc: mcAfter, p_fee: fee,
    p_note: (t.note ?? "").slice(0, MAX_NOTE), p_reason: t.reason ?? "manual",
    p_tp: t.side === "buy" ? t.tp ?? null : null, p_sl: t.side === "buy" ? t.sl ?? null : null,
  });
  if (error) throw new TradeError(error.message.replace(/^.*?(insufficient_\w+|no_position|bad_\w+).*$/, "$1"));
  return { side: t.side, sol, tokens, price, fee, mc: mcAfter, migrated: q.migrated, ...(data as object) };
}

/** make sure a coin row exists so feeds can show name + image */
export async function ensureCoin(mint: string, mc?: number) {
  const { data } = await db().from("coins").select("mint,name").eq("mint", mint).maybeSingle();
  if (data?.name) return;
  if (data && !mc) return; // row exists, metadata still loading
  const m = await fetchMeta(mint);
  await db().from("coins").upsert({ mint, ...(mc ? { mc_sol: mc } : {}), name: m.name, symbol: m.symbol, uri: m.uri,
    description: m.description, twitter: m.twitter, telegram: m.telegram, website: m.website, updated_at: new Date().toISOString() });
  if (m.image) storeCoinImage(mint, m.image).catch(() => {});
}