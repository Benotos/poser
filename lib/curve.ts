import { FEE_RATE, INITIAL_REAL_TOKENS, TOKEN_DECIMALS, TOTAL_SUPPLY } from "./constants";

export type CurveState = {
  vSol: number; // virtual quote reserves in quote UI units (SOL for SOL coins)
  vTokens: number; // tokens (UI units)
  realTokens: number;
  complete: boolean;
  supply: number; // tokens
  quoteMint: string | null; // null = SOL. pump.fun coins can be quoted in other tokens
  vQuoteRaw: number; // raw virtual quote reserves, for non SOL quotes
};

const ZERO_KEY = "11111111111111111111111111111111";
const WSOL = "So11111111111111111111111111111111111111112";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(bytes: Uint8Array) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = "1" + out; }
  return out || "1";
}

/**
 * decode pump.fun BondingCurve account data
 * layout: disc(8) vTokens(8) vQuote(8) realTokens(8) realQuote(8) supply(8) complete(1)
 *         creator(32) is_mayhem(1) is_cashback(1) quote_mint(32) ...
 */
export function decodeCurve(data: Uint8Array): CurveState {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const u64 = (o: number) => Number(dv.getBigUint64(o, true));
  const vTokensRaw = u64(8);
  const vQuoteRaw = u64(16);
  const realTokensRaw = u64(24);
  const supplyRaw = u64(40);
  const complete = data[48] === 1;
  let quoteMint: string | null = null;
  if (data.length >= 115) {
    const q = b58(data.subarray(83, 115));
    if (q !== ZERO_KEY && q !== WSOL) quoteMint = q;
  }
  return {
    vTokens: vTokensRaw / 10 ** TOKEN_DECIMALS,
    vSol: vQuoteRaw / 1e9,
    realTokens: realTokensRaw / 10 ** TOKEN_DECIMALS,
    complete,
    supply: supplyRaw > 0 ? supplyRaw / 10 ** TOKEN_DECIMALS : TOTAL_SUPPLY,
    quoteMint,
    vQuoteRaw,
  };
}

export const spotPrice = (c: { vSol: number; vTokens: number }) => c.vSol / c.vTokens; // SOL per token
export const mcSol = (c: { vSol: number; vTokens: number }) => spotPrice(c) * TOTAL_SUPPLY;
export const progress = (realTokens: number) =>
  Math.min(1, Math.max(0, 1 - realTokens / INITIAL_REAL_TOKENS));

/** buy: spend `solIn` (fee included) → tokens out, constant product on virtual reserves */
export function quoteBuy(c: CurveState, solIn: number) {
  const fee = solIn * FEE_RATE;
  const net = solIn - fee;
  const k = c.vSol * c.vTokens;
  let tokensOut = c.vTokens - k / (c.vSol + net);
  if (!c.complete) tokensOut = Math.min(tokensOut, c.realTokens); // cannot buy past the curve
  const after = { vSol: c.vSol + net, vTokens: c.vTokens - tokensOut };
  return { tokensOut, fee, avgPrice: solIn / tokensOut, mcAfter: mcSol(after) };
}

/** sell: `tokensIn` → SOL out after fee */
export function quoteSell(c: CurveState, tokensIn: number) {
  const k = c.vSol * c.vTokens;
  const gross = c.vSol - k / (c.vTokens + tokensIn);
  const fee = gross * FEE_RATE;
  const solOut = gross - fee;
  const after = { vSol: c.vSol - gross, vTokens: c.vTokens + tokensIn };
  return { solOut, fee, avgPrice: solOut / tokensIn, mcAfter: mcSol(after) };
}

/** paper fills: live spot price, 1% fee, no price impact (fake SOL never moves the real chart) */
export function fillBuy(price: number, solIn: number) {
  const fee = solIn * FEE_RATE;
  const tokensOut = (solIn - fee) / price;
  return { tokensOut, fee, avgPrice: solIn / tokensOut };
}
export function fillSell(price: number, tokensIn: number) {
  const gross = tokensIn * price;
  const fee = gross * FEE_RATE;
  return { solOut: gross - fee, fee, avgPrice: (gross - fee) / tokensIn };
}