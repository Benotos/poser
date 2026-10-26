"use client";
import { useEffect, useState } from "react";
let cached: number | null = null;
export function useSolUsd() {
  const [v, setV] = useState<number | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetch("/api/sol").then((r) => r.json()).then((j) => { cached = j.usd; setV(j.usd); }).catch(() => {});
  }, []);
  return v;
}
