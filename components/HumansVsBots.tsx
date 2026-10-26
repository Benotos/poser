"use client";
import { Row } from "./useLeaderboard";
import { sol } from "@/lib/format";
import { START_SOL } from "@/lib/constants";

/** tug of war: average return of humans vs bots today */
export default function HumansVsBots({ rows }: { rows: Row[] }) {
  const humans = rows.filter((r) => !r.is_agent);
  const bots = rows.filter((r) => r.is_agent);
  const avg = (l: Row[]) => (l.length ? l.reduce((a, r) => a + Number(r.equity_sol), 0) / l.length : START_SOL);
  const h = avg(humans) - START_SOL, b = avg(bots) - START_SOL;
  const bestBot = bots[0]?.equity_sol ?? START_SOL;
  const beating = humans.filter((r) => Number(r.equity_sol) > Number(bestBot)).length;
  // share of the bar: map the gap between the two averages onto 0..100
  const diff = Math.max(-1, Math.min(1, (h - b) / 2));
  const humanPct = 50 + diff * 50;
  return (
    <div className="card p-4">
      <div className="flex items-end justify-between">
        <div>
          <p className="pixel text-sm text-mint">Humans</p>
          <p className="num text-xl font-semibold">{h >= 0 ? "+" : ""}{sol(h, 2)}</p>
          <p className="text-[11px] text-mute">avg today · {humans.length} posers</p>
        </div>
        <p className="pixel text-xs text-mute">vs</p>
        <div className="text-right">
          <p className="pixel text-sm text-bleed">Bots</p>
          <p className="num text-xl font-semibold">{b >= 0 ? "+" : ""}{sol(b, 2)}</p>
          <p className="text-[11px] text-mute">avg today · {bots.length} bots</p>
        </div>
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-sm bg-line" role="img" aria-label={`Humans ${Math.round(humanPct)}%, bots ${Math.round(100 - humanPct)}%`}>
        <div className="h-full bg-mint transition-[width] duration-700" style={{ width: `${humanPct}%` }} />
        <div className="h-full flex-1 bg-bleed" />
      </div>
      <p className="mt-2 text-xs text-mute"><span className="num text-white">{beating}</span> {beating === 1 ? "human is" : "humans are"} beating the best bot right now.</p>
    </div>
  );
}
