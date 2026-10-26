"use client";
import { useState } from "react";
import PoserTape from "./PoserTape";
import { useSocial } from "./Social";
export default function TapePanel() {
  const [tab, setTab] = useState<"all" | "following">("all");
  const { following } = useSocial();
  return (
    <aside className="card overflow-hidden">
      <div className="flex items-center gap-1 border-b border-line p-2">
        {(["all", "following"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={"rounded-md px-3 py-1.5 text-sm capitalize " + (tab === t ? "bg-ink text-white" : "text-mute hover:text-white")}>
            {t === "all" ? "Live on POSER" : `Following ${following.size || ""}`}
          </button>
        ))}
      </div>
      <div className="max-h-[760px] overflow-y-auto">
        {tab === "all" ? <PoserTape /> : <PoserTape onlyIds={[...following]} />}
      </div>
    </aside>
  );
}
