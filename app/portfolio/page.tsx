"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { useSocial } from "@/components/Social";
import { useToast } from "@/components/Toasts";
import Avatar from "@/components/Avatar";
import Positions from "@/components/Positions";
import MyTrades from "@/components/MyTrades";
import Orders, { useOrders } from "@/components/Orders";
import MiniChart from "@/components/MiniChart";
import LevelChip from "@/components/LevelChip";
import CoinImg from "@/components/CoinImg";
import Countdown from "@/components/Countdown";
import LinkWalletBanner from "@/components/LinkWalletBanner";
import { shareToX } from "@/components/share";
import { useMc } from "@/components/useMc";
import { sb } from "@/lib/supabase";
import { leagueDay, START_SOL } from "@/lib/constants";
import { pct, sol } from "@/lib/format";
import { sfx } from "@/lib/sfx";

const TABS = ["Positions", "Orders", "Watchlist", "Trades"] as const;

export default function Portfolio() {
  const { me, refresh, loading, setJoinOpen } = useAuth();
  const { xp, rank } = useSocial();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Positions");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [curve, setCurve] = useState<{ time: number; value: number }[]>([]);
  const { orders, reload } = useOrders();

  useEffect(() => { setBio(me.profile?.bio ?? ""); }, [me.profile?.bio]);
  useEffect(() => {
    if (!me.profile) return;
    sb().from("equity_snapshots").select("ts,equity_sol").eq("day", leagueDay()).eq("profile_id", me.profile.id).order("ts").limit(1000).then(({ data }) => {
      const pts: { time: number; value: number }[] = (data ?? []).map((r: any) => ({ time: Math.floor(Date.parse(r.ts) / 1000), value: Number(r.equity_sol) }));
      pts.push({ time: Math.floor(Date.now() / 1000), value: Number(me.entry?.equity_sol ?? START_SOL) });
      setCurve(pts.filter((x, i, a) => i === 0 || x.time > a[i - 1].time));
    });
  }, [me]);

  if (loading) return <p className="text-mute">Loading</p>;
  if (!me.profile)
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="pixel text-3xl">Your portfolio</h1>
        <p className="mt-3 text-mute">Pick a name and get 10 fake SOL. No wallet needed to play.</p>
        <button className="btn-pop mt-6 px-6 py-3" onClick={() => setJoinOpen(true)}>Play now</button>
      </div>
    );

  const e = me.entry!;
  const invested = (me.positions ?? []).reduce((a, p) => a + Number(p.cost_sol), 0);
  const sell = async (mint: string) => {
    setBusy(mint);
    const r = await fetch("/api/trade", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint, side: "sell", pct: 1 }) }).then((r) => r.json());
    setBusy(null);
    if (r.error) return toast({ tone: "bleed", title: r.error.replace(/_/g, " ") });
    r.pnl_sol >= 0 ? sfx.win() : sfx.loss();
    toast({ tone: r.pnl_sol >= 0 ? "mint" : "bleed", title: `Sold for ${sol(r.sol, 3)} SOL`, body: `${r.pnl_sol >= 0 ? "+" : ""}${sol(r.pnl_sol, 3)} SOL`,
      action: r.trade_id ? { label: "Share", run: () => shareToX("closed a trade on POSER", `/share/trade/${r.trade_id}`) } : undefined });
    refresh();
  };
  const sellAll = async () => { for (const p of me.positions ?? []) await sell(p.mint); };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar seed={me.profile.avatar_seed} size={64} />
        <div className="flex-1">
          <Link href={`/u/${me.profile.username}`} className="pixel text-3xl hover:text-pop">{me.profile.username}</Link>
          <div className="mt-1 flex items-center gap-4 text-sm text-mute"><LevelChip xp={xp} /><span>Resets in <Countdown className="text-white" /></span></div>
        </div>
        <button className="btn-ghost" onClick={() => shareToX(`${pct(e.equity_sol / START_SOL - 1)} today on POSER. beat me.`, `/share/day/${me.profile!.username}`)}>Share my day</button>
      </header>

      <LinkWalletBanner />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="grid grid-cols-2 gap-2">
          <Stat k="Balance" v={`${sol(e.equity_sol, 3)}`} sub="SOL" />
          <Stat k="Today" v={pct(e.equity_sol / START_SOL - 1)} tone={e.equity_sol >= START_SOL ? "text-mint" : "text-bleed"} sub={`${e.equity_sol >= START_SOL ? "+" : ""}${sol(e.equity_sol - START_SOL, 3)} SOL`} />
          <Stat k="Cash" v={sol(e.cash_sol, 3)} sub={`${sol(invested, 3)} in positions`} />
          <Stat k="Rank" v={rank ? `#${rank}` : "–"} sub={`${e.trades} trades · realized ${sol(e.realized_sol, 2)}`} />
        </div>
        <section className="card p-4"><h2 className="mb-1 text-sm font-semibold">Equity today</h2><MiniChart data={curve} kind="area" height={180} /></section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line p-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={"rounded-md px-3 py-1.5 text-sm " + (tab === t ? "bg-ink text-white" : "text-mute hover:text-white")}>
              {t} {t === "Positions" && <span className="num text-mute">{me.positions?.length ?? 0}</span>}
              {t === "Orders" && <span className="num text-mute">{orders.filter((o) => o.status === "open").length}</span>}
            </button>
          ))}
          {tab === "Positions" && !!me.positions?.length && <button className="btn-ghost ml-auto px-3 py-1 text-xs" onClick={sellAll}>Sell everything</button>}
        </div>
        {tab === "Positions" && <Positions rows={me.positions ?? []} onSell={sell} busy={busy} />}
        {tab === "Orders" && <Orders orders={orders} reload={reload} />}
        {tab === "Watchlist" && <Watchlist />}
        {tab === "Trades" && <div className="max-h-[520px] overflow-y-auto"><MyTrades pid={me.profile.id} /></div>}
      </section>

      <section className="card max-w-xl p-4">
        <h2 className="font-semibold">Bio</h2>
        <p className="mt-1 text-sm text-mute">Shows on your public profile.</p>
        <textarea className="input mt-3 h-24 resize-none" maxLength={160} value={bio} onChange={(ev) => { setBio(ev.target.value); setSaved(false); }} />
        <button className="btn-ghost mt-2" onClick={async () => { await fetch("/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ bio }) }); setSaved(true); }}>
          {saved ? "Saved" : "Save bio"}
        </button>
      </section>
    </div>
  );
}

function Stat({ k, v, sub, tone = "" }: { k: string; v: string; sub?: string; tone?: string }) {
  return <div className="card p-4"><p className="text-xs text-mute">{k}</p><p className={"num mt-1 text-2xl font-semibold " + tone}>{v}</p>{sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}</div>;
}

function Watchlist() {
  const [items, setItems] = useState<any[]>([]);
  const { watch, toggleWatch } = useSocial();
  const mc = useMc();
  useEffect(() => { fetch("/api/watchlist").then((r) => r.json()).then((j) => setItems(j.items ?? [])); }, [watch.size]);
  if (!items.length) return <p className="p-8 text-center text-sm text-mute">Star coins to track them here and on the terminal.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {items.map((i) => (
        <li key={i.mint} className="flex items-center gap-3 px-3 py-2">
          <CoinImg src={i.coins?.image} symbol={i.coins?.symbol} mint={i.mint} size={28} />
          <Link href={`/coin/${i.mint}`} className="flex-1 font-semibold hover:text-pop">${i.coins?.symbol ?? i.mint.slice(0, 4)} <span className="font-normal text-mute">{i.coins?.name}</span></Link>
          <span className="num">{mc.fmt(i.coins?.mc_sol)}</span>
          <button className="text-xs text-mute hover:text-bleed" onClick={() => toggleWatch(i.mint)}>Remove</button>
        </li>
      ))}
    </ul>
  );
}