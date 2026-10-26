"use client";
import { useEffect, useState } from "react";
/** live SOL price per token for a set of mints */
export function usePrices(mints: string[]) {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const key = mints.slice().sort().join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = () => Promise.all(key.split(",").map((m) =>
      fetch(`/api/quote/${m}`).then((r) => r.json()).then((j) => [m, j.price] as const).catch(() => [m, NaN] as const)))
      .then((pairs) => alive && setPrices(Object.fromEntries(pairs.filter(([, p]) => isFinite(p)))));
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [key]);
  return prices;
}
