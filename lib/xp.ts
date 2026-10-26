// XP, levels, titles and badges. XP itself is computed in the profile_stats view.
export const TITLES = [
  [0, "Poser"], [3, "Paper hands"], [6, "Degen"], [10, "Trencher"], [15, "Chad"], [21, "Whale"], [28, "Insider"], [36, "Legend"],
] as const;

export function level(xp: number) {
  const lvl = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
  const cur = 50 * (lvl - 1) ** 2;
  const next = 50 * lvl ** 2;
  const title = [...TITLES].reverse().find(([l]) => lvl >= l)?.[1] ?? "Poser";
  return { lvl, title, progress: (xp - cur) / (next - cur), toNext: next - xp };
}

export type Stats = {
  trades: number; sells: number; wins: number; win_rate: number | null; realized_sol: number; best_pnl: number | null;
  best_pct: number | null; days_played: number; top10: number; first_places: number; best_rank: number | null; earned_sol: number; xp: number;
};

export type Badge = { key: string; name: string; desc: string; got: boolean; tier: "common" | "rare" | "epic" | "legend" };

export function badges(s: Stats, extra: { greenDays: number; botSlayer: number }): Badge[] {
  return [
    { key: "first", name: "First blood", desc: "Make your first trade", got: s.trades >= 1, tier: "common" },
    { key: "win", name: "Paper profit", desc: "Close a trade in profit", got: s.wins >= 1, tier: "common" },
    { key: "2x", name: "Doubled", desc: "Close a trade at +100% or more", got: (s.best_pct ?? 0) >= 1, tier: "rare" },
    { key: "10x", name: "Ten bagger", desc: "Close a trade at +900% or more", got: (s.best_pct ?? 0) >= 9, tier: "legend" },
    { key: "100", name: "Centurion", desc: "100 trades", got: s.trades >= 100, tier: "rare" },
    { key: "1000", name: "Terminally online", desc: "1,000 trades", got: s.trades >= 1000, tier: "epic" },
    { key: "green", name: "Green day", desc: "Finish a day above 10 SOL", got: extra.greenDays >= 1, tier: "common" },
    { key: "streak", name: "Grinder", desc: "Play 7 different days", got: s.days_played >= 7, tier: "rare" },
    { key: "top10", name: "Got paid", desc: "Finish top 10", got: s.top10 >= 1, tier: "epic" },
    { key: "champ", name: "Champion", desc: "Finish first", got: s.first_places >= 1, tier: "legend" },
    { key: "bots", name: "Bot slayer", desc: "Finish above every bot", got: extra.botSlayer >= 1, tier: "epic" },
    { key: "sharp", name: "Sharp", desc: "Win rate 60%+ over 20 closed trades", got: s.sells >= 20 && (s.win_rate ?? 0) >= 0.6, tier: "epic" },
  ];
}

export const TIER_COLOR = { common: "#8e8e9c", rare: "#4da3ff", epic: "#9945ff", legend: "#ffd24d" } as const;
