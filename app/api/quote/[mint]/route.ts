import { NextResponse } from "next/server";
import { getQuote } from "@/lib/price";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { mint: string } }) {
  try {
    const q = await getQuote(params.mint);
    return NextResponse.json(q, { headers: { "cache-control": "public, s-maxage=1" } });
  } catch {
    return NextResponse.json({ error: "price_unavailable" }, { status: 404 });
  }
}