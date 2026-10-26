"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import Avatar from "./Avatar";
import CoinImg from "./CoinImg";
import { ago, sol } from "@/lib/format";

export type FeedRow = {
  id: number; mint: string; side: "buy" | "sell"; sol: number; pnl_sol: number | null; note: string | null; reason: string | null;
  created_at: string; username: string; avatar_seed: string; is_agent: boolean; symbol: string | null; image: string | null;
};

/** live feed of trades made on POSER (players and bots) */
export default function PoserTape({ mint, notesOnly = false, limit = 30, onlyIds }: { mint?: string; notesOnly?: boolean; limit?: number; onlyIds?: string[] }) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const [fresh, setFresh] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      let q = sb().from("trade_feed").select("*").order("created_at", { ascending: false }).limit(limit);
      if (mint) q = q.eq("mint", mint);
      if (notesOnly) q = q.not("note", "is", null);
      if (onlyIds) q = q.in("profile_id", onlyIds.length ? onlyIds : ["00000000-0000-0000-0000-000000000000"]);
      const { data } = await q;
      if (alive && data) {
        const rows = data as FeedRow[];
        if (top.current != null && rows[0] && rows[0].id !== top.current) setFresh(rows[0].id);
        top.current = rows[0]?.id ?? top.current;
        setRows(rows);
      }
    };
    const top = { current: null as number | null };
    load();
    const poll = setInterval(load, 4000); // cached at the edge, so this costs the database almost nothing
    return () => { alive = false; clearInterval(poll); };
  }, [mint, notesOnly, limit, onlyIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows.length) return <p className="py-8 text-center text-sm text-mute">{onlyIds ? "Follow posers to see their trades here." : notesOnly ? "No notes yet. Add one when you trade." : "No trades yet. Be the first poser in."}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.id} className={"flex gap-3 px-3 py-2.5 text-sm " + (r.id === fresh ? "flash" : "")}>
          <Avatar seed={r.avatar_seed} bot={r.is_agent} size={28} />
          <div className="min-w-0 flex-1">
            {/* wraps onto a second line instead of cutting off, so the coin and PnL are always visible */}
            <p className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5 leading-snug [overflow-wrap:anywhere]">
              <Link href={`/u/${r.username}`} className="font-semibold hover:text-pop">{r.username}</Link>{" "}
              <span className={r.side === "buy" ? "text-mint" : "text-bleed"}>{r.side === "buy" ? "bought" : "sold"}</span>{" "}
              <span className="num">{sol(r.sol, 2)} SOL</span>{" "}
              {!mint && <Link href={`/coin/${r.mint}`} className="text-mute hover:text-white">of <span className="text-white/90">${r.symbol ?? r.mint.slice(0, 4)}</span></Link>}
              {r.side === "sell" && r.pnl_sol != null && (
                <span className={"num " + (r.pnl_sol >= 0 ? "text-mint" : "text-bleed")}>({r.pnl_sol >= 0 ? "+" : ""}{sol(r.pnl_sol, 2)})</span>
              )}
              {r.reason === "tp" && <span className="text-xs text-sun">take profit</span>}
              {r.reason === "sl" && <span className="text-xs text-bleed">stop loss</span>}
            </p>
            {r.note && <p className="mt-0.5 text-mute [overflow-wrap:anywhere]">“{r.note}”</p>}
          </div>
          <span className="shrink-0 pt-0.5 text-xs text-mute">{ago(r.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}