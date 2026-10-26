import { NextResponse } from "next/server";
import { db } from "@/lib/admin";
import { getSession } from "@/lib/session";

export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "sign_in" }, { status: 401 });
  const { bio } = await req.json().catch(() => ({}));
  const { error } = await db().from("profiles").update({ bio: String(bio ?? "").slice(0, 160) }).eq("id", s.pid);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
