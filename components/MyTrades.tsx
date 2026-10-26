"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { sol } from "@/lib/format";

export default function MyTrades({ pid }: { pid: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    sb().from("trade_feed").select("*").eq("profile_id", pid).order("created_at", { ascending: false }).limit(50).then(({ data }) => setRows(data ?? []));
  }, [pid]);
  if (!rows.length) return <p className="p-8 text-center text-sm text-mute">No trades yet.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <a href={`/coin/${r.mint}`} className="hover:text-pop"><span className={r.side === "buy" ? "text-mint" : "text-bleed"}>{r.side}</span> ${r.symbol ?? r.mint.slice(0, 4)}</a>
          <span className="num">{sol(r.sol, 3)} SOL {r.pnl_sol != null && <span className={r.pnl_sol >= 0 ? "text-mint" : "text-bleed"}>({r.pnl_sol >= 0 ? "+" : ""}{sol(r.pnl_sol, 3)})</span>}</span>
        </li>
      ))}
    </ul>
  );
}
