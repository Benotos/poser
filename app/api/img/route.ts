import { fetchMeta } from "@/lib/meta";
import { db } from "@/lib/admin";
import { fetchImage, isStored, saveRawImage, storeBuffer, storedUrl } from "@/lib/imgstore";

// Picture for a coin that isn't in our storage yet: find it, send it, and store it so next time it's instant.
// Add &debug=1 to see each step as JSON.
export const runtime = "nodejs";
export const maxDuration = 10;
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: Request) {
  const t0 = Date.now();
  const q = new URL(req.url).searchParams;
  const mint = q.get("mint") ?? "";
  const debug = q.get("debug") === "1";
  const log: string[] = [];
  const step = (m: string) => log.push(`${Date.now() - t0}ms ${m}`);
  const done = (r: Response) => (debug ? Response.json({ log }) : r);
  let u = q.get("u") ?? "";
  if (!MINT.test(mint)) return new Response(null, { status: 400 });
  if (isStored(u)) return done(Response.redirect(u, 302));

  // check storage and our coins row at the same time
  const ctrl = new AbortController();
  const ht = setTimeout(() => ctrl.abort(), 1500);
  const [head, rowRes] = await Promise.all([
    fetch(storedUrl(mint), { method: "HEAD", signal: ctrl.signal }).catch(() => null),
    db().from("coins").select("image,uri").eq("mint", mint).maybeSingle().then((r) => r, () => ({ data: null })),
  ]);
  clearTimeout(ht);
  const row: any = rowRes?.data;
  step(`stored? ${head?.status ?? "no answer"}`);
  if (head?.ok) return done(new Response(null, { status: 302, headers: { location: storedUrl(mint), "cache-control": "public, s-maxage=86400" } }));

  // what the worker already saved: a picture link, or at least the metadata uri (skips the RPC)
  let uri: string | undefined;
  if (!/^https?:\/\/|^ipfs:\/\//.test(u)) {
    if (row?.image && isStored(row.image)) return done(Response.redirect(row.image, 302));
    if (row?.image) u = row.image;
    uri = row?.uri || undefined;
    step(`db: image ${row?.image ? "yes" : "no"}, uri ${uri ? "yes" : "no"}`);
  }
  if (!/^https?:\/\/|^ipfs:\/\//.test(u)) {
    const m = await fetchMeta(mint, uri, step).catch(() => ({} as any));
    u = m.image ?? "";
    step(`metadata image: ${u || "none"}`);
  }
  if (!u) return done(new Response(null, { status: 404, headers: { "cache-control": "public, s-maxage=120" } }));

  const img = await fetchImage(u, Math.max(1500, 8000 - (Date.now() - t0)));
  step(img ? `fetched ${img.type} ${img.buf.length}b` : "image fetch failed on every gateway");
  if (!img) return done(new Response(null, { status: 404, headers: { "cache-control": "public, s-maxage=60" } }));

  try {
    const stored = await Promise.race([storeBuffer(mint, img.buf, img.type), new Promise<null>((r) => setTimeout(() => r(null), Math.max(300, 9300 - (Date.now() - t0))))]);
    step(stored ? "stored" : "store timed out");
  } catch (e: any) {
    step(e.message);
    await saveRawImage(mint, u).catch(() => {});
  }
  return done(new Response(new Uint8Array(img.buf), { headers: { "content-type": img.type, "cache-control": "public, max-age=86400, s-maxage=86400" } }));
}