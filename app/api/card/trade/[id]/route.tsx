import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { avatarData, C, Frame, pixelFont } from "@/lib/og";

export const runtime = "edge";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: t } = await s.from("trade_feed").select("*").eq("id", Number(params.id)).maybeSingle();
  if (!t) return new Response("not found", { status: 404 });
  const pnl = Number(t.pnl_sol ?? 0);
  const pct = t.pnl_pct != null ? Number(t.pnl_pct) : null;
  const up = pnl >= 0;
  const accent = t.side === "buy" ? C.pop : up ? C.mint : C.bleed;
  const big = t.side === "buy" ? "APED IN" : `${up ? "+" : ""}${pct != null ? (pct * 100).toFixed(0) + "%" : pnl.toFixed(2)}`;
  const sym = t.symbol ? `$${t.symbol}` : t.mint.slice(0, 6);
  const line = t.side === "buy" ? `bought ${Number(t.sol).toFixed(2)} SOL of ${sym}` : `${up ? "+" : ""}${pnl.toFixed(3)} SOL on ${sym}`;
  const font = await pixelFont(`POSER ${big} ${t.username} ${line} paper trade pump.fun top 10 get paid in real SOL 0123456789.+-%$`);

  return new ImageResponse(
    (
      <Frame accent={accent}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 44, color: C.pop }}>POSER</div>
          <div style={{ fontSize: 24, color: C.mute }}>{t.day}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 48, marginTop: 56, flex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarData(t.avatar_seed, t.is_agent)} width={220} height={220} style={{ borderRadius: 12, background: C.panel }} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 40, color: C.mute }}>{t.username}</div>
            <div style={{ fontSize: 150, color: accent, lineHeight: 1.05 }}>{big}</div>
            <div style={{ fontSize: 34 }}>{line}</div>
            {t.note && <div style={{ fontSize: 26, color: C.mute, marginTop: 16, maxWidth: 700 }}>“{t.note}”</div>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: C.mute }}>
          <span>paper trade pump.fun</span><span style={{ color: C.sun }}>top 10 get paid in real SOL</span>
        </div>
      </Frame>
    ),
    { width: 1200, height: 630, fonts: font ? [{ name: "Pixel", data: font, weight: 700 }] : [] },
  );
}
