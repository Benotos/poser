"use client";
// Follows, watchlist, copy trade alerts, own order fills, rank and level up toasts.
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase";
import { useAuth } from "./Auth";
import { useToast } from "./Toasts";
import { avatarUri } from "@/lib/avatar";
import { readSettings } from "@/lib/settings";
import { sfx } from "@/lib/sfx";
import { leagueDay } from "@/lib/constants";
import { level } from "@/lib/xp";
import { sol } from "@/lib/format";

type Ctx = {
  following: Set<string>;
  toggleFollow: (profileId: string) => Promise<void>;
  watch: Set<string>;
  toggleWatch: (mint: string) => Promise<void>;
  copy: (mint: string, amount: number, from?: string) => Promise<void>;
  xp: number;
  rank: number | null;
};

const SocialCtx = createContext<Ctx>(null as any);
export const useSocial = () => useContext(SocialCtx);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [watch, setWatch] = useState<Set<string>>(new Set());
  const [xp, setXp] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const followRef = useRef(following);
  followRef.current = following;
  const pid = me.profile?.id;

  useEffect(() => {
    if (!pid) { setFollowing(new Set()); setWatch(new Set()); return; }
    fetch("/api/follow").then((r) => r.json()).then((j) => setFollowing(new Set(j.following ?? [])));
    fetch("/api/watchlist").then((r) => r.json()).then((j) => setWatch(new Set((j.items ?? []).map((i: any) => i.mint))));
  }, [pid]);

  // xp + rank, with level up and top 10 toasts
  const prev = useRef<{ lvl: number; rank: number | null } | null>(null);
  useEffect(() => {
    if (!pid) return;
    let alive = true;
    const load = async () => {
      const [{ data: st }, { data: lb }] = await Promise.all([
        sb().from("profile_stats").select("xp").eq("profile_id", pid).maybeSingle(),
        sb().from("leaderboard").select("rank").eq("day", leagueDay()).eq("profile_id", pid).maybeSingle(),
      ]);
      if (!alive) return;
      const x = st?.xp ?? 0;
      const r = lb?.rank ?? null;
      const l = level(x).lvl;
      if (prev.current) {
        if (l > prev.current.lvl) { sfx.level(); toast({ tone: "sun", title: `Level ${l}: ${level(x).title}`, body: "You levelled up." }); }
        if (r && r <= 10 && (!prev.current.rank || prev.current.rank > 10)) toast({ tone: "sun", title: `You're #${r}`, body: "Top 10 gets paid at reset. Hold it." });
      }
      prev.current = { lvl: l, rank: r };
      setXp(x); setRank(r);
    };
    load();
    const t = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, [pid, toast]);

  const copy = useCallback(async (mint: string, amount: number, from?: string) => {
    const r = await fetch("/api/trade", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mint, side: "buy", sol: amount, reason: "copy", note: from ? `copying ${from}` : "" }) }).then((r) => r.json());
    if (r.error) return toast({ tone: "bleed", title: "Copy failed", body: r.error.replace(/_/g, " ") });
    sfx.buy();
    toast({ tone: "mint", title: `Copied for ${sol(amount, 2)} SOL`, body: from ? `Following ${from}` : undefined });
    refresh();
  }, [toast, refresh]);

  // live: trades by people you follow, and your own automatic fills
  useEffect(() => {
    if (!pid) return;
    // poll the shared, edge cached feed (same query for every user) and react to rows we haven't seen yet
    let lastId: number | null = null;
    let alive = true;
    const onTrade = (f: any) => {
      {
        const t = f;
        if (t.profile_id === pid && ["tp", "sl", "limit"].includes(t.reason)) {
          const label = t.reason === "tp" ? "Take profit hit" : t.reason === "sl" ? "Stop loss hit" : "Limit order filled";
          const good = t.side === "buy" || Number(t.pnl_sol) >= 0;
          good ? sfx.win() : sfx.loss();
          toast({ tone: good ? "mint" : "bleed", title: label, body: `${t.side} ${sol(Number(t.sol), 3)} SOL${t.pnl_sol != null ? ` (${Number(t.pnl_sol) >= 0 ? "+" : ""}${sol(Number(t.pnl_sol), 3)})` : ""}` });
          refresh();
          return;
        }
        if (!followRef.current.has(t.profile_id) || !readSettings().copyAlerts) return;
        sfx.alert();
        const size = readSettings().copySize;
        toast({
          tone: t.side === "buy" ? "mint" : "bleed",
          img: avatarUri(f.avatar_seed, f.is_agent),
          title: `${f.username} ${t.side === "buy" ? "bought" : "sold"} $${f.symbol ?? t.mint.slice(0, 4)}`,
          body: `${sol(Number(t.sol), 2)} SOL${t.note ? ` · “${t.note}”` : ""}`,
          action: t.side === "buy" ? { label: `Copy ${size}`, run: () => copy(t.mint, size, f.username) } : undefined,
          ttl: 9000,
        });
      }
    };
    const poll = async () => {
      const { data } = await sb().from("trade_feed").select("*").order("created_at", { ascending: false }).limit(40);
      if (!alive || !data?.length) return;
      const rows = (data as any[]).slice().sort((a, b) => a.id - b.id);
      if (lastId != null) rows.filter((r) => r.id > lastId!).forEach(onTrade);
      lastId = Math.max(lastId ?? 0, ...rows.map((r) => r.id));
    };
    poll();
    const iv = setInterval(poll, 6000);
    return () => { alive = false; clearInterval(iv); };
  }, [pid, toast, copy, refresh]);

  const toggleFollow = useCallback(async (id: string) => {
    const on = !followRef.current.has(id);
    setFollowing((s) => { const n = new Set(s); on ? n.add(id) : n.delete(id); return n; });
    const r = await fetch("/api/follow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileId: id, follow: on }) }).then((r) => r.json());
    if (r.error) {
      setFollowing((s) => { const n = new Set(s); on ? n.delete(id) : n.add(id); return n; });
      toast({ tone: "bleed", title: r.error === "sign_in" ? "Sign in to follow posers" : r.error.replace(/_/g, " ") });
    }
  }, [toast]);

  const toggleWatch = useCallback(async (mint: string) => {
    const on = !watch.has(mint);
    setWatch((s) => { const n = new Set(s); on ? n.add(mint) : n.delete(mint); return n; });
    const r = on
      ? await fetch("/api/watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mint }) }).then((r) => r.json())
      : await fetch(`/api/watchlist?mint=${mint}`, { method: "DELETE" }).then((r) => r.json());
    if (r.error) {
      setWatch((s) => { const n = new Set(s); on ? n.delete(mint) : n.add(mint); return n; });
      toast({ tone: "bleed", title: r.error === "sign_in" ? "Sign in to use a watchlist" : r.error.replace(/_/g, " ") });
    }
  }, [watch, toast]);

  return <SocialCtx.Provider value={{ following, toggleFollow, watch, toggleWatch, copy, xp, rank }}>{children}</SocialCtx.Provider>;
}