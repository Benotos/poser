"use client";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";

export default function SettingsMenu() {
  const [s, set] = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button aria-label="Settings" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-line text-mute hover:text-white">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M7 1h2v2h2v2h2v2h-2v2h2v2h-2v2H9v2H7v-2H5v-2H3V9h2V7H3V5h2V3h2zm0 4v6h2V5z" /></svg>
      </button>
      {open && (
        <div className="card absolute right-0 top-11 z-40 w-72 space-y-4 p-4 text-sm shadow-[0_12px_40px_rgba(0,0,0,.5)]">
          <NumField label="Quick buy size (SOL)" hint="Used by ⚡ buttons and the B key on coin pages." value={s.quickBuy} onSave={(v) => set({ quickBuy: v })} />
          <PresetsField value={s.presets} onSave={(p) => set({ presets: p })} />
          <NumField label="Copy trade size (SOL)" value={s.copySize} onSave={(v) => set({ copySize: v })} />
          <div className="flex items-center justify-between">
            <span className="text-mute">Market cap in</span>
            <div className="flex gap-1 rounded-md bg-ink p-0.5">
              {(["usd", "sol"] as const).map((d) => (
                <button key={d} onClick={() => set({ denom: d })} className={"rounded px-2.5 py-1 text-xs uppercase " + (s.denom === d ? "bg-pop text-white" : "text-mute")}>{d}</button>
              ))}
            </div>
          </div>
          <Toggle label="Sounds" on={s.sounds} set={(v) => set({ sounds: v })} />
          <Toggle label="Alerts from posers I follow" on={s.copyAlerts} set={(v) => set({ copyAlerts: v })} />
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => set(!on)} className="flex w-full items-center justify-between">
      <span className="text-mute">{label}</span>
      <span className={"relative h-5 w-9 rounded-full transition-colors " + (on ? "bg-mint" : "bg-line")}>
        <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-ink transition-all " + (on ? "left-[18px]" : "left-0.5")} />
      </span>
    </button>
  );
}


/** saves as you type whenever the value is valid */
function NumField({ label, hint, value, onSave }: { label: string; hint?: string; value: number; onSave: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = Number(text);
  const valid = n > 0 && n <= 100000;
  return (
    <label className="block">
      <span className="text-mute">{label}</span>
      <input className={"input num mt-1 py-1.5 " + (valid ? "" : "border-bleed")} inputMode="decimal" value={text}
        onChange={(e) => { const t = e.target.value.replace(/[^0-9.]/g, ""); setText(t); const v = Number(t); if (v > 0 && v <= 100000) onSave(v); }}
        onBlur={() => !valid && setText(String(value))} />
      {hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

function PresetsField({ value, onSave }: { value: number[]; onSave: (p: number[]) => void }) {
  const [vals, setVals] = useState<string[]>(value.map(String));
  useEffect(() => { if (vals.map(Number).join(",") !== value.join(",")) setVals(value.map(String)); }, [value.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (i: number, t: string) => {
    const next = vals.slice(); next[i] = t.replace(/[^0-9.]/g, ""); setVals(next);
    const nums = next.map(Number);
    if (nums.every((x) => x > 0 && x <= 100000)) onSave(nums);
  };
  return (
    <div>
      <span className="text-mute">Buy presets (SOL)</span>
      <div className="mt-1 grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => {
          const v = vals[i] ?? "";
          const ok = Number(v) > 0;
          return (
            <input key={i} aria-label={`Preset ${i + 1}`} inputMode="decimal" value={v} onChange={(e) => update(i, e.target.value)}
              onBlur={() => !ok && setVals(value.map(String))}
              className={"input num px-1.5 py-1.5 text-center " + (ok ? "" : "border-bleed")} />
          );
        })}
      </div>
      <span className="mt-1 block text-xs text-mute">Keys 1 to 4 on coin pages. Saves as you type.</span>
    </div>
  );
}