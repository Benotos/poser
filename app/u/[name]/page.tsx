"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { sb } from "@/lib/supabase";
import Avatar from "@/components/Avatar";
import Positions from "@/components/Positions";
import MyTrades from "@/components/MyTrades";
import MiniChart from "@/components/MiniChart";
import Badges from "@/components/Badges";
import FollowButton from "@/components/FollowButton";
import { shareToX } from "@/components/share";
import { useAuth } from "@/components/Auth";
import { leagueDay, START_SOL } from "@/lib/constants";
import { badges, level, Stats } from "@/lib/xp";
import { pct, sol } from "@/lib/format";

export default function UserPage({ params }: { params: { name: string } }) {
  const { me } = useAuth();
  const [p, setP] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [lb, setLb] = useState<any>(null);
  const [st, setSt] = useState<any>(null);
  const [pos, setPos] = useState<any[]>([]);
  const [hist, setHist] = useState<any[]>([]);
  const [curve, setCurve] = useState<{ time: number; value: number }[]>([]);
  const [botSlayer, setBotSlayer] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await sb().from("profiles").select("*").eq("username", decodeURIComponent(params.name)).maybeSingle();
      if (!alive) return;
      if (!data) return setMissing(true);
      setP(data);
      const day = leagueDay();
      const [a, b, c, d, e] = await Promise.all([
        sb().from("leaderboard").select("*").eq("day", day).eq("profile_id", data.id).maybeSingle(),
        sb().from("positions").select("*, coins(name,symbol,image)").eq("day", day).eq("profile_id", data.id),
        sb().from("league_results").select("*").eq("profile_id", data.id).order("day", { ascending: false }).limit(60),
        sb().from("equity_snapshots").select("ts,equity_sol").eq("day", day).eq("profile_id", data.id).order("ts").limit(1000),
        sb().from("profile_stats").select("*").eq("profile_id", data.id).maybeSingle(),
      ]);
      if (!alive) return;
      setLb(a.data); setPos(b.data ?? []); setHist(c.data ?? []); setSt(e.data);
      const pts: { time: number; value: number }[] = (d.data ?? []).map((r: any) => ({ time: Math.floor(Date.parse(r.ts) / 1000), value: Number(r.equity_sol) }));
      if (a.data) pts.push({ time: Math.floor(Date.now() / 1000), value: Number(a.data.equity_sol) });
      setCurve(pts.filter((x, i, arr) => i === 0 || x.time > arr[i - 1].time));
      // bot slayer: days this poser finished above every bot
      const days = (c.data ?? []).map((r: any) => r.day);
      if (days.length && !data.is_agent) {
        const { data: bots } = await sb().from("league_results").select("day,rank,profiles!inner(is_agent)").in("day", days).eq("profiles.is_agent", true);
        const best = new Map<string, number>();
        (bots ?? []).forEach((r: any) => best.set(r.day, Math.min(best.get(r.day) ?? 1e9, r.rank)));
        setBotSlayer((c.data ?? []).filter((r: any) => best.has(r.day) && r.rank < best.get(r.day)!).length);
      }
    })();
    return () => { alive = false; };
  }, [params.name]);

  const daily = useMemo(() => [...hist].reverse().map((h) => ({ time: Math.floor(Date.parse(h.day) / 1000), value: Number(h.equity_sol) - START_SOL })), [hist]);
  const stats: Stats | null = st && {
    trades: st.trades, sells: st.sells, wins: st.wins, win_rate: st.win_rate == null ? null : Number(st.win_rate), realized_sol: Number(st.realized_sol),
    best_pnl: st.best_pnl == null ? null : Number(st.best_pnl), best_pct: st.best_pct == null ? null : Number(st.best_pct), days_played: st.days_played,
    top10: st.top10, first_places: st.first_places, best_rank: st.best_rank, earned_sol: Number(st.earned_sol), xp: st.xp,
  };
  const greenDays = hist.filter((h) => Number(h.equity_sol) > START_SOL).length;
  const streak = (() => { let n = 0; for (const h of hist) { if (Number(h.equity_sol) > START_SOL) n++; else break; } return n; })();

  if (missing) return <p className="py-16 text-center text-mute">No poser called {params.name}. <Link href="/leaderboard" className="text-white underline">See the leaderboard</Link></p>;
  if (!p) return <p className="text-mute">Loading</p>;
  const eq = Number(lb?.equity_sol ?? START_SOL);
  const L = level(stats?.xp ?? 0);
  const mine = me.profile?.id === p.id;

  return (
    <div className="space-y-6">
      <header className="card flex flex-wrap items-center gap-5 p-5">
        <div className="relative">
          <Avatar seed={p.avatar_seed} bot={p.is_agent} size={96} />
          <span className="pixel absolute -bottom-2 -right-2 rounded bg-sun px-1.5 py-0.5 text-[10px] text-ink">LV {L.lvl}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="pixel text-3xl">{p.username}</h1>
            {p.is_agent ? <span className="rounded bg-line px-2 py-0.5 text-xs text-mute">bot</span> : <span className="pixel text-xs text-sun">{L.title}</span>}
          </div>
          {p.bio && <p className="mt-1 max-w-xl text-mute">{p.bio}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-mute">
            <span><span className="num text-white">{st?.followers ?? 0}</span> followers</span>
            <span><span className="num text-white">{st?.following ?? 0}</span> following</span>
            <span className="flex items-center gap-2"><span className="block h-1.5 w-28 overflow-hidden rounded-full bg-line"><span className="block h-full bg-sun" style={{ width: `${Math.round(L.progress * 100)}%` }} /></span><span className="num">{L.toNext} XP to LV {L.lvl + 1}</span></span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="num text-3xl font-bold">{sol(eq, 3)} <span className="text-base text-mute">SOL</span></p>
          <p className={"num text-sm " + (eq >= START_SOL ? "text-mint" : "text-bleed")}>{pct(eq / START_SOL - 1)} today {lb?.rank && <span className="text-mute">· #{lb.rank}</span>}</p>
          <div className="flex gap-2">
            <FollowButton profileId={p.id} />
            <button className="btn-ghost" onClick={() => shareToX(mine ? `my day on POSER: ${pct(eq / START_SOL - 1)}. can you beat it?` : `${p.username} is ${pct(eq / START_SOL - 1)} today on POSER`, `/share/day/${p.username}`)}>Share</button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat k="Win rate" v={stats?.win_rate != null ? `${Math.round(stats.win_rate * 100)}%` : "–"} sub={`${stats?.wins ?? 0} of ${stats?.sells ?? 0} closed`} />
        <Stat k="Realized all time" v={`${sol(stats?.realized_sol ?? 0, 2)}`} sub="fake SOL" tone={(stats?.realized_sol ?? 0) >= 0 ? "text-mint" : "text-bleed"} />
        <Stat k="Best trade" v={stats?.best_pct != null ? pct(stats.best_pct) : "–"} sub={stats?.best_pnl != null ? `+${sol(stats.best_pnl, 2)} SOL` : ""} tone="text-mint" />
        <Stat k="Trades" v={String(stats?.trades ?? 0)} sub={`${sol(Number(st?.volume_sol ?? 0), 0)} SOL volume`} />
        <Stat k="Days played" v={String(stats?.days_played ?? 0)} sub={`${greenDays} green`} />
        <Stat k="Green streak" v={String(streak)} sub="days in a row" tone={streak ? "text-sun" : ""} />
        <Stat k="Top 10 finishes" v={String(stats?.top10 ?? 0)} sub={stats?.best_rank ? `best #${stats.best_rank}` : "not yet"} />
        <Stat k="Earned" v={`${sol(stats?.earned_sol ?? 0, 3)}`} sub="real SOL" tone="text-sun" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Today's equity</h2>
          <MiniChart data={curve} kind="area" />
        </section>
        <section className="card p-4">
          <h2 className="mb-2 font-semibold">Daily PnL</h2>
          <MiniChart data={daily} kind="bars" />
        </section>
      </div>

      {stats && !p.is_agent && (
        <section>
          <h2 className="mb-3 font-semibold">Badges <span className="num text-sm text-mute">{badges(stats, { greenDays, botSlayer }).filter((b) => b.got).length}/12</span></h2>
          <Badges list={badges(stats, { greenDays, botSlayer })} />
        </section>
      )}

      <section className="card overflow-hidden"><h2 className="border-b border-line px-3 py-3 font-semibold">Holding today</h2><Positions rows={pos} /></section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-hidden"><h2 className="border-b border-line px-3 py-3 font-semibold">Recent trades</h2><div className="max-h-[480px] overflow-y-auto"><MyTrades pid={p.id} /></div></section>
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-3 py-3 font-semibold">Past leagues</h2>
          {!hist.length ? <p className="p-8 text-center text-sm text-mute">No finished leagues yet.</p> : (
            <ul className="max-h-[480px] divide-y divide-line overflow-y-auto text-sm">
              {hist.map((h) => (
                <li key={h.day} className="num grid grid-cols-4 px-3 py-2">
                  <span className="text-mute">{h.day}</span><span>#{h.rank}</span>
                  <span className={Number(h.equity_sol) >= START_SOL ? "text-mint" : "text-bleed"}>{pct(Number(h.equity_sol) / START_SOL - 1)}</span>
                  <span className="text-right text-sun">{h.payout_sol ? `+${sol(Number(h.payout_sol), 3)} SOL` : h.share > 0 ? `${Math.round(h.share * 100)}% pending` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ k, v, sub, tone = "" }: { k: string; v: string; sub?: string; tone?: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-mute">{k}</p>
      <p className={"num mt-1 text-xl font-semibold " + tone}>{v}</p>
      {sub && <p className="mt-0.5 text-[11px] text-mute">{sub}</p>}
    </div>
  );
}