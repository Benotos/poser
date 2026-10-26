import { PublicKey } from "@solana/web3.js";
import { rpc } from "./price";

const METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export type CoinMeta = {
  name?: string; symbol?: string; uri?: string; image?: string;
  description?: string; twitter?: string; telegram?: string; website?: string;
};

const clean = (s: string) => s.replace(/\0/g, "").trim();

/**
 * coin name, symbol, image and socials.
 * 1. pump.fun's API (covers new Token-2022 coins, which have no Metaplex metadata)
 * 2. Metaplex metadata on chain + its JSON
 * 3. DexScreener (other launchpads)
 */
export async function fetchMeta(mint: string, uriHint?: string, log?: (s: string) => void): Promise<CoinMeta> {
  const { pumpCoin, pumpImage } = await import("./pumpapi");
  const [m, p] = await Promise.all([metaplexMeta(mint, uriHint, log), pumpCoin(mint).catch(() => null)]);
  log?.(`pump api: ${p ? "found" : "no answer"}, chain: ${m.uri ? "uri found" : "no uri"}, json image: ${m.image ? "yes" : "no"}`);
  const merged: CoinMeta = {
    name: m.name || p?.name, symbol: m.symbol || p?.symbol, uri: m.uri,
    image: m.image || pumpImage(p?.image_uri), description: m.description || p?.description?.slice(0, 400),
    twitter: m.twitter || p?.twitter || undefined, telegram: m.telegram || p?.telegram || undefined, website: m.website || p?.website || undefined,
  };
  if (merged.name && merged.image) return merged;
  if (!merged.image) merged.image = await dasImage(mint, log);
  if (merged.name && merged.image) return merged;
  const d = await dexMeta(mint);
  return d ? { ...merged, image: merged.image || d.image, name: merged.name || d.name, symbol: merged.symbol || d.symbol,
    twitter: merged.twitter || d.twitter, website: merged.website || d.website, telegram: merged.telegram || d.telegram } : merged;
}

/** Helius (and other DAS RPCs) hand back the picture link straight away, no IPFS JSON needed */
async function dasImage(mint: string, log?: (s: string) => void): Promise<string | undefined> {
  const url = process.env.SOLANA_RPC_URL;
  if (!url || !/helius|das|triton|quiknode/i.test(url)) return undefined;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: mint } }) });
    clearTimeout(t);
    const j = await r.json();
    const img = j?.result?.content?.links?.image || j?.result?.content?.files?.[0]?.uri;
    log?.(`das: ${img ? "image found" : j?.error?.message ?? "no image"}`);
    return img ? ipfs(img) : undefined;
  } catch (e: any) {
    log?.(`das: ${e.message}`);
    return undefined;
  }
}

async function dexMeta(mint: string): Promise<CoinMeta | null> {
  try {
    const pairs: any[] = await (await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, { cache: "no-store" })).json();
    const p = pairs.find((x) => x.baseToken?.address === mint);
    if (!p) return null;
    const soc = (t: string) => p.info?.socials?.find((s: any) => s.type === t)?.url;
    return { name: p.baseToken.name, symbol: p.baseToken.symbol, image: p.info?.imageUrl, twitter: soc("twitter"), telegram: soc("telegram"), website: p.info?.websites?.[0]?.url };
  } catch {
    return null;
  }
}

const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** name / symbol / uri stored on the mint itself (Token-2022 metadata extension, used by new pump.fun coins) */
export function parseToken2022Metadata(d: Buffer): { name: string; symbol: string; uri: string } | null {
  if (d.length <= 166 || d[165] !== 1) return null; // 1 = mint account
  let o = 166;
  while (o + 4 <= d.length) {
    const type = d.readUInt16LE(o), len = d.readUInt16LE(o + 2);
    const v = o + 4;
    if (type === 19) { // TokenMetadata
      let p = v + 64; // update authority + mint
      const str = () => { const n = d.readUInt32LE(p); p += 4; const s = clean(d.subarray(p, p + n).toString("utf8")); p += n; return s; };
      return { name: str(), symbol: str(), uri: str() };
    }
    if (type === 0 && len === 0) break;
    o = v + len;
  }
  return null;
}

/** on chain metadata: Metaplex account, or the Token-2022 mint extension, then the JSON for image + socials */
export async function metaplexMeta(mint: string, uriHint?: string, log?: (s: string) => void): Promise<CoinMeta> {
  let meta: CoinMeta = {};
  try {
    if (!uriHint) {
      const mintKey = new PublicKey(mint);
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mintKey.toBuffer()],
        METADATA_PROGRAM,
      );
      const [mp, mi] = await rpc().getMultipleAccountsInfo([pda, mintKey]);
      if (mp) {
        const d = mp.data;
        let o = 1 + 32 + 32;
        const str = () => { const n = d.readUInt32LE(o); o += 4; const s = clean(d.subarray(o, o + n).toString("utf8")); o += n; return s; };
        meta.name = str(); meta.symbol = str(); meta.uri = str();
      } else if (mi && mi.owner.toBase58() === TOKEN_2022) {
        const t = parseToken2022Metadata(mi.data as Buffer);
        if (t) { meta.name = t.name; meta.symbol = t.symbol; meta.uri = t.uri; }
      }
    } else meta.uri = uriHint;
    if (meta.uri) {
      const j = await fetchJsonAnyGateway(meta.uri);
      if (!j) { log?.(`metadata json failed on every gateway: ${meta.uri}`); return meta; }
      meta = {
        ...meta,
        name: meta.name || j.name, symbol: meta.symbol || j.symbol,
        image: j.image ? ipfs(j.image) : undefined,
        description: typeof j.description === "string" ? j.description.slice(0, 400) : undefined,
        twitter: j.twitter, telegram: j.telegram, website: j.website,
      };
    }
  } catch (e: any) {
    log?.(`rpc: ${String(e?.message ?? e).slice(0, 120)}`);
  }
  return meta;
}

/** IPFS gateways, pump's own first. Raced in parallel, first answer wins. */
export const GATEWAYS = ["https://pump.mypinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://w3s.link/ipfs/", "https://ipfs.filebase.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"];

async function fetchJsonAnyGateway(uri: string, ms = 4500): Promise<any | null> {
  const m = uri.match(/\/ipfs\/([^?#]+)/) || uri.match(/^ipfs:\/\/(.+)$/);
  const urls = m ? [...new Set([...GATEWAYS.map((g) => g + m[1]), uri.startsWith("http") ? uri : ""].filter(Boolean))] : [uri];
  const ctrls: AbortController[] = [];
  const timer = setTimeout(() => ctrls.forEach((c) => c.abort()), ms);
  try {
    return await Promise.any(urls.map(async (u) => {
      const c = new AbortController(); ctrls.push(c);
      const r = await fetch(u, { signal: c.signal, headers: { accept: "application/json,*/*" } });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (!j || typeof j !== "object") throw new Error("bad json");
      return j;
    }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    ctrls.forEach((c) => c.abort());
  }
}

export function ipfs(u: string) {
  const m = u.match(/ipfs\/(.+)$/) || u.match(/^ipfs:\/\/(.+)$/);
  return m ? `https://ipfs.io/ipfs/${m[1]}` : u;
}