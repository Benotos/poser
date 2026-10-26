"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import CoinImg from "./CoinImg";
import QuickBuyButton from "./QuickBuy";
import Star from "./Star";
import { CoinSocials, CopyCa } from "./XIcon";
import { useMc } from "./useMc";
import { ago } from "@/lib/format";

export type TCoin = {
  mint: string; name: string | null; symbol: string | null; image: string | null; created_at: string; mc_sol: number | null;
  ath_mc_sol: number | null; progress: number | null; complete: boolean; vol_5m_sol: number; trades_5m: number;
  twitter?: string | null; website?: string | null; telegram?: string | null;
};

export type Tone = "teal" | "sun" | "pop";
const TONE: Record<Tone, { ring: string; bar: string; hover: string; age: string }> = {
  teal: { ring: "ring-mint/40", bar: "bg-mint", hover: "hover:bg-mint/[.04] hover:border-l-mint", age: "bg-mint/10 text-mint" },
  sun: { ring: "ring-sun/40", bar: "bg-sun", hover: "hover:bg-sun/[.04] hover:border-l-sun", age: "bg-sun/10 text-sun" },
  pop: { ring: "ring-pop/50", bar: "bg-pop", hover: "hover:bg-pop/[.05] hover:border-l-pop", age: "bg-pop/15 text-[#b98aff]" },
};

/** dense terminal row for a coin with live market cap flash */
export default function CoinCard({ c, tone = "teal" }: { c: TCoin; tone?: Tone }) {
  const mc = useMc();
  const t = TONE[tone];
  const prev = useRef(c.mc_sol);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (prev.current != null && c.mc_sol != null && c.mc_sol !== prev.current) {
      setFlash(c.mc_sol > prev.current ? "tick-up" : "tick-dn");
      const tm = setTimeout(() => setFlash(""), 1000);
      prev.current = c.mc_sol;
      return () => clearTimeout(tm);
    }
    prev.current = c.mc_sol;
  }, [c.mc_sol]);
  const p = Math.round((c.progress ?? 0) * 100);
  const fromAth = c.ath_mc_sol && c.mc_sol ? c.mc_sol / c.ath_mc_sol - 1 : null;
  // market cap colour: bigger caps glow warmer
  const usdMc = mc.usd && c.mc_sol ? c.mc_sol * mc.usd : 0;
  const mcTone = usdMc >= 100_000 ? "text-sun" : usdMc >= 30_000 ? "text-mint" : "text-white";

  return (
    // the whole row opens the coin through a link laid underneath, so the buttons on top can be real links of their own
    <div className={"group relative grid grid-cols-[auto_1fr_auto] gap-3 border-b border-l-2 border-b-line/70 border-l-transparent px-3 py-2.5 transition-colors " + t.hover}>
      <Link href={`/coin/${c.mint}`} className="absolute inset-0 z-0" aria-label={`Open ${c.symbol ?? "coin"}`} />
      <div className="pointer-events-none relative">
        <div className={"overflow-hidden rounded-lg ring-1 " + t.ring}>
          <CoinImg src={c.image} symbol={c.symbol} mint={c.mint} size={54} />
        </div>
        {!c.complete && (
          <span className="absolute -bottom-1.5 left-0 right-0 mx-auto h-1 w-[54px] overflow-hidden rounded-full bg-line">
            <span className={"block h-full " + (p >= 85 ? "bg-sun" : "sol-bar")} style={{ width: `${p}%` }} />
          </span>
        )}
      </div>
      <div className="pointer-events-none relative min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15px] font-bold">{c.symbol}</p>
          <p className="truncate text-xs text-mute">{c.name}</p>
          <span className="pointer-events-auto relative z-10"><Star mint={c.mint} size={13} /></span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          <span className={"num rounded px-1.5 py-px font-semibold " + t.age}>{ago(c.created_at)}</span>
          <CoinSocials twitter={c.twitter} telegram={c.telegram} website={c.website} />
          <CopyCa mint={c.mint} />
          {!c.complete && <span className={"num font-semibold " + (p >= 85 ? "text-sun" : "text-[#b98aff]")} title="Bonding curve">{p}%</span>}
          {fromAth != null && fromAth < -0.05 && <span className="num rounded bg-bleed/10 px-1.5 py-px text-bleed" title="From all time high">{Math.round(fromAth * 100)}% ath</span>}
        </div>
      </div>
      <div className="pointer-events-none relative flex flex-col items-end justify-between gap-1">
        <span className="text-[10px] uppercase tracking-wide text-mute">mc</span>
        <span className={"num -mt-1 text-sm font-bold " + mcTone + " " + flash}>{mc.fmt(c.mc_sol)}</span>
        <QuickBuyButton mint={c.mint} symbol={c.symbol} className="pointer-events-auto relative z-10 opacity-90 group-hover:opacity-100" />
      </div>
    </div>
  );
}