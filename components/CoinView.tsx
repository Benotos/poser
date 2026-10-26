"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import CoinImg from "./CoinImg";
import TradePanel, { LiveQuote } from "./TradePanel";
import Chart from "./Chart";
import Star from "./Star";
import Orders, { useOrders } from "./Orders";
import { useMc } from "./useMc";
import PoserTape from "./PoserTape";
import Avatar from "./Avatar";
import Link from "next/link";
import { useAuth } from "./Auth";
import { useSolUsd } from "./useSolUsd";
import { ago, compact, pct, shortAddr, sol, usd } from "@/lib/format";
import { FEE_RATE, leagueDay } from "@/lib/constants";

type Coin = { mint: string; name: string | null; symbol: string | null; image: string | null; description: string | null;
  twitter: string | null; telegram: string | null; website: string | null; created_at: string; ath_mc_sol: number | null; creator: string | null };

const TABS = ["Live trades", "Posers", "Notes", "Holders", "My orders"] as const;

export default function CoinView({ mint, initial }: { mint: string; initial: Coin | null }) {
  const [coin, setCoin] = useState<Coin | null>(initial);
  const [q, setQ] = useState<LiveQuote | null>(null);
  const [qErr, setQErr] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Live trades");
  const solUsd = useSolUsd();
  const { me } = useAuth();
  const sym = coin?.symbol ?? mint.slice(0, 4);

  useEffect(() => {
    let alive = true;
    const load = () => fetch(`/api/quote/${mint}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j.error) setQErr(true); else { setQ(j); setQErr(false); }
    }).catch(() => alive && setQErr(true));
    load();
    const t = setInterval(load, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [mint]);

  // tell the worker someone is looking, so trades and candles stream for this coin
  useEffect(() => {
    const ping = () => fetch("/api/watch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint }) }).catch(() => {});
    ping();
    const t = setInterval(ping, 10 * 60_000);
    return () => clearInterval(t);
  }, [mint]);

  // metadata lands a little after the first trade on unknown coins
  useEffect(() => {
    if (coin?.name) return;
    const t = setInterval(async () => {
      const { data } = await sb().from("coins").select("*").eq("mint", mint).maybeSingle();
      if (data?.name) setCoin(data as Coin);
    }, 4000);
    return () => clearInterval(t);
  }, [coin, mint]);

  const pos = me.positions?.find((p) => p.mint === mint);
  const posValue = pos && q ? Number(pos.tokens) * q.price : null;
  const mcf = useMc();
  const mcText = q ? mcf.fmt(q.mc) : "–";
  // entry = the market cap you actually bought at. cost_sol includes the 1% fee, which pushed the line about 1% above
  // the real buy point, so take the fee back out. Same 1B supply the chart uses, so the line sits on the right candle
  const entryMc = pos && Number(pos.tokens) > 0 ? ((Number(pos.cost_sol) * (1 - FEE_RATE)) / Number(pos.tokens)) * 1e9 : null;
  const { orders, reload } = useOrders(mint);
  const [pstats, setPstats] = useState<{ holders: number; vol: number; trades: number }>({ holders: 0, vol: 0, trades: 0 });
  useEffect(() => {
    const load = async () => {
      const day = leagueDay();
      const [{ count }, { data: tr }] = await Promise.all([
        sb().from("positions").select("profile_id", { count: "exact", head: true }).eq("day", day).eq("mint", mint),
        sb().from("trades").select("sol").eq("day", day).eq("mint", mint).limit(2000),
      ]);
      setPstats({ holders: count ?? 0, vol: (tr ?? []).reduce((a: number, t: any) => a + Number(t.sol), 0), trades: tr?.length ?? 0 });
    };
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [mint]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-center gap-4">
          <CoinImg src={coin?.image} symbol={coin?.symbol} mint={mint} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-2xl font-bold">{coin?.name ?? "Loading coin"} <span className="font-normal text-mute">${sym}</span> <Star mint={mint} size={20} /></h1>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-mute">
              <button onClick={() => navigator.clipboard.writeText(mint)} className="hover:text-white" title="Copy contract address">{shortAddr(mint)} copy</button>
              {coin?.created_at && <span>{ago(coin.created_at)} old</span>}
              {coin?.twitter && <a className="hover:text-white" href={coin.twitter} target="_blank" rel="noreferrer">X</a>}
              {coin?.telegram && <a className="hover:text-white" href={coin.telegram} target="_blank" rel="noreferrer">Telegram</a>}
              {coin?.website && <a className="hover:text-white" href={coin.website} target="_blank" rel="noreferrer">Website</a>}
              <a className="hover:text-white" href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">pump.fun</a>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-mute">Market cap</p>
            <p className="num text-2xl font-bold">{mcText}</p>
          </div>
        </header>

        {qErr && !q && <p className="rounded-md bg-bleed/15 p-3 text-sm text-bleed">No live price for this address. Check it is a pump.fun coin.</p>}

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 xl:grid-cols-5">
          <Stat label="Bonding curve" value={q ? (q.migrated ? "graduated" : pct(q.progress).replace("+", "")) : "–"} />
          <Stat label="ATH mc" value={mcf.fmt(coin?.ath_mc_sol)} />
          <Stat label="Posers holding" value={String(pstats.holders)} />
          <Stat label="POSER volume today" value={`${sol(pstats.vol, 1)} SOL`} />
          <Stat label="Your position" value={posValue != null ? `${sol(posValue, 3)} SOL` : "none"}
            tone={pos && posValue != null ? (posValue >= Number(pos.cost_sol) ? "text-mint" : "text-bleed") : ""} />
        </div>

        {q && !q.migrated && (
          <div className="h-1.5 overflow-hidden rounded-full bg-line" title="Bonding curve progress">
            <div className="h-full sol-bar transition-[width] duration-700" style={{ width: `${Math.round(q.progress * 100)}%` }} />
          </div>
        )}

        <Chart mint={mint} liveMc={q?.mc ?? null} entryMc={entryMc} myId={me.profile?.id} />

        <section className="card overflow-hidden">
          <div className="flex gap-1 border-b border-line p-2" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={"rounded-md px-3 py-1.5 text-sm " + (tab === t ? "bg-ink text-white" : "text-mute hover:text-white")}>{t}</button>
            ))}
          </div>
          <div className="max-h-[520px] overflow-y-auto">
            {tab === "Live trades" && <ChainTrades mint={mint} symbol={sym} solUsd={solUsd} />}
            {tab === "Posers" && <PoserTape mint={mint} />}
            {tab === "Notes" && <PoserTape mint={mint} notesOnly />}
            {tab === "Holders" && <Holders mint={mint} price={q?.price ?? null} />}
            {tab === "My orders" && <Orders mint={mint} orders={orders} reload={reload} />}
          </div>
        </section>

        {coin?.description && <p className="text-sm text-mute">{coin.description}</p>}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <TradePanel mint={mint} symbol={sym} quote={q} onOrder={reload} />
        {pos && (
          <div className="card p-4 text-sm">
            <p className="mb-2 font-semibold">Your {sym}</p>
            <dl className="space-y-1">
              <Row k="Tokens" v={compact(Number(pos.tokens))} />
              <Row k="Cost" v={`${sol(Number(pos.cost_sol), 3)} SOL`} />
              <Row k="Value" v={posValue != null ? `${sol(posValue, 3)} SOL` : "–"} />
              {pos.tp_mult && <Row k="Take profit" v={pct(pos.tp_mult - 1)} />}
              {pos.sl_mult && <Row k="Stop loss" v={pct(pos.sl_mult - 1)} />}
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className="card p-3"><p className="text-xs text-mute">{label}</p><p className={"num mt-1 font-semibold " + tone}>{value}</p></div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><dt className="text-mute">{k}</dt><dd className="num">{v}</dd></div>;
}

function ChainTrades({ mint }: { mint: string; symbol: string; solUsd: number | null }) {
  const [rows, setRows] = useState<any[]>([]);
  const mcf = useMc();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      // every real trade from pump.fun's feed (curve and PumpSwap); our own recorded trades only if that's down
      const j = await fetch(`/api/trades/${mint}`).then((r) => r.json()).catch(() => ({ trades: [] }));
      if (!alive) return;
      if (j.trades?.length) return setRows((j.trades as any[]).slice(-100).reverse().map((x: any, i: number) => ({
        id: `${x.sig ?? i}:${x.t}:${i}`, sig: x.sig, ts: new Date(x.t * 1000).toISOString(), side: x.side, mc_sol: x.mc, sol: x.sol, trader: x.trader })));
      const { data } = await sb().from("coin_trades").select("*").eq("mint", mint).order("ts", { ascending: false }).limit(60);
      if (alive && data?.length) setRows(data);
    };
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, [mint]);
  if (!rows.length) return <p className="py-8 text-center text-sm text-mute">No trades for this coin yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-mute"><tr><th className="px-3 py-2 font-normal">Age</th><th className="font-normal">Type</th><th className="font-normal">MC</th><th className="text-right font-normal">SOL</th><th className="px-3 text-right font-normal">Trader</th></tr></thead>
      <tbody className="num">
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className="px-3 py-1.5 text-mute">{r.sig ? <a href={`https://solscan.io/tx/${r.sig}`} target="_blank" rel="noreferrer" className="hover:text-white">{ago(r.ts)}</a> : ago(r.ts)}</td>
            <td className={r.side === "buy" ? "text-mint" : "text-bleed"}>{r.side}</td>
            <td>{mcf.fmt(r.mc_sol)}</td>
            <td className="text-right">{sol(r.sol, 3)}</td>
            <td className="px-3 text-right text-mute">{r.trader ? <a href={`https://solscan.io/account/${r.trader}`} target="_blank" rel="noreferrer" className="hover:text-white">{shortAddr(r.trader)}</a> : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Holders({ mint, price }: { mint: string; price: number | null }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    sb().from("positions").select("tokens,cost_sol,profiles(username,avatar_seed,is_agent)").eq("day", leagueDay()).eq("mint", mint)
      .order("tokens", { ascending: false }).limit(50).then(({ data }) => setRows(data ?? []));
  }, [mint]);
  if (!rows.length) return <p className="py-8 text-center text-sm text-mute">No posers hold this today.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((r, i) => {
        const value = price ? Number(r.tokens) * price : null;
        const up = value != null && value >= Number(r.cost_sol);
        return (
          <li key={i} className="flex items-center gap-3 px-3 py-2">
            <Avatar seed={r.profiles.avatar_seed} bot={r.profiles.is_agent} size={24} />
            <Link href={`/u/${r.profiles.username}`} className="flex-1 hover:text-pop">{r.profiles.username}</Link>
            <span className="num text-mute">{compact(Number(r.tokens))}</span>
            <span className={"num w-24 text-right " + (up ? "text-mint" : "text-bleed")}>{value != null ? `${sol(value, 2)} SOL` : "–"}</span>
          </li>
        );
      })}
    </ul>
  );
}