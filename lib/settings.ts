"use client";
import { useEffect, useState } from "react";

export type Settings = {
  quickBuy: number;       // SOL per quick buy click / B hotkey
  presets: number[];      // buy buttons
  sounds: boolean;
  copyAlerts: boolean;    // toast when someone you follow trades
  copySize: number;       // SOL for one click copy
  denom: "usd" | "sol";   // market cap display
};

const DEFAULTS: Settings = { quickBuy: 0.25, presets: [0.1, 0.25, 0.5, 1], sounds: true, copyAlerts: true, copySize: 0.25, denom: "usd" };
const KEY = "poser.settings.v1";
const EVT = "poser:settings";

export function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function writeSettings(patch: Partial<Settings>) {
  const next = { ...readSettings(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
}

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [s, setS] = useState<Settings>(DEFAULTS);
  useEffect(() => {
    setS(readSettings());
    const on = (e: Event) => setS((e as CustomEvent).detail);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return [s, writeSettings];
}
