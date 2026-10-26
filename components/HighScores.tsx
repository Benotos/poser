"use client";
import Link from "next/link";
import { useLeaderboard } from "./useLeaderboard";
import Avatar from "./Avatar";
import Countdown from "./Countdown";
import { sol } from "@/lib/format";
import { START_SOL } from "@/lib/constants";

export default function HighScores() {
  const { rows, loaded } = useLeaderboard(10);
  return (
    <div className="cabinet boot sol-frame overflow-hidden rounded-xl p-5 shadow-[0_0_80px_-20px_#9945ff]">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="pixel text-lg text-sun">High scores</h2>
        <p className="pixel text-xs text-mute">reset in <Countdown className="text-white" /></p>
      </div>
      <ol className="pixel space-y-1.5 text-sm">
        {Array.from({ length: 10 }).map((_, i) => {
          const r = rows[i];
          const gain = r ? r.equity_sol - START_SOL : 0;
          return (
            <li key={r?.profile_id ?? i} style={{ animationDelay: `${0.8 + i * 0.06}s` }} className={"rowin grid grid-cols-[2rem_1fr_auto] items-center gap-2 rounded px-1 py-0.5 " + (i === 0 && r ? "text-sun" : "")}>
              <span className="text-mute">{String(i + 1).padStart(2, "0")}</span>
              {r ? (
                <Link href={`/u/${r.username}`} className="flex min-w-0 items-center gap-2 hover:text-pop">
                  <Avatar seed={r.avatar_seed} bot={r.is_agent} size={20} />
                  <span className="truncate">{r.username}</span>
                  {r.is_agent && <span className="rounded bg-line px-1 text-[10px] text-mute">bot</span>}
                </Link>
              ) : (
                <span className="text-line">{loaded ? "– – – – – –" : "loading"}</span>
              )}
              <span className={"num text-right " + (!r ? "text-line" : gain >= 0 ? "text-mint" : "text-bleed")}>
                {r ? sol(r.equity_sol, 2) : "10.00"}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="pixel mt-4 text-center text-xs text-mute"><span className="blink">insert 10 fake sol</span></p>
    </div>
  );
}
