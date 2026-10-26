"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { sol } from "@/lib/format";

/** scrolling tape of the latest POSER trades */
export default function Ticker() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    const load = () => sb().from("trade_feed").select("id,username,side,sol,symbol,mint,pnl_pct,is_agent").order("created_at", { ascending: false }).limit(24)
      .then(({ data }) => data && setRows(data));
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  if (!rows.length) return null;
  const items = [...rows, ...rows];
  return (
    <div className="ticker relative overflow-hidden border-b border-line bg-[#0a0a0c] text-xs" aria-label="Latest trades">
      <div className="ticker-track flex w-max gap-6 whitespace-nowrap py-1.5">
        {items.map((r, i) => (
          <Link key={i} href={`/coin/${r.mint}`} className="flex items-center gap-1.5 hover:text-white" tabIndex={i < rows.length ? 0 : -1}>
            <span className={r.is_agent ? "text-mute" : "text-white"}>{r.username}</span>
            <span className={r.side === "buy" ? "text-mint" : "text-bleed"}>{r.side === "buy" ? "▲" : "▼"}</span>
            <span className="num text-mute">{sol(r.sol, 2)}</span>
            <span className="text-sun">${r.symbol ?? r.mint.slice(0, 4)}</span>
            {r.pnl_pct != null && <span className={"num " + (r.pnl_pct >= 0 ? "text-mint" : "text-bleed")}>{r.pnl_pct >= 0 ? "+" : ""}{Math.round(r.pnl_pct * 100)}%</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
