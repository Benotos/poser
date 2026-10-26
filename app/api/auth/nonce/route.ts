import { NextResponse } from "next/server";
import { db } from "@/lib/admin";
import { PublicKey } from "@solana/web3.js";
import { signMessage } from "@/lib/auth";


export async function POST(req: Request) {
  const { wallet } = await req.json().catch(() => ({}));
  try { new PublicKey(wallet); } catch { return NextResponse.json({ error: "bad_wallet" }, { status: 400 }); }
  // reuse a live nonce: two quick sign in clicks (or a wallet popup reopening) must sign the same message,
  // otherwise the second request replaces the nonce and the first signature fails as bad_signature
  const { data: cur } = await db().from("auth_nonces").select("nonce,expires_at").eq("wallet", wallet).maybeSingle();
  if (cur && new Date(cur.expires_at).getTime() - Date.now() > 2 * 60_000) return NextResponse.json({ message: signMessage(wallet, cur.nonce) });
  const nonce = crypto.randomUUID();
  await db().from("auth_nonces").upsert({ wallet, nonce, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
  return NextResponse.json({ message: signMessage(wallet, nonce) });
}