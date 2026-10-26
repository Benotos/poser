"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import CoinImg from "./CoinImg";
import { ago } from "@/lib/format";
import { useMc } from "./useMc";
import QuickBuyButton from "./QuickBuy";
import Star from "./Star";
import { CoinSocials } from "./XIcon";
import { SearchButton } from "./Search";

type Coin = {
  mint: string; name: string | null; symbol: string | null; image: string | null; created_at: string; twitter?: string | null; telegram?: string | null; website?: string | null;
  mc_sol: number | null; progress: number | null; complete: boolean; vol_5m_sol: number; trades_5m: number; last_trade_at: string | null;
};

const TABS = [
  { key: "new", label: "New" },
  { key: "hot", label: "Trending" },
  { key: "grad", label: "About to graduate" },
  { key: "migrated", label: "Migrated" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function CoinList() {
  const [tab, setTab] = useState<Tab>("hot");
  const [coins, setCoins] = useState<Coin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mcf = useMc();

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    const load = async () => {
      let q = sb().from("coins").select("mint,name,symbol,image,created_at,mc_sol,progress,complete,vol_5m_sol,trades_5m,last_trade_at,twitter,telegram,website").not("name", "is", null).limit(50);
      if (tab === "new") q = q.order("created_at", { ascending: false });
      if (tab === "hot") q = q.gt("vol_5m_sol", 0).order("vol_5m_sol", { ascending: false });
      if (tab === "grad") q = q.eq("complete", false).gt("progress", 0.5).lt("progress", 0.999).gte("last_trade_at", new Date(Date.now() - 2 * 3600_000).toISOString()).order("progress", { ascending: false });
      if (tab === "migrated") q = q.eq("complete", true).gte("migrated_at", new Date(Date.now() - 24 * 3600_000).toISOString())
        .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).order("migrated_at", { ascending: false });
      const { data } = await q;
      if (alive) { setCoins((data as Coin[]) ?? []); setLoaded(true); }
    };
    load();
    const t = setInterval(load, tab === "new" ? 3000 : 5000);
    return () => { alive = false; clearInterval(t); };
  }, [tab]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="flex flex-wrap gap-1" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={"rounded-md px-3 py-1.5 text-sm " + (tab === t.key ? "bg-pop text-white font-semibold" : "text-mute hover:text-white")}>
              {t.label}
            </button>
          ))}
        </div>
        <SearchButton className="ml-auto w-full sm:w-80" wide />
      </div>
      {!loaded ? (
        <p className="p-8 text-center text-sm text-mute">Loading coins</p>
      ) : !coins.length ? (
        <p className="p-8 text-center text-sm text-mute">Nothing here yet. The feed fills as coins launch on pump.fun.</p>
      ) : (
        <ul className="divide-y divide-line">
          {coins.map((c) => (
            <li key={c.mint}>
              <div className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 hover:bg-ink/60">
                <Link href={`/coin/${c.mint}`} className="absolute inset-0 z-0" aria-label={`Open ${c.symbol ?? "coin"}`} />
                <span className="pointer-events-none relative"><CoinImg src={c.image} symbol={c.symbol} mint={c.mint} size={40} /></span>
                <div className="pointer-events-none relative min-w-0">
                  <p className="flex items-center gap-1.5 truncate font-semibold">{c.name} <span className="font-normal text-mute">${c.symbol}</span>
                    <span className="pointer-events-auto relative z-10"><Star mint={c.mint} size={13} /></span>
                    <CoinSocials twitter={c.twitter} telegram={c.telegram} website={c.website} />
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-mute">
                    <span>{ago(c.created_at)}</span>
                    {!c.complete && (
                      <span className="flex items-center gap-1.5" title="Bonding curve progress">
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
                          <span className="block h-full sol-bar" style={{ width: `${Math.round((c.progress ?? 0) * 100)}%` }} />
                        </span>
                        <span className="num">{Math.round((c.progress ?? 0) * 100)}%</span>
                      </span>
                    )}
                    {c.complete && <span className="text-sun">graduated</span>}
                  </div>
                </div>
                <div className="pointer-events-none relative flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-mute">mc</p>
                    <p className="num font-semibold">{mcf.fmt(c.mc_sol)}</p>
                  </div>
                  <QuickBuyButton mint={c.mint} symbol={c.symbol} className="pointer-events-auto relative z-10" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}