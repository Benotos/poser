import { createClient } from "@supabase/supabase-js";

// Cached read proxy. The browser never talks to Supabase; it asks this route, and Vercel's CDN
// answers repeat requests (s-maxage) so the database only sees one query per distinct request per window.
export const dynamic = "force-dynamic";

const TTL: Record<string, number> = {
  coins: 3, coin_trades: 5, coin_ticks: 10, coin_candles: 10, trade_feed: 4, trades: 5, positions: 5,
  leaderboard: 8, daily_stats: 15, equity_snapshots: 15, profile_stats: 20, profiles: 20, league_results: 60, league_entries: 8,
};
const SWR = 30;

type Spec = { t: string; s?: string; c?: "exact"; h?: 1; f?: [string, string, any][]; o?: [string, boolean][]; l?: number; m?: "maybe" | "single" };

let db: ReturnType<typeof createClient> | null = null;
function client() {
  if (!db) {
    db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { fetch: (u, i) => fetch(u as any, { ...(i as any), signal: AbortSignal.timeout(6000) }) },
    });
  }
  return db;
}

// per instance safety nets: identical in flight queries share one DB call, and the last good answer is served if the DB fails
const inflight = new Map<string, Promise<any>>();
const lastGood = new Map<string, { at: number; body: any }>();

async function query(spec: Spec) {
  let q: any = client().from(spec.t).select(spec.s ?? "*", spec.c ? { count: "exact", head: !!spec.h } : undefined);
  for (const [op, col, val] of spec.f ?? []) {
    if (op === "not") q = q.not(col, val[0], val[1]);
    else if (["eq", "neq", "gt", "gte", "lt", "lte", "in"].includes(op)) q = q[op](col, val);
  }
  for (const [col, asc] of spec.o ?? []) q = q.order(col, { ascending: asc });
  if (spec.l) q = q.limit(Math.min(spec.l, 3000));
  if (spec.m === "maybe") q = q.maybeSingle();
  else if (spec.m === "single") q = q.single();
  const { data, error, count } = await q;
  return { data: data ?? null, error: error ? { message: error.message } : null, count: count ?? null };
}

async function handle(spec: Spec) {
  if (!spec || typeof spec.t !== "string" || !(spec.t in TTL)) return Response.json({ data: null, error: { message: "bad_table" } }, { status: 400 });
  const key = JSON.stringify(spec);
  let job = inflight.get(key);
  if (!job) {
    job = query(spec).finally(() => setTimeout(() => inflight.delete(key), 500));
    inflight.set(key, job);
  }
  const ttl = TTL[spec.t];
  try {
    const out = await job;
    if (out.error) throw new Error(out.error.message);
    lastGood.set(key, { at: Date.now(), body: out });
    if (lastGood.size > 500) lastGood.delete(lastGood.keys().next().value as string);
    return Response.json(out, { headers: { "cache-control": `public, s-maxage=${ttl}, stale-while-revalidate=${SWR}` } });
  } catch (e: any) {
    const hit = lastGood.get(key);
    // db down: serve stale data (briefly cached) so the site keeps rendering instead of erroring
    if (hit && Date.now() - hit.at < 5 * 60_000) return Response.json(hit.body, { headers: { "cache-control": "public, s-maxage=2" } });
    return Response.json({ data: null, error: { message: e?.message ?? "db" } }, { status: 200, headers: { "cache-control": "public, s-maxage=1" } });
  }
}

function b64urlDecode(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("p");
  if (!p || p.length > 8000) return Response.json({ data: null, error: { message: "bad_request" } }, { status: 400 });
  try { return await handle(JSON.parse(b64urlDecode(p))); } catch { return Response.json({ data: null, error: { message: "bad_request" } }, { status: 400 }); }
}

// long queries (big IN lists) fall back to POST, uncached by the CDN but still deduped here
export async function POST(req: Request) {
  try { return await handle(await req.json()); } catch { return Response.json({ data: null, error: { message: "bad_request" } }, { status: 400 }); }
}