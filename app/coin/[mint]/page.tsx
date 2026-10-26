import { createClient } from "@supabase/supabase-js";
import CoinView from "@/components/CoinView";
import type { Metadata } from "next";

export const revalidate = 30; // cached page shell, live data comes from cached API routes

async function getCoin(mint: string) {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await s.from("coins").select("*").eq("mint", mint).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { mint: string } }): Promise<Metadata> {
  const c = await getCoin(params.mint).catch(() => null);
  return { title: c?.symbol ? `$${c.symbol} on POSER` : "Trade on POSER" };
}

export default async function Page({ params }: { params: { mint: string } }) {
  const coin = await getCoin(params.mint).catch(() => null);
  return <CoinView mint={params.mint} initial={coin} />;
}