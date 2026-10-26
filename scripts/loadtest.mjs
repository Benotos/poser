// Fake traffic. Usage: node scripts/loadtest.mjs https://your-site.vercel.app 300 60
// args: base url, concurrent fake visitors, seconds. Each visitor polls the same cached routes a real browser does.
const [base = "http://localhost:3000", users = "200", secs = "60"] = process.argv.slice(2);
const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const snap = () => new Date(Math.floor((Date.now() - 30 * 60_000) / 10000) * 10000).toISOString();
const routes = () => [
  "/api/q?p=" + enc({ t: "coins", s: "mint,name,symbol,image,created_at,mc_sol,progress,complete", f: [["not", "name", ["is", null]]], o: [], l: 50 }),
  "/api/q?p=" + enc({ t: "coins", s: "*", f: [["not", "name", ["is", null]], ["eq", "complete", false], ["gte", "created_at", snap()]], o: [["created_at", false]], l: 60 }),
  "/api/q?p=" + enc({ t: "trade_feed", s: "*", f: [], o: [["created_at", false]], l: 30 }),
  "/api/q?p=" + enc({ t: "leaderboard", s: "*", f: [["eq", "day", new Date().toISOString().slice(0, 10)]], o: [["equity_sol", false]], l: 100 }),
  "/api/q?p=" + enc({ t: "daily_stats", s: "*", f: [["eq", "day", new Date().toISOString().slice(0, 10)]], o: [], m: "maybe" }),
  "/",
  "/terminal",
];
let ok = 0, fail = 0, slow = 0, hits = 0; const lat = [];
const end = Date.now() + Number(secs) * 1000;
async function visitor() {
  while (Date.now() < end) {
    for (const r of routes()) {
      const t = Date.now();
      try {
        const res = await fetch(base + r);
        await res.arrayBuffer();
        const ms = Date.now() - t; lat.push(ms);
        if (res.status < 500) ok++; else fail++;
        if (ms > 2000) slow++;
        if ((res.headers.get("x-vercel-cache") || "").match(/HIT|STALE/)) hits++;
      } catch { fail++; }
    }
    await new Promise((r) => setTimeout(r, 2000 + Math.random() * 3000));
  }
}
console.log(`load test: ${users} visitors for ${secs}s on ${base}`);
await Promise.all(Array.from({ length: Number(users) }, visitor));
lat.sort((a, b) => a - b);
const p = (q) => lat[Math.floor(lat.length * q)] ?? 0;
console.log({ requests: ok + fail, ok, fail, slowOver2s: slow, cacheHits: hits, p50: p(0.5), p95: p(0.95), p99: p(0.99) });
console.log(fail === 0 && p(0.95) < 1500 ? "PASS" : "CHECK: failures or slow responses");
