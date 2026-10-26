"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

export type Me = {
  profile: { id: string; username: string; avatar_seed: string; wallet: string | null; bio: string | null } | null;
  entry?: { cash_sol: number; equity_sol: number; realized_sol: number; trades: number };
  positions?: any[];
};

type Ctx = {
  me: Me;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  playAsGuest: (username: string) => Promise<string | null>;
  linkWallet: () => Promise<void>;
  joinOpen: boolean;
  setJoinOpen: (v: boolean) => void;
  needsName: boolean;
  submitName: (name: string) => Promise<string | null>;
  cancelName: () => void;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect } = useWallet();
  const [me, setMe] = useState<Me>({ profile: null });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{ wallet: string; signature: string } | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ profile: null }));
    setMe(r);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // switching wallets in the extension logs you out of the old account
  useEffect(() => {
    if (me.profile?.wallet && publicKey && me.profile.wallet !== publicKey.toBase58()) {
      fetch("/api/auth/logout", { method: "POST" }).then(refresh);
    }
  }, [publicKey, me.profile, refresh]);

  const signWith = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error("Connect a wallet that supports message signing");
    const wallet = publicKey.toBase58();
    const { message, error } = await fetch("/api/auth/nonce", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }),
    }).then((r) => r.json());
    if (error) throw new Error(error);
    const sig = await signMessage(new TextEncoder().encode(message));
    return { wallet, signature: bs58.encode(sig) };
  }, [publicKey, signMessage]);

  const linkWallet = useCallback(async () => {
    const { wallet, signature } = await signWith();
    const r = await fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, signature, link: true }),
    }).then((r) => r.json());
    if (r.error) throw new Error(r.error);
    await refresh();
  }, [signWith, refresh]);

  const playAsGuest = useCallback(async (username: string) => {
    const r = await fetch("/api/auth/guest", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username }),
    }).then((r) => r.json()).catch(() => ({ error: "network" }));
    if (r.error) return r.error === "too_many_accounts" ? "Too many new accounts from this network. Try later." : r.error as string;
    setJoinOpen(false);
    await refresh();
    return null;
  }, [refresh]);

  const signing = useRef(false);
  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error("Connect a wallet that supports message signing");
    // one sign in at a time, a second one would ask the wallet to sign a different message
    if (signing.current) return;
    signing.current = true;
    try { await doSignIn(); } finally { signing.current = false; }
  }, [publicKey, signMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSignIn = useCallback(async () => {
    if (!publicKey || !signMessage) throw new Error("Connect a wallet that supports message signing");
    const wallet = publicKey.toBase58();
    const { message, error } = await fetch("/api/auth/nonce", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }),
    }).then((r) => r.json());
    if (error) throw new Error(error);
    const sig = await signMessage(new TextEncoder().encode(message));
    const signature = bs58.encode(sig);
    const r = await fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, signature, message }),
    }).then((r) => r.json());
    if (r.needsUsername) { setJoinOpen(false); return setPending({ wallet, signature }); }
    if (r.error) throw new Error(r.error);
    setJoinOpen(false);
    await refresh();
  }, [publicKey, signMessage, refresh]);

  const submitName = useCallback(async (username: string) => {
    if (!pending) return "Sign in again";
    const r = await fetch("/api/auth/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...pending, username }),
    }).then((r) => r.json());
    if (r.error) return r.error as string;
    setPending(null);
    await refresh();
    return null;
  }, [pending, refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await disconnect().catch(() => {});
    await refresh();
  }, [disconnect, refresh]);

  return (
    <AuthCtx.Provider value={{ me, loading, refresh, signIn, signOut, playAsGuest, linkWallet, joinOpen, setJoinOpen, needsName: !!pending, submitName, cancelName: () => setPending(null) }}>
      {children}
    </AuthCtx.Provider>
  );
}