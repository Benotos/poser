"use client";
import Link from "next/link";
import CoinImg from "./CoinImg";
import { usePrices } from "./usePrices";
import { compact, pct, sol } from "@/lib/format";

export type Pos = { mint: string; tokens: number; cost_sol: number; value_sol: number; coins?: { name: string; symbol: string; image: string } | null };

export default function Positions({ rows, onSell, busy }: { rows: Pos[]; onSell?: (mint: string) => void; busy?: string | null }) {
  const prices = usePrices(rows.map((r) => r.mint));
  if (!rows.length) return <p className="p-8 text-center text-sm text-mute">No open positions.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="text-left text-xs text-mute"><tr><th className="px-3 py-2 font-normal">Coin</th><th className="text-right font-normal">Tokens</th><th className="text-right font-normal">Cost</th><th className="text-right font-normal">Value</th><th className="text-right font-normal">PnL</th>{onSell && <th />}</tr></thead>
        <tbody className="num">
          {rows.map((r) => {
            const value = prices[r.mint] ? Number(r.tokens) * prices[r.mint] : Number(r.value_sol);
            const g = value / Number(r.cost_sol) - 1;
            return (
              <tr key={r.mint} className="border-t border-line">
                <td className="px-3 py-2">
                  <Link href={`/coin/${r.mint}`} className="flex items-center gap-2 hover:text-pop">
                    <CoinImg src={r.coins?.image} symbol={r.coins?.symbol} mint={r.mint} size={28} />
                    <span className="font-sans font-semibold">${r.coins?.symbol ?? r.mint.slice(0, 4)}</span>
                  </Link>
                </td>
                <td className="text-right text-mute">{compact(Number(r.tokens))}</td>
                <td className="text-right">{sol(Number(r.cost_sol), 3)}</td>
                <td className="text-right">{sol(value, 3)}</td>
                <td className={"text-right " + (g >= 0 ? "text-mint" : "text-bleed")}>{pct(g)}</td>
                {onSell && <td className="px-3 text-right"><button className="btn-ghost px-2 py-1 text-xs" disabled={busy === r.mint} onClick={() => onSell(r.mint)}>{busy === r.mint ? "Selling" : "Sell all"}</button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}