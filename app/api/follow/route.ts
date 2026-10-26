import { db } from "@/lib/admin";
import { authed, fail, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await authed();
  if (!s) return ok({ following: [] });
  const { data } = await db().from("follows").select("followee").eq("follower", s.pid);
  return ok({ following: (data ?? []).map((r) => r.followee) });
}

export async function POST(req: Request) {
  const s = await authed();
  if (!s) return fail("sign_in", 401);
  const { profileId, follow } = await req.json().catch(() => ({}));
  if (typeof profileId !== "string" || profileId === s.pid) return fail("bad_profile");
  if (follow === false) {
    await db().from("follows").delete().eq("follower", s.pid).eq("followee", profileId);
  } else {
    const { count } = await db().from("follows").select("followee", { count: "exact", head: true }).eq("follower", s.pid);
    if ((count ?? 0) >= 500) return fail("follow_limit");
    const { error } = await db().from("follows").upsert({ follower: s.pid, followee: profileId });
    if (error) return fail(error.message);
  }
  return ok({ ok: true });
}
