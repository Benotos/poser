"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import CoinCard, { TCoin } from "@/components/CoinCard";
import { SearchButton } from "@/components/Search";
import WatchStrip from "@/components/WatchStrip";
import { useSettings } from "@/lib/settings";
import { useMc } from "@/components/useMc";

const COLS = [
  { key: "new", title: "New pairs", hint: "Launched in the last 30 minutes", tone: "teal", head: "from-mint/15", dot: "bg-mint" },
  { key: "stretch", title: "Final stretch", hint: "60%+ through the bonding curve", tone: "sun", head: "from-sun/15", dot: "bg-sun" },
  { key: "migrated", title: "Migrated", hint: "Graduated in the last 24h", tone: "pop", head: "from-pop/20", dot: "bg-pop" },
] as const;
type Key = (typeof COLS)[number]["key"];
const FIELDS = "mint,name,symbol,image,created_at,mc_sol,ath_mc_sol,progress,complete,vol_5m_sol,trades_5m,twitter,website,telegram";

export default function Terminal() {
  const [data, setData] = useState<Record<Key, TCoin[]>>({ new: [], stretch: [], migrated: [] });
  const [minMc, setMinMc] = useState("");
  const [socials, setSocials] = useState(false);
  const [paused, setPaused] = useState(false);
  const [s, setS] = useSettings();
  const mc = useMc();

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const load = async () => {
      const [a, b, c] = await Promise.all([
        sb().from("coins").select(FIELDS).not("name", "is", null).eq("complete", false).gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(60),
        // close to graduating and still trading, biggest first (like Axiom). 100% curves that never migrated are left out
        sb().from("coins").select(FIELDS).not("name", "is", null).eq("complete", false).gte("progress", 0.6).lt("progress", 0.999).gt("mc_sol", 0)
          .gte("last_trade_at", new Date(Date.now() - 2 * 3600_000).toISOString()).gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
          .order("mc_sol", { ascending: false }).limit(60),
        // recently graduated only, newest first, like Axiom: coins we caught migrating, not old big caps
        sb().from("coins").select(FIELDS).not("name", "is", null).eq("complete", true).gte("migrated_at", new Date(Date.now() - 24 * 3600_000).toISOString())
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString()).order("migrated_at", { ascending: false }).limit(60),
      ]);
      if (alive) setData({ new: (a.data as any) ?? [], stretch: (b.data as any) ?? [], migrated: (c.data as any) ?? [] });
    };
    load();
    const t = setInterval(load, 2500);
    return () => { alive = false; clearInterval(t); };
  }, [paused]);

  const filt = (list: TCoin[]) => list.filter((c) =>
    (!minMc || (c.mc_sol ?? 0) >= mc.fromUnit(Number(minMc))) &&
    (!socials || c.twitter || c.telegram || c.website));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-gradient-to-r from-pop/10 via-panel to-mint/10 px-4 py-3">
        <h1 className="pixel sol-text mr-2 text-2xl">Terminal</h1>
        <SearchButton className="w-full sm:w-80" wide />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 whitespace-nowrap text-mute">Min mc
            <input className="input num py-1 text-sm" style={{ width: 88 }} inputMode="decimal" placeholder={mc.inUsd ? "$" : "SOL"} value={minMc} onChange={(e) => setMinMc(e.target.value.replace(/[^0-9.]/g, ""))} />
          </label>
          <label className={"flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 " + (socials ? "border-mint/60 bg-mint/10 text-mint" : "border-line text-mute hover:text-white")}>
            <input type="checkbox" className="hidden" checked={socials} onChange={(e) => setSocials(e.target.checked)} /> Has socials
          </label>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 whitespace-nowrap text-mute"><span className="text-sun">⚡</span> size
            <input className="input num py-1 text-sm" style={{ width: 64 }} key={s.quickBuy} defaultValue={s.quickBuy}
              onBlur={(e) => { const n = Number(e.target.value); if (n > 0 && n <= 100000) setS({ quickBuy: n }); }} />
          </label>
          <button onClick={() => setPaused(!paused)}
            className={"flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-semibold " + (paused ? "border-sun/60 bg-sun/10 text-sun" : "border-mint/50 bg-mint/10 text-mint")}>
            <span className={"h-2 w-2 rounded-full " + (paused ? "bg-sun" : "animate-pulse bg-mint")} />{paused ? "Paused" : "Live"}
          </button>
        </div>
      </div>

      <WatchStrip />

      <div className="grid gap-4 lg:grid-cols-3">
        {COLS.map((col) => {
          const list = filt(data[col.key]);
          return (
            <section key={col.key} className="card flex min-h-0 flex-col overflow-hidden">
              <header className={"flex items-center justify-between border-b border-line bg-gradient-to-r to-transparent px-3 py-2.5 " + col.head}>
                <h2 className="flex items-center gap-2 font-semibold">
                  <span className={"h-2 w-2 rounded-full " + col.dot} />{col.title}
                  <span className="num rounded bg-white/5 px-1.5 text-xs text-mute">{list.length}</span>
                </h2>
                <span className="text-xs text-mute">{col.hint}</span>
              </header>
              <div className="max-h-[calc(100vh-260px)] min-h-[300px] overflow-y-auto">
                {list.length ? list.map((c) => <CoinCard key={c.mint} c={c} tone={col.tone} />) : <p className="p-8 text-center text-sm text-mute">Nothing matches yet.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}