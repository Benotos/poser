// Saves each coin's picture once into Supabase Storage at coin-images/<mint>.webp,
// so the picture is tied to the CA and never depends on a slow IPFS gateway again.
import { db } from "./admin";
import { GATEWAYS } from "./meta";

const BUCKET = "coin-images";

export const storedUrl = (mint: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${mint}.webp`;
export const isStored = (u?: string | null) => !!u && u.includes(`/storage/v1/object/public/${BUCKET}/`);

function variants(u: string): string[] {
  const m = u.match(/\/ipfs\/([^?#]+)/) || u.match(/^ipfs:\/\/(.+)$/);
  return m ? [...new Set([...GATEWAYS.map((g) => g + m[1]), u])] : [u];
}

/** first gateway to answer with an image wins */
export async function fetchImage(u: string, ms = 5000): Promise<{ buf: Buffer; type: string } | null> {
  const ctrls: AbortController[] = [];
  const timer = setTimeout(() => ctrls.forEach((c) => c.abort()), ms);
  try {
    return await Promise.any(variants(u).map(async (url) => {
      const c = new AbortController(); ctrls.push(c);
      const r = await fetch(url, { signal: c.signal, headers: { accept: "image/*,*/*" }, redirect: "follow" });
      const type = (r.headers.get("content-type") ?? "").split(";")[0];
      if (!r.ok) throw new Error(String(r.status));
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || (!type.startsWith("image/") && !looksLikeImage(buf))) throw new Error("not image");
      return { buf, type: type.startsWith("image/") ? type : "image/png" };
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ctrls.forEach((c) => c.abort());
  }
}

function looksLikeImage(b: Buffer) {
  const h = b.subarray(0, 12).toString("hex");
  return h.startsWith("89504e47") || h.startsWith("ffd8ff") || h.startsWith("47494638") || (h.startsWith("52494646") && b.subarray(8, 12).toString() === "WEBP");
}

let bucketP: Promise<void> | null = null;
/** creates the public coin-images bucket if it's missing, so nobody has to run SQL for it */
export function ensureBucket() {
  bucketP ??= (async () => {
    const { error } = await db().storage.createBucket(BUCKET, { public: true, fileSizeLimit: 1048576, allowedMimeTypes: ["image/webp", "image/png", "image/jpeg", "image/gif"] });
    if (error && !/already exists/i.test(error.message)) { bucketP = null; throw new Error("bucket: " + error.message); }
  })();
  return bucketP;
}

/** keep the plain link on the row while it has no stored picture, so it always shows something */
export async function saveRawImage(mint: string, src?: string | null) {
  if (!src || isStored(src)) return;
  await db().from("coins").update({ image: src }).eq("mint", mint).is("image", null);
}

/** shrink to 128px webp, upload, and point the coin row at it */
export async function storeBuffer(mint: string, buf: Buffer, type: string): Promise<string | null> {
  let out = buf;
  try {
    const sharp = (await import("sharp")).default;
    out = await sharp(buf, { animated: false, limitInputPixels: 50_000_000 }).resize(128, 128, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
    type = "image/webp";
  } catch {
    if (buf.length > 1_000_000) return null; // can't shrink and too big to keep
  }
  const up = () => db().storage.from(BUCKET).upload(`${mint}.webp`, out, { contentType: type, upsert: true, cacheControl: "604800" });
  let { error } = await up();
  if (error && /bucket not found/i.test(error.message)) {
    await ensureBucket();
    ({ error } = await up());
  }
  if (error) throw new Error("storage: " + error.message);
  const url = storedUrl(mint);
  await db().from("coins").update({ image: url }).eq("mint", mint);
  return url;
}

/** download from the fastest gateway, then store. Returns the stored URL. */
export async function storeCoinImage(mint: string, src: string): Promise<string | null> {
  const got = await fetchImage(src);
  if (!got) return null;
  const url = await storeBuffer(mint, got.buf, got.type).catch(() => null);
  if (!url) await saveRawImage(mint, src).catch(() => {});
  return url;
}