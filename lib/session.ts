import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "poser_session";
const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-secret-change-me");

export type Session = { pid: string; wallet: string };

export async function createSession(s: Session) {
  const token = await new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(key());
  cookies().set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function getSession(): Promise<Session | null> {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    return { pid: payload.pid as string, wallet: payload.wallet as string };
  } catch {
    return null;
  }
}

export function clearSession() {
  cookies().delete(COOKIE);
}
