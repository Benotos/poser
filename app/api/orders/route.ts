import { db } from "@/lib/admin";
import { ensureCoin } from "@/lib/engine";
import { authed, fail, isMint, ok } from "@/lib/http";
import { leagueDay, MAX_NOTE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await authed();
  if (!s) return ok({ orders: [] });
  const mint = new URL(req.url).searchParams.get("mint");
  let q = db().from("orders").select("*, coins(symbol,image)").eq("profile_id", s.pid).eq("day", leagueDay())
    .order("created_at", { ascending: false }).limit(50);
  if (mint) q = q.eq("mint", mint);
  const { data } = await q;
  return ok({ orders: data ?? [] });
}

export async function POST(req: Request) {
  const s = await authed();
  if (!s) return fail("sign_in", 401);
  const b = await req.json().catch(() => ({}));
  if (!isMint(b.mint)) return fail("bad_mint");
  const side = b.side === "sell" ? "sell" : "buy";
  const trigger = b.trigger === "mc_above" ? "mc_above" : "mc_below";
  const mc = Number(b.trigger_mc);
  if (!(mc > 0 && mc < 1e7)) return fail("bad_trigger");
  const sol = side === "buy" ? Number(b.sol) : null;
  const pct = side === "sell" ? Math.min(1, Math.max(0.01, Number(b.pct ?? 1))) : null;
  if (side === "buy" && !(sol! >= 0.001 && sol! <= 1_000_000)) return fail("bad_amount");
  const { count } = await db().from("orders").select("id", { count: "exact", head: true })
    .eq("profile_id", s.pid).eq("status", "open");
  if ((count ?? 0) >= 20) return fail("too_many_orders");
  await ensureCoin(b.mint);
  const { data, error } = await db().from("orders").insert({
    profile_id: s.pid, day: leagueDay(), mint: b.mint, side, trigger, trigger_mc: mc, sol, pct,
    note: String(b.note ?? "").slice(0, MAX_NOTE) || null,
  }).select("*").single();
  return error ? fail(error.message) : ok({ order: data });
}

export async function DELETE(req: Request) {
  const s = await authed();
  if (!s) return fail("sign_in", 401);
  const id = Number(new URL(req.url).searchParams.get("id"));
  await db().from("orders").update({ status: "cancelled" }).eq("id", id).eq("profile_id", s.pid).eq("status", "open");
  return ok({ ok: true });
}