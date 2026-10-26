// Re-prices every open position, updates the board, fires take profit / stop loss, settles finished days.
import { db } from "../lib/admin";
import { getQuotes } from "../lib/price";
import { leagueDay, MIN_TRADES_FOR_PAYOUT, PAYOUT_SPLIT } from "../lib/constants";
import { executeTrade } from "../lib/engine";
import { log } from "./log";

export function startMarking() {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await markDay(leagueDay()); await runOrders(); await maybeSettle(); } catch (e: any) { log("mark", e.message); }
    running = false;
  }, 12_000);
  // equity curve points for profiles
  setInterval(() => db().rpc("snapshot_equity", { p_day: leagueDay() }).then(({ error }) => error && log("snap", error.message)), 120_000);
}

/** limit orders: trigger on market cap crossing */
async function runOrders() {
  const day = leagueDay();
  // yesterday's open orders die at reset
  await db().from("orders").update({ status: "cancelled", error: "league_reset" }).eq("status", "open").lt("day", day);
  const { data: orders } = await db().from("orders").select("*").eq("status", "open").eq("day", day).limit(500);
  if (!orders?.length) return;
  const quotes = await getQuotes([...new Set(orders.map((o) => o.mint))]);
  const mc = new Map(quotes.map((q) => [q.mint, q.mc]));
  for (const o of orders) {
    const m = mc.get(o.mint);
    if (!m) continue;
    const hit = o.trigger === "mc_below" ? m <= Number(o.trigger_mc) : m >= Number(o.trigger_mc);
    if (!hit) continue;
    // claim it first so two loops never fill the same order
    const { data: claimed } = await db().from("orders").update({ status: "filled", filled_at: new Date().toISOString() })
      .eq("id", o.id).eq("status", "open").select("id");
    if (!claimed?.length) continue;
    try {
      const r: any = await executeTrade({ profileId: o.profile_id, mint: o.mint, side: o.side, sol: Number(o.sol), pct: Number(o.pct ?? 1), note: o.note ?? undefined, reason: "limit" });
      await db().from("orders").update({ trade_id: r.trade_id ?? null }).eq("id", o.id);
      log("orders", "filled", o.id, o.side, o.mint.slice(0, 6));
    } catch (e: any) {
      await db().from("orders").update({ status: "failed", error: e.message }).eq("id", o.id);
    }
  }
}

async function markDay(day: string) {
  const { data: pos } = await db().from("positions").select("profile_id,mint,tokens,cost_sol,tp_mult,sl_mult").eq("day", day);
  if (!pos?.length) return;
  const mints = [...new Set(pos.map((p) => p.mint))];
  const quotes = await getQuotes(mints);
  const price = new Map(quotes.map((q) => [q.mint, q.price]));
  await db().rpc("mark_day", { p_day: day, p_prices: quotes.map((q) => ({ mint: q.mint, price: q.price })) });

  // take profit / stop loss vs entry cost
  for (const p of pos) {
    const px = price.get(p.mint);
    if (!px) continue;
    const value = Number(p.tokens) * px;
    const cost = Number(p.cost_sol);
    const hitTp = p.tp_mult && value >= cost * Number(p.tp_mult);
    const hitSl = p.sl_mult && value <= cost * Number(p.sl_mult);
    if (!hitTp && !hitSl) continue;
    try {
      await executeTrade({ profileId: p.profile_id, mint: p.mint, side: "sell", pct: 1, reason: hitTp ? "tp" : "sl" });
      log("mark", hitTp ? "take profit" : "stop loss", p.mint.slice(0, 6));
    } catch (e: any) { log("mark", "auto sell failed", e.message); }
  }
}

let settled = "";
async function maybeSettle() {
  const now = new Date();
  if (now.getUTCHours() !== 0 || now.getUTCMinutes() > 30) return;
  const y = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (settled === y) return;
  // final mark of yesterday's books at the reset price
  const { data: pos } = await db().from("positions").select("mint").eq("day", y);
  if (pos?.length) {
    const quotes = await getQuotes([...new Set(pos.map((p) => p.mint))]);
    await db().rpc("mark_day", { p_day: y, p_prices: quotes.map((q) => ({ mint: q.mint, price: q.price })) });
  }
  const { data, error } = await db().rpc("settle_day", { p_day: y, p_split: PAYOUT_SPLIT, p_min_trades: MIN_TRADES_FOR_PAYOUT });
  if (error) return log("settle", error.message);
  settled = y;
  log("settle", y, "ranked", data);
}
