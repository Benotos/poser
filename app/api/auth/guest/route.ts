import { db } from "@/lib/admin";
import { createSession, getSession } from "@/lib/session";
import { fail, ok } from "@/lib/http";

// play without a wallet. A wallet is only needed later to get paid.
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  if (await getSession()) return fail("already_signed_in");
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 3) return fail("too_many_accounts", 429);

  const { username } = await req.json().catch(() => ({}));
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{3,16}$/.test(username))
    return fail("username must be 3 to 16 letters, numbers or _");
  const { data, error } = await db().from("profiles").insert({ username }).select("*").single();
  if (error) return fail(error.code === "23505" ? "username taken" : error.message);
  hits.set(ip, [...recent, now]);
  await createSession({ pid: data.id, wallet: "" });
  return ok({ profile: data });
}
