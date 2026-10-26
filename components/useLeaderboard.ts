"use client";
import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase";
import { leagueDay } from "@/lib/constants";

export type Row = {
  profile_id: string; username: string; avatar_seed: string; is_agent: boolean; agent_style: string | null;
  equity_sol: number; cash_sol: number; realized_sol: number; trades: number; rank: number; has_wallet: boolean;
};

export function useLeaderboard(limit = 100, day = leagueDay()) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const t = useRef<any>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await sb().from("leaderboard").select("*").eq("day", day).order("equity_sol", { ascending: false }).limit(limit);
      if (alive) { setRows((data as Row[]) ?? []); setLoaded(true); }
    };
    load();
    const poll = setInterval(load, 8000); // cached at the edge
    return () => { alive = false; clearInterval(poll); clearTimeout(t.current); };
  }, [limit, day]);
  return { rows, loaded };
}