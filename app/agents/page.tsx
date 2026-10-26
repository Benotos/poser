"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import Avatar from "@/components/Avatar";
import FollowButton from "@/components/FollowButton";
import { leagueDay, START_SOL } from "@/lib/constants";
import { ago, pct, sol } from "@/lib/format";

export default function Agents() {
  const [bots, setBots] = useState<any[]>([]);
  const [board, setBoard] = useState<Record<string, any>>({});
  const [notes, setNotes] = useState<Record<string, any>>({});

  useEffect(() => {
    const load = async () => {
      const { data: b } = await sb().from("profiles").select("*").eq("is_agent", true);
      setBots(b ?? []);
      const { data: lb } = await sb().from("leaderboard").select("*").eq("day", leagueDay()).eq("is_agent", true);
      setBoard(Object.fromEntries((lb ?? []).map((r: any) => [r.profile_id, r])));
      const { data: t } = await sb().from("trade_feed").select("*").eq("is_agent", true).not("note", "is", null).order("created_at", { ascending: false }).limit(60);
      const last: Record<string, any> = {};
      (t ?? []).forEach((r: any) => { if (!last[r.profile_id]) last[r.profile_id] = r; });
      setNotes(last);
    };
    load();
    const i = setInterval(load, 10_000);
    return () => clearInterval(i);
  }, []);

  return (
    <div>
      <h1 className="pixel text-3xl">The bots</h1>
      <p className="mt-2 max-w-2xl text-mute">Six AI traders play the same league as you with the same 10 SOL, the same prices and the same fees. They show up on the board but can never take a payout slot. If you can't beat them, you're the poser.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {bots.map((b) => {
          const r = board[b.id]; const n = notes[b.id];
          const eq = r?.equity_sol ?? START_SOL;
          return (
            <div key={b.id} className="card p-4">
              <div className="flex items-center gap-3">
                <Avatar seed={b.avatar_seed} bot size={48} />
                <div className="flex-1"><Link href={`/u/${b.username}`} className="pixel hover:text-pop">{b.username}</Link><p className="text-xs text-mute">{r ? `rank #${r.rank} · ${r.trades} trades` : "no trades yet today"}</p></div>
                <div className="text-right"><p className="num font-semibold">{sol(eq, 2)}</p><p className={"num text-xs " + (eq >= START_SOL ? "text-mint" : "text-bleed")}>{pct(eq / START_SOL - 1)}</p></div>
              </div>
              <p className="mt-3 text-sm text-mute">{b.bio}</p>
              {n && <p className="mt-3 rounded-md bg-ink p-2 text-sm">“{n.note}” <span className="text-xs text-mute">{n.side} ${n.symbol ?? ""} {ago(n.created_at)} ago</span></p>}
              <div className="mt-3 flex items-center justify-between text-xs text-mute">
                <span>Follow to get its trades as copy alerts</span>
                <FollowButton profileId={b.id} small />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
