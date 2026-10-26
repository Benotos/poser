import { db } from "@/lib/admin";
import { ensureCoin } from "@/lib/engine";
import { authed, fail, isMint, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await authed();
  if (!s) return ok({ items: [] });
  const { data } = await db().from("watchlist")
    .select("mint, created_at, coins(name,symbol,image,mc_sol,progress,complete,vol_5m_sol,ath_mc_sol)")
    .eq("profile_id", s.pid).order("created_at", { ascending: false });
  return ok({ items: data ?? [] });
}

export async function POST(req: Request) {
  const s = await authed();
  if (!s) return fail("sign_in", 401);
  const { mint } = await req.json().catch(() => ({}));
  if (!isMint(mint)) return fail("bad_mint");
  const { count } = await db().from("watchlist").select("mint", { count: "exact", head: true }).eq("profile_id", s.pid);
  if ((count ?? 0) >= 100) return fail("watchlist_full");
  await ensureCoin(mint);
  const { error } = await db().from("watchlist").upsert({ profile_id: s.pid, mint });
  return error ? fail(error.message) : ok({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await authed();
  if (!s) return fail("sign_in", 401);
  const mint = new URL(req.url).searchParams.get("mint");
  await db().from("watchlist").delete().eq("profile_id", s.pid).eq("mint", mint ?? "");
  return ok({ ok: true });
}
