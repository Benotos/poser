import { db } from "@/lib/admin";
import { pumpImage, pumpSearch } from "@/lib/pumpapi";
import { storedUrl } from "@/lib/imgstore";

// Coin search for the search menu: a pasted CA goes straight to its page, words search our coins and pump.fun's.
const MINT = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
export type Hit = { mint: string; name: string | null; symbol: string | null; image: string | null; mc_sol: number | null; mc_usd: number | null; complete: boolean; created_at: string | null };

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  const ca = q.match(MINT)?.[0];
  if (ca && ca.length >= 32) return Response.json({ ca, coins: [] });
  if (q.length < 2) return Response.json({ coins: [] });
  const like = `%${q.replace(/[%_,()]/g, "")}%`;
  const [mine, pump] = await Promise.all([
    db().from("coins").select("mint,name,symbol,image,mc_sol,complete,created_at").or(`symbol.ilike.${like},name.ilike.${like}`)
      .order("mc_sol", { ascending: false, nullsFirst: false }).limit(10).then((r) => r.data ?? [], () => []),
    pumpSearch(q).catch(() => []),
  ]);
  const out = new Map<string, Hit>();
  for (const c of pump) out.set(c.mint, {
    mint: c.mint, name: c.name, symbol: c.symbol, image: pumpImage(c.image_uri) ?? null,
    mc_sol: c.market_cap ?? null, mc_usd: c.usd_market_cap ?? null, complete: !!c.complete,
    created_at: c.created_timestamp ? new Date(c.created_timestamp).toISOString() : null,
  });
  for (const c of mine as any[]) if (!out.has(c.mint)) out.set(c.mint, { ...c, mc_usd: null, image: c.image ?? storedUrl(c.mint) });
  // exact ticker matches first, then by size
  const t = q.toLowerCase().replace(/^\$/, "");
  const coins = [...out.values()].sort((a, b) =>
    Number((b.symbol ?? "").toLowerCase() === t) - Number((a.symbol ?? "").toLowerCase() === t) ||
    (b.mc_sol ?? 0) - (a.mc_sol ?? 0)).slice(0, 15);
  return Response.json({ coins }, { headers: { "cache-control": "public, s-maxage=20" } });
}