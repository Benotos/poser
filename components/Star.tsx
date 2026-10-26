"use client";
import { useSocial } from "./Social";
export default function Star({ mint, size = 16 }: { mint: string; size?: number }) {
  const { watch, toggleWatch } = useSocial();
  const on = watch.has(mint);
  return (
    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWatch(mint); }} aria-pressed={on}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"} className={on ? "text-sun" : "text-mute hover:text-white"}>
      <svg width={size} height={size} viewBox="0 0 16 16" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M8 1.5l1.9 4 4.4.5-3.3 3 .9 4.4L8 11.2l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
