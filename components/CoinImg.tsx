"use client";
import { useEffect, useState } from "react";

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/coin-images/`;

/**
 * coin picture, tied to the CA: coin-images/<mint>.webp in our storage.
 * Not stored yet: our image route finds it, sends it and stores it.
 * The ticker letters sit underneath, so there's never an empty box while it loads.
 */
export default function CoinImg({ src, symbol, size = 36, mint }: { src?: string | null; symbol?: string | null; size?: number; mint?: string }) {
  // 1. our stored copy, named after the CA, so it works even before the row knows about it
  // 2. our route, which finds it, sends it and stores it (about 1.5s the first time, then never again)
  // 3. the coin's own link as a last try
  const raw = src && !src.startsWith(BASE) ? src : null;
  const chain = [
    mint ? `${BASE}${mint}.webp` : src?.startsWith(BASE) ? src : null,
    mint ? `/api/img?${new URLSearchParams({ mint, ...(raw ? { u: raw } : {}) })}` : null,
    raw,
  ].filter((x, k, a) => x && a.indexOf(x) === k) as string[];
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setI(0); setLoaded(false); }, [src, mint]);
  // a slow gateway never holds the picture hostage: skip ahead if a step takes too long
  useEffect(() => {
    if (loaded || i >= chain.length - 1) return;
    const t = setTimeout(() => setI((n) => n + 1), i === 0 ? 2500 : 9000);
    return () => clearTimeout(t);
  }, [i, loaded, chain.length]);
  return (
    <div style={{ width: size, height: size }} className="relative shrink-0 overflow-hidden rounded-md bg-line">
      {!loaded && (
        <span className="pixel absolute inset-0 flex items-center justify-center text-[10px] text-mute">{(symbol || "?").slice(0, 3)}</span>
      )}
      {i < chain.length && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={chain[i]} src={chain[i]} alt="" width={size} height={size} decoding="async" loading="lazy"
          onLoad={() => setLoaded(true)} onError={() => { setLoaded(false); setI((n) => n + 1); }}
          className={"absolute inset-0 h-full w-full object-cover transition-opacity duration-200 " + (loaded ? "opacity-100" : "opacity-0")} />
      )}
    </div>
  );
}