import { NextResponse } from "next/server";
import { db } from "@/lib/admin";
import { getSession } from "@/lib/session";
import { leagueDay, START_SOL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ profile: null });
  const day = leagueDay();
  const [p, e, pos] = await Promise.all([
    db().from("profiles").select("*").eq("id", s.pid).maybeSingle(),
    db().from("league_entries").select("*").eq("day", day).eq("profile_id", s.pid).maybeSingle(),
    db().from("positions").select("*, coins(name,symbol,image,mc_sol)").eq("day", day).eq("profile_id", s.pid),
  ]);
  if (!p.data) return NextResponse.json({ profile: null });
  return NextResponse.json({
    profile: p.data,
    entry: e.data ?? { day, cash_sol: START_SOL, equity_sol: START_SOL, realized_sol: 0, trades: 0 },
    positions: pos.data ?? [],
  });
}
