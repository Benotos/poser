"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";
import { leagueDay } from "@/lib/constants";
import { compact } from "@/lib/format";

export default function DayStats() {
  const [s, setS] = useState<{ posers: number; trades: number; volume_sol: number } | null>(null);
  useEffect(() => {
    const load = () => sb().from("daily_stats").select("*").eq("day", leagueDay()).maybeSingle().then(({ data }) => setS(data ?? { posers: 0, trades: 0, volume_sol: 0 }));
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  const items: [string, string][] = [
    ["Posers today", s ? compact(s.posers) : "–"],
    ["Trades today", s ? compact(s.trades) : "–"],
    ["Fake SOL traded", s ? compact(Number(s.volume_sol)) : "–"],
  ];
  return (
    <dl className="grid max-w-lg grid-cols-3 gap-4">
      {items.map(([k, v]) => <div key={k}><dt className="text-sm text-mute">{k}</dt><dd className="pixel num mt-1 text-2xl">{v}</dd></div>)}
    </dl>
  );
}
