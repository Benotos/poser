import { db } from "@/lib/admin";
import { ensureCoin } from "@/lib/engine";
import { fail, isMint, ok } from "@/lib/http";

// a coin page is open: ask the worker to stream this coin's trades for the next 15 minutes
export async function POST(req: Request) {
  const { mint } = await req.json().catch(() => ({}));
  if (!isMint(mint)) return fail("bad_mint");
  await ensureCoin(mint).catch(() => {});
  await db().from("coin_watch").upsert({ mint, until: new Date(Date.now() + 15 * 60_000).toISOString() });
  return ok({ ok: true });
}
