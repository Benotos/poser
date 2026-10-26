import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { avatarData, C, Frame, pixelFont } from "@/lib/og";
import { leagueDay, START_SOL } from "@/lib/constants";

export const runtime = "edge";

export async function GET(_: Request, { params }: { params: { name: string } }) {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: p } = await s.from("profiles").select("id,username,avatar_seed,is_agent").eq("username", decodeURIComponent(params.name)).maybeSingle();
  if (!p) return new Response("not found", { status: 404 });
  const day = leagueDay();
  const [{ data: lb }, { data: st }] = await Promise.all([
    s.from("leaderboard").select("equity_sol,rank,trades").eq("day", day).eq("profile_id", p.id).maybeSingle(),
    s.from("profile_stats").select("win_rate,xp,top10").eq("profile_id", p.id).maybeSingle(),
  ]);
  const eq = Number(lb?.equity_sol ?? START_SOL);
  const g = eq / START_SOL - 1;
  const up = g >= 0;
  const big = `${up ? "+" : ""}${(g * 100).toFixed(1)}%`;
  const wr = st?.win_rate != null ? `${Math.round(Number(st.win_rate) * 100)}%` : "-";
  const font = await pixelFont(`POSER ${big} ${p.username} rank today balance win rate trades top 10 finishes paper trade pump.fun get paid in real SOL 0123456789.+-%#`);
  const Stat = ({ k, v }: { k: string; v: string }) => (
    <div style={{ display: "flex", flexDirection: "column", background: C.panel, padding: "18px 26px", borderRadius: 10, minWidth: 220 }}>
      <span style={{ fontSize: 22, color: C.mute }}>{k}</span><span style={{ fontSize: 44 }}>{v}</span>
    </div>
  );
  return new ImageResponse(
    (
      <Frame accent={up ? C.mint : C.bleed}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 44, color: C.pop }}>POSER</div>
          <div style={{ fontSize: 24, color: C.mute }}>today {day}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 44, marginTop: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarData(p.avatar_seed, p.is_agent)} width={180} height={180} style={{ borderRadius: 12, background: C.panel }} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 40, color: C.mute }}>{p.username}</div>
            <div style={{ fontSize: 140, color: up ? C.mint : C.bleed, lineHeight: 1.05 }}>{big}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 36 }}>
          <Stat k="rank" v={lb?.rank ? `#${lb.rank}` : "-"} />
          <Stat k="balance" v={eq.toFixed(2)} />
          <Stat k="win rate" v={wr} />
          <Stat k="top 10 finishes" v={String(st?.top10 ?? 0)} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: C.mute, marginTop: "auto" }}>
          <span>paper trade pump.fun</span><span style={{ color: C.sun }}>top 10 get paid in real SOL</span>
        </div>
      </Frame>
    ),
    { width: 1200, height: 630, fonts: font ? [{ name: "Pixel", data: font, weight: 700 }] : [] },
  );
}
