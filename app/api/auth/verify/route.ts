import { NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/admin";
import { createSession, getSession } from "@/lib/session";
import { signMessage } from "@/lib/auth";

export async function POST(req: Request) {
  const { wallet, signature, username, link, message } = await req.json().catch(() => ({}));
  if (typeof wallet !== "string" || typeof signature !== "string")
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { data: n } = await db().from("auth_nonces").select("*").eq("wallet", wallet).maybeSingle();
  if (!n || new Date(n.expires_at).getTime() < Date.now())
    return NextResponse.json({ error: "nonce_expired" }, { status: 401 });

  let ok = false;
  const expected = signMessage(wallet, n.nonce);
  try {
    const sig = bs58.decode(signature), key = new PublicKey(wallet).toBytes();
    ok = nacl.sign.detached.verify(new TextEncoder().encode(expected), sig, key);
    // some wallets normalise line endings before signing
    if (!ok) ok = nacl.sign.detached.verify(new TextEncoder().encode(expected.replace(/\n/g, "\r\n")), sig, key);
  } catch {}
  if (!ok) {
    // tell them why: a stale message (another sign in started) or a wallet that signs differently (Ledger)
    const stale = typeof message === "string" && message !== expected;
    return NextResponse.json({ error: stale ? "That sign in request expired. Press Sign in again." : "Your wallet's signature didn't check out. Ledger wallets can't sign messages, use a hot wallet or play as a guest." }, { status: 401 });
  }

  // a guest linking a wallet to their account so they can get paid
  if (link) {
    const s = await getSession();
    if (!s) return NextResponse.json({ error: "sign_in" }, { status: 401 });
    const { data: taken } = await db().from("profiles").select("username").eq("wallet", wallet).maybeSingle();
    if (taken) return NextResponse.json({ error: `This wallet is already linked to ${taken.username}` }, { status: 400 });
    const { data: linked, error } = await db().from("profiles").update({ wallet }).eq("id", s.pid).is("wallet", null).select("*").maybeSingle();
    if (error || !linked) return NextResponse.json({ error: "Account already has a wallet" }, { status: 400 });
    await db().from("auth_nonces").delete().eq("wallet", wallet);
    await createSession({ pid: s.pid, wallet });
    return NextResponse.json({ profile: linked });
  }

  let { data: profile } = await db().from("profiles").select("*").eq("wallet", wallet).maybeSingle();
  if (!profile) {
    if (!username) return NextResponse.json({ needsUsername: true }); // keep nonce so they can pick a name
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username))
      return NextResponse.json({ error: "username must be 3 to 16 letters, numbers or _" }, { status: 400 });
    const ins = await db().from("profiles").insert({ wallet, username }).select("*").single();
    if (ins.error) return NextResponse.json({ error: ins.error.code === "23505" ? "username taken" : ins.error.message }, { status: 400 });
    profile = ins.data;
  }
  await db().from("auth_nonces").delete().eq("wallet", wallet);
  await createSession({ pid: profile.id, wallet });
  return NextResponse.json({ profile });
}