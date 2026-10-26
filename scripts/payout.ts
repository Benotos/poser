// Pays the top 10 for a finished day from the creator fee wallet.
//   npm run payout -- 2026-10-14 3.2            dry run: shows who gets what from a 3.2 SOL pool
//   npm run payout -- 2026-10-14 3.2 --send     sends real SOL and records the signatures
try { (process as any).loadEnvFile?.(".env.local"); } catch {}
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { db } from "../lib/admin";

async function main() {
  const [day, poolArg, flag] = process.argv.slice(2);
  const pool = Number(poolArg);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") || !(pool > 0)) {
    console.log("usage: npm run payout -- <yyyy-mm-dd> <pool SOL> [--send]");
    process.exit(1);
  }
  const { data, error } = await db().from("league_results").select("profile_id,rank,share,payout_sol,paid_sig,profiles(username,wallet)")
    .eq("day", day).gt("share", 0).order("rank");
  if (error) throw error;
  if (!data?.length) return console.log("no payout rows for", day, "(is the day settled?)");

  const conn = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");
  const send = flag === "--send";
  const payer = send ? Keypair.fromSecretKey(bs58.decode(process.env.PAYOUT_WALLET_SECRET!)) : null;
  if (payer) console.log("paying from", payer.publicKey.toBase58(), "balance", (await conn.getBalance(payer.publicKey)) / LAMPORTS_PER_SOL, "SOL");

  for (const r of data as any[]) {
    const amt = Math.floor(pool * Number(r.share) * LAMPORTS_PER_SOL) / LAMPORTS_PER_SOL;
    const line = `#${r.rank} ${r.profiles.username.padEnd(16)} ${r.profiles.wallet} ${amt} SOL`;
    if (r.paid_sig) { console.log(line, "already paid", r.paid_sig); continue; }
    if (!payer) { console.log(line, "(dry run)"); continue; }
    const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: new PublicKey(r.profiles.wallet), lamports: Math.floor(amt * LAMPORTS_PER_SOL) }));
    const sig = await sendAndConfirmTransaction(conn, tx, [payer]);
    await db().from("league_results").update({ payout_sol: amt, paid_sig: sig }).eq("day", day).eq("profile_id", r.profile_id);
    console.log(line, "sent", sig);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
