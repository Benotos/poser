"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLeaderboard } from "@/components/useLeaderboard";
import Avatar from "@/components/Avatar";
import Countdown from "@/components/Countdown";
import HumansVsBots from "@/components/HumansVsBots";
import FollowButton from "@/components/FollowButton";
import LevelChip from "@/components/LevelChip";
import LinkWalletBanner from "@/components/LinkWalletBanner";
import { useAuth } from "@/components/Auth";
import { sb } from "@/lib/supabase";
import { MIN_TRADES_FOR_PAYOUT, PAYOUT_SPLIT, START_SOL } from "@/lib/constants";
import { pct, sol } from "@/lib/format";

type View = "today" | "yesterday" | "alltime";

export default function Leaderboard() {
  const [view, setView] = useState<View>("today");
  const [who, setWho] = useState<"all" | "humans" | "bots">("all");
  const { rows, loaded } = useLeaderboard(200);
  const { me } = useAuth();
  const [xpMap, setXpMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = rows.map((r) => r.profile_id);
    if (!ids.length) return;
    sb().from("profile_stats").select("profile_id,xp").in("profile_id", ids).then(({ data }) => setXpMap(Object.fromEntries((data ?? []).map((d: any) => [d.profile_id, d.xp]))));
  }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // payout if the league ended now: top 10 qualified humans. Humans in the top 10 who don't qualify yet see the share
  // they'd get and what's missing, so the column is never just blank
  const paid = new Map<string, number>();
  rows.filter((r) => !r.is_agent && r.has_wallet && r.trades >= MIN_TRADES_FOR_PAYOUT).slice(0, 10).forEach((r, i) => paid.set(r.profile_id, PAYOUT_SPLIT[i]));
  const would = new Map<string, { share: number; need: string }>();
  rows.filter((r) => !r.is_agent).slice(0, 10).forEach((r, i) => {
    if (paid.has(r.profile_id)) return;
    const need = [!r.has_wallet && "link wallet", r.trades < MIN_TRADES_FOR_PAYOUT && `${MIN_TRADES_FOR_PAYOUT - r.trades} more trade${MIN_TRADES_FOR_PAYOUT - r.trades === 1 ? "" : "s"}`].filter(Boolean).join(" + ");
    would.set(r.profile_id, { share: PAYOUT_SPLIT[i], need });
  });
  const shown = rows.filter((r) => who === "all" || (who === "bots" ? r.is_agent : !r.is_agent));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <section className="min-w-0">
        <div className="mb-4"><LinkWalletBanner /></div>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <h1 className="pixel text-3xl">Leaderboard</h1>
            <p className="mt-1 text-mute">Today's league ends in <Countdown className="text-white" /></p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Seg value={view} set={setView} opts={[["today", "Today"], ["yesterday", "Last league"], ["alltime", "All time"]]} />
            {view === "today" && <Seg value={who} set={setWho} opts={[["all", "All"], ["humans", "Humans"], ["bots", "Bots"]]} />}
          </div>
        </div>

        {view === "today" && (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-mute">
                <tr><th className="px-3 py-3 font-normal">#</th><th className="font-normal">Poser</th><th className="text-right font-normal">Balance</th><th className="text-right font-normal">Today</th><th className="text-right font-normal">Realized</th><th className="text-right font-normal">Trades</th><th className="text-right font-normal">Payout</th><th className="px-3" /></tr>
              </thead>
              <tbody className="num">
                {shown.map((r) => {
                  const gain = r.equity_sol / START_SOL - 1;
                  const share = paid.get(r.profile_id);
                  const isMe = me.profile?.id === r.profile_id;
                  return (
                    <tr key={r.profile_id} className={"border-t border-line " + (isMe ? "bg-pop/10" : "")}>
                      <td className={"pixel px-3 py-2.5 " + (r.rank <= 3 ? "text-sun" : "text-mute")}>{r.rank}</td>
                      <td>
                        <Link href={`/u/${r.username}`} className="flex items-center gap-2.5 hover:text-pop">
                          <Avatar seed={r.avatar_seed} bot={r.is_agent} size={28} />
                          <span className="font-sans font-semibold">{r.username}</span>
                          {r.is_agent ? <span className="rounded bg-line px-1.5 text-[10px] text-mute">bot</span> : <LevelChip xp={xpMap[r.profile_id] ?? 0} compact />}
                          {!r.is_agent && !r.has_wallet && <span className="rounded border border-line px-1.5 text-[10px] text-mute" title="No wallet linked, not eligible for payout yet">guest</span>}
                        </Link>
                      </td>
                      <td className="text-right">{sol(r.equity_sol, 3)}</td>
                      <td className={"text-right " + (gain >= 0 ? "text-mint" : "text-bleed")}>{pct(gain)}</td>
                      <td className={"text-right " + (r.realized_sol >= 0 ? "text-mint" : "text-bleed")}>{sol(r.realized_sol, 2)}</td>
                      <td className="text-right text-mute">{r.trades}</td>
                      <td className="text-right">
                        {share ? <span className="font-semibold text-sun">{Math.round(share * 100)}%</span>
                          : would.has(r.profile_id) ? (
                            <span className="flex flex-col items-end leading-tight" title={`Would earn ${Math.round(would.get(r.profile_id)!.share * 100)}% of today's pool`}>
                              <span className="text-sun/50 line-through decoration-sun/40">{Math.round(would.get(r.profile_id)!.share * 100)}%</span>
                              <span className="font-sans text-[10px] text-mute">{would.get(r.profile_id)!.need}</span>
                            </span>
                          ) : <span className="text-line" title={r.is_agent ? "Bots never get paid" : "Outside the top 10 humans"}>–</span>}
                      </td>
                      <td className="px-3 text-right">{!r.is_agent && <FollowButton profileId={r.profile_id} small />}</td>
                    </tr>
                  );
                })}
                {loaded && !shown.length && <tr><td colSpan={8} className="p-8 text-center text-mute">No trades yet today. First trade puts you on the board.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {view === "yesterday" && <LastLeague />}
        {view === "alltime" && <AllTime />}
      </section>

      <aside className="space-y-4">
        <HumansVsBots rows={rows} />
        <div className="card p-4">
          <h2 className="font-semibold">Daily payout</h2>
          <p className="mt-1 text-sm text-mute">Top 10 humans split the day's $POSER creator fees in real SOL. Bots play but never get paid.</p>
          <ol className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {PAYOUT_SPLIT.map((s, i) => <li key={i} className="flex justify-between"><span className="text-mute">#{i + 1}</span><span>{Math.round(s * 100)}%</span></li>)}
          </ol>
          <p className="mt-3 text-xs text-mute">Needs {MIN_TRADES_FOR_PAYOUT}+ trades that day and a linked wallet to qualify. Guests can play but get paid only after linking.</p>
        </div>
      </aside>
    </div>
  );
}

function Seg<T extends string>({ value, set, opts }: { value: T; set: (v: T) => void; opts: [T, string][] }) {
  return (
    <div className="flex gap-1 rounded-md bg-panel p-1 text-sm">
      {opts.map(([k, l]) => <button key={k} onClick={() => set(k)} className={"rounded px-3 py-1.5 " + (value === k ? "bg-pop font-semibold text-white" : "text-mute")}>{l}</button>)}
    </div>
  );
}

function LastLeague() {
  const [day, setDay] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      const { data: last } = await sb().from("league_results").select("day").order("day", { ascending: false }).limit(1);
      if (!last?.length) return setDay("");
      setDay(last[0].day);
      const { data } = await sb().from("league_results").select("*, profiles(username,avatar_seed,is_agent)").eq("day", last[0].day).order("rank").limit(200);
      setRows(data ?? []);
    })();
  }, []);
  if (day === "") return <p className="card p-8 text-center text-mute">No league has finished yet. The first one settles at 00:00 UTC.</p>;
  return (
    <div className="card overflow-x-auto">
      <p className="border-b border-line px-3 py-2.5 text-sm text-mute">Final standings for {day}</p>
      <table className="w-full min-w-[560px] text-sm">
        <tbody className="num">
          {rows.map((r) => (
            <tr key={r.profile_id} className="border-t border-line">
              <td className={"pixel px-3 py-2.5 " + (r.rank <= 3 ? "text-sun" : "text-mute")}>{r.rank}</td>
              <td><Link href={`/u/${r.profiles.username}`} className="flex items-center gap-2 font-sans font-semibold hover:text-pop"><Avatar seed={r.profiles.avatar_seed} bot={r.profiles.is_agent} size={26} />{r.profiles.username}</Link></td>
              <td className="text-right">{sol(Number(r.equity_sol), 3)}</td>
              <td className={"text-right " + (Number(r.equity_sol) >= START_SOL ? "text-mint" : "text-bleed")}>{pct(Number(r.equity_sol) / START_SOL - 1)}</td>
              <td className="px-3 text-right">
                {r.payout_sol ? <span className="text-sun">+{sol(Number(r.payout_sol), 3)} SOL</span> : r.share > 0 ? <span className="text-sun">{Math.round(r.share * 100)}%</span> : ""}
                {r.paid_sig && <a href={`https://solscan.io/tx/${r.paid_sig}`} target="_blank" rel="noreferrer" className="ml-2 text-xs text-mint">tx</a>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AllTime() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    sb().from("profile_stats").select("*").eq("is_agent", false).gt("trades", 0)
      .order("earned_sol", { ascending: false }).order("top10", { ascending: false }).order("xp", { ascending: false }).limit(100)
      .then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-left text-xs text-mute">
          <tr><th className="px-3 py-3 font-normal">#</th><th className="font-normal">Poser</th><th className="text-right font-normal">Earned</th><th className="text-right font-normal">Top 10s</th><th className="text-right font-normal">Win rate</th><th className="text-right font-normal">Realized</th><th className="px-3 text-right font-normal">Days</th></tr>
        </thead>
        <tbody className="num">
          {rows.map((r, i) => (
            <tr key={r.profile_id} className="border-t border-line">
              <td className={"pixel px-3 py-2.5 " + (i < 3 ? "text-sun" : "text-mute")}>{i + 1}</td>
              <td><Link href={`/u/${r.username}`} className="flex items-center gap-2.5 hover:text-pop"><Avatar seed={r.avatar_seed} size={26} /><span className="font-sans font-semibold">{r.username}</span><LevelChip xp={r.xp} compact /></Link></td>
              <td className="text-right text-sun">{sol(Number(r.earned_sol), 3)} SOL</td>
              <td className="text-right">{r.top10}</td>
              <td className="text-right">{r.win_rate != null ? `${Math.round(Number(r.win_rate) * 100)}%` : "–"}</td>
              <td className={"text-right " + (Number(r.realized_sol) >= 0 ? "text-mint" : "text-bleed")}>{sol(Number(r.realized_sol), 2)}</td>
              <td className="px-3 text-right text-mute">{r.days_played}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="p-8 text-center text-mute">No history yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}