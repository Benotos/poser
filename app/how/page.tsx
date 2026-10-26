import { FEE_RATE, MIN_TRADES_FOR_PAYOUT, PAYOUT_SPLIT, START_SOL } from "@/lib/constants";

const STEPS = [
  ["Pick a name", "Hit Play now and choose a leaderboard name. No wallet needed to play."],
  [`Get ${START_SOL} fake SOL`, `Every day at 00:00 UTC everyone restarts with ${START_SOL} fake SOL and no positions. Fresh league, same odds.`],
  ["Trade any pump.fun coin", `Buy and sell any live pump.fun coin at the live on chain price. Your trades are fake SOL, so they never move the real chart. Every trade pays a ${FEE_RATE * 100}% fee, same as the real thing. Set take profit and stop loss if you want.`],
  ["Climb the board", "Your balance is cash plus the live value of what you hold. The leaderboard updates on every trade and every few seconds as prices move."],
  ["Beat the bots", "Six AI traders play the same league. They can top the board, but payout slots only go to humans."],
  ["Top 10 get paid", `At reset the top 10 humans with at least ${MIN_TRADES_FOR_PAYOUT} trades and a linked wallet split that day's $POSER creator fees in real SOL, sent to that wallet.`],
];

export default function How() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="pixel text-3xl">How it works</h1>
      <ol className="mt-8 space-y-6">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="grid grid-cols-[2.5rem_1fr] gap-3">
            <span className="pixel text-2xl text-pop">{i + 1}</span>
            <div><h2 className="text-lg font-semibold">{t}</h2><p className="mt-1 text-mute">{d}</p></div>
          </li>
        ))}
      </ol>
      <section className="card mt-10 p-5">
        <h2 className="font-semibold">Payout split</h2>
        <table className="num mt-3 w-full text-sm">
          <tbody>
            {PAYOUT_SPLIT.map((s, i) => (
              <tr key={i} className="border-t border-line"><td className="py-1.5 text-mute">Rank {i + 1}</td><td className="text-right">{Math.round(s * 100)}% of the day's fees</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card mt-10 p-5">
        <h2 className="font-semibold">Pro tools</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div><dt className="text-white">Terminal</dt><dd className="text-mute">New pairs, final stretch and migrated coins side by side, live. ⚡ buys instantly at your quick buy size.</dd></div>
          <div><dt className="text-white">Limit orders</dt><dd className="text-mute">Buy the dip or take profit at a market cap you pick. Orders fill automatically and expire at reset.</dd></div>
          <div><dt className="text-white">Hotkeys</dt><dd className="text-mute"><span className="kbd">B</span> quick buy, <span className="kbd">S</span> sell all, <span className="kbd">1</span> to <span className="kbd">4</span> presets, <span className="kbd">L</span> limit tab. Works on any coin page.</dd></div>
          <div><dt className="text-white">Copy alerts</dt><dd className="text-mute">Follow any poser or bot. When they buy, you get an alert with a one click copy.</dd></div>
          <div><dt className="text-white">Levels and badges</dt><dd className="text-mute">Earn XP for trading, winning trades, playing days and finishing top 10. Unlock titles from Poser to Legend.</dd></div>
        </dl>
      </section>
      <section className="card mt-10 border-mint/30 p-5">
        <h2 className="font-semibold">Your wallet is safe</h2>
        <ul className="mt-3 space-y-2 text-sm text-mute">
          <li>You can play without connecting anything. A wallet is only needed to receive payouts.</li>
          <li>Linking a wallet is a free message signature that proves you own it. A signature can't send, swap or approve anything.</li>
          <li>POSER never asks you to approve a transaction. If any popup ever asks you to approve a transaction or token spend on this site, reject it.</li>
          <li>Payouts are sent to you. You never send anything to us.</li>
        </ul>
      </section>
      <section className="mt-10 space-y-4 text-sm text-mute">
        <h2 className="text-base font-semibold text-white">Fair play</h2>
        <p>Prices come straight from the chain when you trade, so there's no front running the feed. One account per wallet. Accounts farming the payout with multiple wallets get removed and lose their slot.</p>
        <p>POSER is a game. You never trade real funds here and nothing on this site is financial advice.</p>
      </section>
    </div>
  );
}
