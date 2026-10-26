"use client";
import { useSettings } from "@/lib/settings";
import { useSolUsd } from "./useSolUsd";
import { compact, sol } from "@/lib/format";

/** formats a SOL market cap in the user's chosen unit */
export function useMc() {
  const [s] = useSettings();
  const usd = useSolUsd();
  const inUsd = s.denom === "usd" && !!usd;
  return {
    inUsd,
    usd,
    fmt: (mcSol: number | null | undefined) =>
      mcSol == null || !isFinite(mcSol) ? "–" : inUsd ? "$" + compact(mcSol * usd!) : `${sol(mcSol, mcSol < 100 ? 1 : 0)} SOL`,
    toUnit: (mcSol: number) => (inUsd ? mcSol * usd! : mcSol),
    fromUnit: (v: number) => (inUsd ? v / usd! : v),
  };
}
