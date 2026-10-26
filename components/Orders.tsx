"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./Auth";
import { useMc } from "./useMc";
import { sol } from "@/lib/format";

export function useOrders(mint?: string) {
  const { me } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const load = useCallback(() => {
    if (!me.profile) return setOrders([]);
    fetch(`/api/orders${mint ? `?mint=${mint}` : ""}`).then((r) => r.json()).then((j) => setOrders(j.orders ?? []));
  }, [me.profile, mint]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  return { orders, reload: load };
}

export default function Orders({ mint, orders, reload }: { mint?: string; orders: any[]; reload: () => void }) {
  const mc = useMc();
  const shown = orders.filter((o) => o.status === "open" || Date.now() - Date.parse(o.filled_at ?? o.created_at) < 3600_000);
  if (!shown.length) return <p className="p-6 text-center text-sm text-mute">No orders today. Set one from the Limit tab.</p>;
  return (
    <ul className="divide-y divide-line text-sm">
      {shown.map((o) => (
        <li key={o.id} className="flex items-center gap-3 px-3 py-2">
          <span className={"w-10 font-semibold " + (o.side === "buy" ? "text-mint" : "text-bleed")}>{o.side}</span>
          {!mint && <Link href={`/coin/${o.mint}`} className="text-sun hover:underline">${o.coins?.symbol ?? o.mint.slice(0, 4)}</Link>}
          <span className="flex-1 text-mute">
            {o.side === "buy" ? `${sol(Number(o.sol), 3)} SOL` : `${Math.round(Number(o.pct) * 100)}%`} when mc {o.trigger === "mc_below" ? "≤" : "≥"} <span className="num text-white">{mc.fmt(Number(o.trigger_mc))}</span>
          </span>
          <span className={"text-xs " + (o.status === "open" ? "text-sun" : o.status === "filled" ? "text-mint" : "text-mute")}>{o.status}</span>
          {o.status === "open" && (
            <button className="text-xs text-mute hover:text-bleed" onClick={async () => { await fetch(`/api/orders?id=${o.id}`, { method: "DELETE" }); reload(); }}>Cancel</button>
          )}
        </li>
      ))}
    </ul>
  );
}
