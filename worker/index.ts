// POSER worker: run as one long lived process (Railway, Fly, Render, a VPS). `npm run worker`
try { (process as any).loadEnvFile?.(".env.local"); } catch {}
try { (process as any).loadEnvFile?.(".env"); } catch {}

import { startFeed } from "./feed";
import { startMarking } from "./mark";
import { startAgents } from "./agents";
import { log } from "./log";

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SOLANA_RPC_URL"]) {
  if (!process.env[k]) { console.error(`missing env ${k}`); process.exit(1); }
}

log("poser", "worker starting");
startFeed();
startMarking();
startAgents();
process.on("unhandledRejection", (e: any) => log("poser", "unhandled", e?.message ?? e));
