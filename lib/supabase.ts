// Browser data layer. Same API shape as supabase-js for reads (from/select/eq/...), but every
// query goes through /api/q so Vercel's CDN can cache it. Visitors never hit the database
// directly, so 10,000 people cost the DB roughly one query per route every few seconds.
// Realtime is intentionally a no-op; components poll the cached routes instead.

type Filter = [string, string, any];
type Spec = {
  t: string; s: string; c?: "exact"; h?: 1;
  f: Filter[]; o: [string, boolean][]; l?: number; m?: "maybe" | "single";
};
type Result = { data: any; error: any; count: number | null };

// timestamps like "now minus 15 minutes" change every ms and would make every URL unique.
// Snap ISO strings to 10s so identical queries share one cache entry.
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
function snap(v: any): any {
  if (typeof v === "string" && ISO.test(v)) { const ms = Date.parse(v); if (!isNaN(ms)) return new Date(Math.floor(ms / 10000) * 10000).toISOString(); }
  if (Array.isArray(v)) return v.map(snap);
  return v;
}

function b64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const inflight = new Map<string, Promise<Result>>();

async function run(spec: Spec): Promise<Result> {
  const p = b64(JSON.stringify(spec));
  const key = p;
  const hit = inflight.get(key);
  if (hit) return hit; // same query already running in this tab
  const job = (async (): Promise<Result> => {
    try {
      const r = p.length < 6000
        ? await fetch("/api/q?p=" + p)
        : await fetch("/api/q", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(spec) });
      const j = await r.json();
      return { data: j.data ?? null, error: j.error ?? null, count: j.count ?? null };
    } catch (e: any) {
      return { data: null, error: { message: e?.message ?? "network" }, count: null };
    }
  })();
  inflight.set(key, job);
  job.finally(() => setTimeout(() => inflight.delete(key), 300));
  return job;
}

class Q implements PromiseLike<Result> {
  private spec: Spec;

  constructor(table: string) { this.spec = { t: table, s: "*", f: [], o: [] }; }
  select(cols = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.spec.s = cols;
    if (opts?.count) this.spec.c = opts.count;
    if (opts?.head) this.spec.h = 1;
    return this;
  }
  private add(op: string, col: string, val: any) { this.spec.f.push([op, col, snap(val)]); return this; }
  eq(c: string, v: any) { return this.add("eq", c, v); }
  neq(c: string, v: any) { return this.add("neq", c, v); }
  gt(c: string, v: any) { return this.add("gt", c, v); }
  gte(c: string, v: any) { return this.add("gte", c, v); }
  lt(c: string, v: any) { return this.add("lt", c, v); }
  lte(c: string, v: any) { return this.add("lte", c, v); }
  in(c: string, v: any[]) { return this.add("in", c, v); }
  not(c: string, op: string, v: any) { this.spec.f.push(["not", c, [op, snap(v)]]); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.spec.o.push([col, opts?.ascending !== false]); return this; }
  limit(n: number) { this.spec.l = n; return this; }
  maybeSingle() { this.spec.m = "maybe"; return this; }
  single() { this.spec.m = "single"; return this; }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return run(this.spec).then(ok, bad);
  }
}

// realtime stub so existing channel code keeps compiling and simply does nothing
const chan: any = { on(..._a: any[]) { return chan; }, subscribe(..._a: any[]) { return chan; }, unsubscribe() { return chan; } };

const client = {
  from: (table: string) => new Q(table),
  channel: (_name?: string) => chan,
  removeChannel: (_c?: any) => {},
};

/** public read client; reads are cached at the edge, realtime is off */
export function sb() { return client; }