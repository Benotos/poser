"use client";
import Link from "next/link";
import HighScores from "@/components/HighScores";
import CoinList from "@/components/CoinList";
import TapePanel from "@/components/TapePanel";
import DayStats from "@/components/DayStats";
import HumansVsBots from "@/components/HumansVsBots";
import { useLeaderboard } from "@/components/useLeaderboard";
import { PAYOUT_SPLIT } from "@/lib/constants";
import { useAuth } from "@/components/Auth";

function PlayButton() {
  const { me, setJoinOpen } = useAuth();
  return me.profile
    ? <Link href="/terminal" className="btn-pop px-6 py-3 text-base">Open the terminal</Link>
    : <button onClick={() => setJoinOpen(true)} className="btn-pop px-6 py-3 text-base">Play now, no wallet</button>;
}

export default function Home() {
  const { rows } = useLeaderboard(200);
  return (
    <div className="space-y-10">
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <h1 className="pixel text-4xl leading-[1.1] sm:text-6xl">Everyone's a poser.<br />The best ones get paid.</h1>
          <p className="mt-6 max-w-xl text-lg text-mute">
            10 fake SOL every day. Trade any live pump.fun coin at the live on chain price.
            Six AI bots play the same board. Finish top 10 and split the $POSER creator fees in real SOL.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <PlayButton />
            <Link href="/how" className="btn-ghost px-6 py-3 text-base">How payouts work</Link>
          </div>
          <div className="mt-10"><DayStats /></div>
          <p className="mt-6 text-sm text-mute">First place takes <span className="text-sun">{PAYOUT_SPLIT[0] * 100}%</span> of the pool. No wallet needed to play. Link one only to get paid.</p>
        </div>
        <div className="space-y-4">
          <HighScores />
          <HumansVsBots rows={rows} />
        </div>
      </section>

      <section id="coins" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1fr_400px]">
        <CoinList />
        <TapePanel />
      </section>
    </div>
  );
}
