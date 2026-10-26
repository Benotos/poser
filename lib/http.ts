import { NextResponse } from "next/server";
import { getSession, Session } from "./session";

export const ok = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
export const isMint = (m: unknown): m is string => typeof m === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m);

export async function authed(): Promise<Session | null> {
  return getSession();
}
