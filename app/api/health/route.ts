import { createClient } from "@supabase/supabase-js";

// Quick check of what the live site can see. Shows only yes/no for each setting, never the values.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!url, NEXT_PUBLIC_SUPABASE_ANON_KEY: !!anon, SUPABASE_SERVICE_ROLE_KEY: !!service,
    SESSION_SECRET: !!process.env.SESSION_SECRET, SOLANA_RPC_URL: !!process.env.SOLANA_RPC_URL,
    NEXT_PUBLIC_POSER_CA: !!process.env.NEXT_PUBLIC_POSER_CA, MAINTENANCE: process.env.MAINTENANCE ?? null,
  };
  const ping = async (key?: string) => {
    if (!url || !key) return { ok: false, error: "missing setting" };
    const t0 = Date.now();
    try {
      const r = await Promise.race([
        createClient(url, key, { auth: { persistSession: false } }).from("coins").select("mint", { head: true, count: "estimated" }),
        new Promise<any>((res) => setTimeout(() => res({ error: { message: "timed out after 6s" } }), 6000)),
      ]);
      return r.error ? { ok: false, error: r.error.message, ms: Date.now() - t0 } : { ok: true, ms: Date.now() - t0 };
    } catch (e: any) {
      return { ok: false, error: e.message, ms: Date.now() - t0 };
    }
  };
  const [anonDb, serviceDb] = await Promise.all([ping(anon), ping(service)]);
  return Response.json({ env, db: { anon: anonDb, service: serviceDb } }, { headers: { "cache-control": "no-store" } });
}