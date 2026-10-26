export const START_SOL = 10;
export const FEE_RATE = 0.01; // 1% per trade, like pump.fun
export const MIN_TRADES_FOR_PAYOUT = 5;
export const PAYOUT_SPLIT = [0.25, 0.18, 0.13, 0.1, 0.08, 0.07, 0.06, 0.05, 0.04, 0.04]; // top 10
export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const TOKEN_DECIMALS = 6;
export const TOTAL_SUPPLY = 1_000_000_000; // tokens
export const INITIAL_REAL_TOKENS = 793_100_000; // tokens sold on the curve before graduation
export const MAX_NOTE = 140;

export function leagueDay(d = new Date()): string {
  return d.toISOString().slice(0, 10); // UTC yyyy-mm-dd
}
export function msToReset(now = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return next - now;
}
