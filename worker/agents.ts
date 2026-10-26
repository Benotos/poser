// Six AI traders that play the same league with the same rules.
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../lib/admin";
import { executeTrade } from "../lib/engine";
import { getQuotes } from "../lib/price";
import { leagueDay, START_SOL } from "../lib/constants";
import { log } from "./log";

type Coin = { mint: string; name: string; symbol: string; created_at: string; mc_sol: number; ath_mc_sol: number | null;
  progress: number; vol_5m_sol: number; trades_5m: number; complete: boolean };
type Agent = { id: string; username: string; agent_style: string };
type Held = { mint: string; tokens: number; cost_sol: number; opened_at: string };

const rnd = (a: number, b: number) => Math.round((a + Math.random() * (b - a)) * 100) / 100;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const ageMin = (c: { created_at: string }) => (Date.now() - new Date(c.created_at).getTime()) / 60_000;

type Plan = { buy?: { mint: string; sol: number; note: string; tp?: number; sl?: number }; sells?: { mint: string; note: string }[] };

// rule based styles: pick an entry, and a time or price based exit
const STYLES: Record<string, { every: number; maxOpen: number; plan: (c: Coin[], h: Held[], cash: number) => Plan }> = {
  sniper: {
    every: 25, maxOpen: 4,
    plan: (coins, held) => {
      const sells = held.filter((h) => (Date.now() - new Date(h.opened_at).getTime()) / 60_000 > 6)
        .map((h) => ({ mint: h.mint, note: "6 minutes is forever. out." }));
      const c = coins.filter((c) => ageMin(c) < 2 && c.trades_5m >= 4 && !c.complete).sort((a, b) => b.trades_5m - a.trades_5m)[0];
      return { sells, buy: c && { mint: c.mint, sol: rnd(0.3, 0.7), tp: 1.6, sl: 0.7, note: pick([`${c.trades_5m} buys in the first minutes. sniped.`, "fresh launch, early flow. in.", "first block or nothing"]) } };
    },
  },
  momentum: {
    every: 40, maxOpen: 4,
    plan: (coins, held) => {
      const hot = coins.filter((c) => !c.complete && c.vol_5m_sol > 15 && c.progress > 0.2).sort((a, b) => b.vol_5m_sol - a.vol_5m_sol);
      const sells = held.filter((h) => !hot.slice(0, 15).some((c) => c.mint === h.mint) && (Date.now() - new Date(h.opened_at).getTime()) > 10 * 60_000)
        .map((h) => ({ mint: h.mint, note: "volume died. no momentum, no position." }));
      const c = hot[0];
      return { sells, buy: c && { mint: c.mint, sol: rnd(0.6, 1.2), tp: 1.5, sl: 0.8, note: `${c.vol_5m_sol.toFixed(0)} SOL volume in 5m. riding it.` } };
    },
  },
  graduate: {
    every: 60, maxOpen: 3,
    plan: (coins) => {
      const c = coins.filter((c) => !c.complete && c.progress > 0.75 && c.progress < 0.95 && c.trades_5m > 5).sort((a, b) => b.progress - a.progress)[0];
      return { buy: c && { mint: c.mint, sol: rnd(0.8, 1.5), tp: 1.8, sl: 0.7, note: `${Math.round(c.progress * 100)}% to graduation. front running the migration.` } };
    },
  },
  diamond: {
    every: 300, maxOpen: 3,
    plan: (coins, held) => {
      if (held.length >= 3) return {};
      const c = coins.filter((c) => c.vol_5m_sol > 10 && ageMin(c) > 20).sort((a, b) => b.vol_5m_sol - a.vol_5m_sol)[0];
      return { buy: c && { mint: c.mint, sol: rnd(2, 3), note: pick(["buying and holding till reset. no selling.", "diamond hands only. see you at midnight.", "conviction play. not touching it."]) } };
    },
  },
  contrarian: {
    every: 50, maxOpen: 4,
    plan: (coins) => {
      const c = coins.filter((c) => c.ath_mc_sol && c.mc_sol < c.ath_mc_sol * 0.55 && c.trades_5m > 8 && !c.complete && ageMin(c) > 5)
        .sort((a, b) => a.mc_sol / (a.ath_mc_sol || 1) - b.mc_sol / (b.ath_mc_sol || 1))[0];
      return { buy: c && { mint: c.mint, sol: rnd(0.4, 0.9), tp: 1.4, sl: 0.65, note: `down ${Math.round((1 - c.mc_sol / (c.ath_mc_sol || 1)) * 100)}% from ath and still trading. buying your panic.` } };
    },
  },
};

export async function startAgents() {
  const { data } = await db().from("profiles").select("id,username,agent_style").eq("is_agent", true);
  const agents = (data ?? []) as Agent[];
  log("agents", agents.map((a) => a.username).join(", ") || "none, run the migration");
  for (const a of agents) {
    const every = (STYLES[a.agent_style]?.every ?? 120) * 1000;
    setTimeout(() => { tick(a); setInterval(() => tick(a), every); }, Math.random() * 20_000);
  }
}

async function tick(a: Agent) {
  try {
    const day = leagueDay();
    const [{ data: entry }, { data: held }, { data: coins }] = await Promise.all([
      db().from("league_entries").select("cash_sol").eq("day", day).eq("profile_id", a.id).maybeSingle(),
      db().from("positions").select("mint,tokens,cost_sol,opened_at").eq("day", day).eq("profile_id", a.id),
      db().from("coins").select("mint,name,symbol,created_at,mc_sol,ath_mc_sol,progress,vol_5m_sol,trades_5m,complete")
        .not("name", "is", null).gt("last_trade_at", new Date(Date.now() - 5 * 60_000).toISOString()).order("vol_5m_sol", { ascending: false }).limit(80),
    ]);
    const cash = entry ? Number(entry.cash_sol) : START_SOL;
    const h: Held[] = (held ?? []).map((x: any) => ({ ...x, tokens: Number(x.tokens), cost_sol: Number(x.cost_sol) }));
    const list: Coin[] = (coins ?? []).map((c: any) => ({ ...c, mc_sol: Number(c.mc_sol), ath_mc_sol: c.ath_mc_sol == null ? null : Number(c.ath_mc_sol), progress: Number(c.progress ?? 0), vol_5m_sol: Number(c.vol_5m_sol) }));
    const plan = a.agent_style === "llm" ? await llmPlan(a, list, h, cash) : STYLES[a.agent_style]?.plan(list, h, cash) ?? {};

    for (const s of plan.sells ?? []) {
      if (!h.some((x) => x.mint === s.mint)) continue;
      await executeTrade({ profileId: a.id, mint: s.mint, side: "sell", pct: 1, note: s.note, reason: "agent" }).catch((e) => log(a.username, "sell", e.message));
    }
    const maxOpen = STYLES[a.agent_style]?.maxOpen ?? 4;
    const b = plan.buy;
    if (b && h.length < maxOpen && !h.some((x) => x.mint === b.mint)) {
      const amt = Math.min(b.sol, cash - 0.05);
      if (amt >= 0.05) {
        await executeTrade({ profileId: a.id, mint: b.mint, side: "buy", sol: amt, note: b.note, reason: "agent", tp: b.tp ?? null, sl: b.sl ?? null });
        log(a.username, "bought", amt, b.mint.slice(0, 6));
      }
    }
  } catch (e: any) { log(a.username, e.message); }
}

// ───── LLM agent ─────
let claude: Anthropic | null = null;
async function llmPlan(a: Agent, coins: Coin[], held: Held[], cash: number): Promise<Plan> {
  if (!process.env.ANTHROPIC_API_KEY) return STYLES.momentum.plan(coins, held, cash);
  claude ??= new Anthropic();
  const cands = coins.filter((c) => !c.complete).slice(0, 20);
  const prices = held.length ? await getQuotes(held.map((x) => x.mint)) : [];
  const book = held.map((x) => {
    const q = prices.find((p) => p.mint === x.mint);
    const v = q ? x.tokens * q.price : null;
    return { mint: x.mint, cost_sol: +x.cost_sol.toFixed(3), value_sol: v && +v.toFixed(3), held_min: Math.round((Date.now() - new Date(x.opened_at).getTime()) / 60_000) };
  });
  const table = cands.map((c) => ({ mint: c.mint, name: c.name, symbol: c.symbol, age_min: Math.round(ageMin(c)), mc_sol: Math.round(c.mc_sol),
    ath_mc_sol: Math.round(c.ath_mc_sol ?? 0), curve_pct: Math.round(c.progress * 100), vol_5m_sol: Math.round(c.vol_5m_sol), trades_5m: c.trades_5m }));

  const res = await claude.messages.create({
    model: process.env.AGENT_MODEL || "claude-haiku-5-5",
    max_tokens: 400,
    system: `You are ${a.username}, an AI degen paper trading pump.fun memecoins in a daily league against humans. ` +
      `You have fake SOL only. Goal: finish the day with the highest balance. Fees are 1% per trade. Fills are at the live price. ` +
      `Reply with JSON only: {"buy": {"mint": string, "sol": number (0.2 to 2), "note": string (max 100 chars, lowercase trencher voice, say why)} | null, ` +
      `"sells": [{"mint": string, "note": string}]}. Usually buy nothing unless something looks good. Sell losers fast.`,
    messages: [{ role: "user", content: JSON.stringify({ cash_sol: +cash.toFixed(3), holdings: book, candidates: table }) }],
  });
  const text = res.content.map((c: any) => (c.type === "text" ? c.text : "")).join("");
  try {
    const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const buy = j.buy && cands.some((c) => c.mint === j.buy.mint)
      ? { mint: j.buy.mint, sol: Math.min(2, Math.max(0.2, Number(j.buy.sol) || 0.5)), note: String(j.buy.note ?? "").slice(0, 120), tp: 2, sl: 0.6 } : undefined;
    const sells = Array.isArray(j.sells) ? j.sells.filter((s: any) => held.some((h) => h.mint === s.mint)).map((s: any) => ({ mint: s.mint, note: String(s.note ?? "").slice(0, 120) })) : [];
    return { buy, sells };
  } catch {
    log(a.username, "unparseable reply");
    return {};
  }
}
