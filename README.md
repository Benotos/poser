# POSER

Paper trade every live pump.fun coin with 10 fake SOL a day. Live prices, no price impact, 1% fees. Six AI bots trade the same league. Top 10 humans split the day's $POSER creator fees in real SOL.

## Stack

- Next.js 14 (app router) + TypeScript + Tailwind, deploy on Vercel
- Supabase (Postgres, realtime, public read only RLS, all writes through the server)
- Solana wallet adapter. Sign in = sign one message, no transaction
- Prices read straight from the pump.fun bonding curve account on chain at trade time (DexScreener after migration)
- One worker process: PumpPortal stream, board marking, take profit / stop loss, AI agents, daily settlement

## Setup

1. **Supabase**: new project, open SQL editor, run `supabase/migrations/001_poser.sql`, then `002_v2.sql`, then `003_guests.sql`. This also creates the 6 bots.
2. **Env**: copy `.env.example` to `.env.local` and fill it. Use a paid RPC (Helius etc), public RPC rate limits fast.
3. **Run the site**: `npm install && npm run dev`
4. **Run the worker**: `npm run worker` (keep it running 24/7 on Railway, Fly or a VPS with the same env).
5. **Deploy site**: push to Vercel, add the same env vars except `PAYOUT_WALLET_SECRET`, `PUMPPORTAL_API_KEY`, `ANTHROPIC_API_KEY`.

### Worker keys

- `PUMPPORTAL_API_KEY`: needed for per coin trade streams (charts tab, trending, volume). Launches stream without it, but Trending stays empty. Needs a PumpPortal linked wallet with some SOL; trade messages are metered.
- `ANTHROPIC_API_KEY`: powers DEGEN_GPT. Without it that bot falls back to the momentum strategy.

## v2 features

- **Terminal** (`/terminal`): New pairs, Final stretch, Migrated columns, live every 2.5s, filters, ⚡ quick buy, watchlist strip
- **Own charts**: TradingView lightweight charts built from the worker's 1m candles plus live trades. 15s to 1h, POSER trade markers, your entry line
- **Limit orders**: buy or sell at a market cap, filled by the worker, expire at reset
- **Hotkeys** on coin pages: B quick buy, S sell all, 1 to 4 presets, L limit tab
- **Social**: follow posers and bots, Following feed, copy trade alerts with one click copy
- **Share cards**: `/share/trade/:id` and `/share/day/:username` render PnL images for X
- **Profiles**: XP, levels, titles, 12 badges, win rate, best trade, streaks, equity curve, daily PnL
- **Arcade layer**: sounds (toggle in settings), confetti on wins, level up and top 10 toasts, Humans vs Bots meter, live ticker

## Daily cycle

- League day = UTC date. First trade of the day creates your entry with 10 SOL.
- Worker marks every open position every 12s and fires TP / SL.
- 00:00 to 00:30 UTC: worker does a final mark of yesterday and writes `league_results` (ranks + payout share for the top 10 humans with 5+ trades).
- Pay out manually after claiming creator fees:

```
npm run payout -- 2026-10-14 3.2          # dry run, 3.2 SOL pool
npm run payout -- 2026-10-14 3.2 --send   # sends SOL, saves tx sigs (shown on the leaderboard)
```

## Tuning

`lib/constants.ts`: start balance, fee, payout split, min trades. Bot behaviour: `worker/agents.ts`.

## Art

All character art is placeholder pixel avatars generated from a seed (`lib/avatar.ts`). Swap in the final mascot, pfp and banner when ready. Colors live in `tailwind.config.ts`.
