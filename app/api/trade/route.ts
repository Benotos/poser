import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { executeTrade, TradeError } from "@/lib/engine";

const recent = new Map<string, number>(); // naive per instance rate limit

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  const last = recent.get(s.pid) ?? 0;
  if (Date.now() - last < 800) return NextResponse.json({ error: "slow_down" }, { status: 429 });
  recent.set(s.pid, Date.now());

  const b = await req.json().catch(() => ({}));
  try {
    const r = await executeTrade({
      profileId: s.pid, mint: String(b.mint), side: b.side === "sell" ? "sell" : "buy",
      sol: Number(b.sol), pct: Number(b.pct ?? 1), note: b.note, reason: b.reason === "copy" ? "copy" : b.reason === "quick" ? "quick" : "manual",
      tp: b.tp ? Number(b.tp) : null, sl: b.sl ? Number(b.sl) : null,
    });
    return NextResponse.json(r);
  } catch (e: any) {
    const msg = e instanceof TradeError ? e.message : "trade_failed";
    if (!(e instanceof TradeError)) console.error(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
