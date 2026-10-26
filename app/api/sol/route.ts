import { NextResponse } from "next/server";

export const revalidate = 60;

export async function GET() {
  try {
    const r = await fetch("https://api.dexscreener.com/tokens/v1/solana/So11111111111111111111111111111111111111112", { next: { revalidate: 60 } });
    const pairs: any[] = await r.json();
    const usd = pairs
      .filter((p) => p.baseToken?.symbol === "SOL" && /USD/.test(p.quoteToken?.symbol ?? ""))
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    return NextResponse.json({ usd: Number(usd?.priceUsd) || null });
  } catch {
    return NextResponse.json({ usd: null });
  }
}
