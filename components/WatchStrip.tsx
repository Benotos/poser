"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./Auth";
import { useSocial } from "./Social";
import CoinImg from "./CoinImg";
import { useMc } from "./useMc";
import { pct } from "@/lib/format";

/** horizontal watchlist with live market caps */
export default function WatchStrip() {
  const { me } = useAuth();
  const { watch } = useSocial();
  const [items, setItems] = useState<any[]>([]);
  const mc = useMc();
  useEffect(() => {
    if (!me.profile) return;
    let alive = true;
    const load = () => fetch("/api/watchlist").then((r) => r.json()).then((j) => alive && setItems(j.items ?? []));
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [me.profile, watch.size]);
  if (!me.profile || !items.length) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-lg border border-line bg-panel/60 p-2">
      <span className="pixel shrink-0 px-1 text-xs text-sun">Watch</span>
      {items.map((i) => {
        const c = i.coins ?? {};
        const fromAth = c.ath_mc_sol && c.mc_sol ? c.mc_sol / c.ath_mc_sol - 1 : null;
        return (
          <Link key={i.mint} href={`/coin/${i.mint}`} className="flex shrink-0 items-center gap-2 rounded-md bg-ink px-2 py-1.5 text-xs hover:bg-line">
            <CoinImg src={c.image} symbol={c.symbol} mint={i.mint} size={22} />
            <span className="font-semibold">{c.symbol ?? i.mint.slice(0, 4)}</span>
            <span className="num">{mc.fmt(c.mc_sol)}</span>
            {fromAth != null && <span className={"num " + (fromAth > -0.1 ? "text-mint" : "text-bleed")}>{pct(fromAth)}</span>}
          </Link>
        );
      })}
    </div>
  );
}