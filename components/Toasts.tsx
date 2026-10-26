"use client";
import { createContext, ReactNode, useCallback, useContext, useState } from "react";

export type Toast = {
  id?: number;
  tone?: "mint" | "bleed" | "pop" | "sun";
  title: string;
  body?: string;
  img?: string;
  action?: { label: string; run: () => void };
  ttl?: number;
};

const Ctx = createContext<(t: Toast) => void>(() => {});
export const useToast = () => useContext(Ctx);

const TONE = { mint: "border-mint", bleed: "border-bleed", pop: "border-pop", sun: "border-sun" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((t: Toast) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-3), { ...t, id }]);
    setTimeout(() => setList((l) => l.filter((x) => x.id !== id)), t.ttl ?? 6000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={"pointer-events-auto flex gap-3 rounded-lg border-l-4 bg-panel p-3 shadow-[0_8px_30px_rgba(0,0,0,.45)] " + TONE[t.tone ?? "pop"]}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {t.img && <img src={t.img} alt="" width={36} height={36} className="px h-9 w-9 shrink-0 rounded" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.body && <p className="mt-0.5 truncate text-xs text-mute">{t.body}</p>}
            </div>
            {t.action && (
              <button className="btn-pop shrink-0 self-center px-3 py-1 text-xs" onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" className="self-start text-mute hover:text-white" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}>×</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
