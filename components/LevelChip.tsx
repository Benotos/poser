"use client";
import { level } from "@/lib/xp";
export default function LevelChip({ xp, compact = false }: { xp: number; compact?: boolean }) {
  const l = level(xp);
  return (
    <span className="flex flex-col gap-0.5" title={`${xp} XP · ${l.toNext} to level ${l.lvl + 1}`}>
      <span className="pixel text-[10px] leading-none text-sun">LV {l.lvl}{!compact && <span className="text-mute"> {l.title}</span>}</span>
      <span className="block h-1 w-14 overflow-hidden rounded-full bg-line"><span className="block h-full sol-bar" style={{ width: `${Math.round(l.progress * 100)}%` }} /></span>
    </span>
  );
}
