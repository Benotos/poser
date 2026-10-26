"use client";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "./Auth";
import Avatar from "./Avatar";

/** play with just a name. A wallet is optional and only needed to get paid. */
export default function JoinModal() {
  const { joinOpen, setJoinOpen, playAsGuest, signIn } = useAuth();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wantWallet, setWantWallet] = useState(false);

  // after the wallet modal connects, go straight to the signature
  useEffect(() => {
    if (wantWallet && connected) { setWantWallet(false); signIn().catch((e) => setErr(e.message)); }
  }, [wantWallet, connected, signIn]);

  if (!joinOpen) return null;
  if (typeof document === "undefined") return null;
  // portal to <body>: the sticky header has a backdrop blur, which traps fixed children inside it
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-labelledby="join-title"
      onMouseDown={(e) => e.target === e.currentTarget && setJoinOpen(false)}>
      <div className="card w-full max-w-md p-6">
        <div className="mb-5 flex items-center gap-3">
          <Avatar seed={name || "poser"} size={52} />
          <div>
            <h2 id="join-title" className="pixel text-xl">Make your poser</h2>
            <p className="text-sm text-mute">10 fake SOL, live coins, no wallet needed.</p>
          </div>
        </div>
        <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(await playAsGuest(name.trim())); setBusy(false); }}>
          <label className="text-sm text-mute" htmlFor="join-name">Leaderboard name</label>
          <input id="join-name" className="input mt-1" autoFocus maxLength={16} placeholder="username" value={name}
            onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))} />
          {err && <p className="mt-2 text-sm text-bleed">{err}</p>}
          <button className="btn-pop mt-4 w-full py-3" disabled={busy || name.length < 3}>{busy ? "Creating" : "Start playing"}</button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-mute"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>

        <button className="btn-ghost w-full" onClick={() => { setErr(null); if (connected) signIn().catch((e) => setErr(e.message)); else { setWantWallet(true); setVisible(true); } }}>
          Sign in with a wallet
        </button>
        <ul className="mt-4 space-y-1.5 text-xs text-mute">
          <li>• You only need a wallet to receive real SOL if you finish top 10. You can link it any time.</li>
          <li>• Signing in is a free message signature. It can't move funds, and POSER never asks you to approve a transaction.</li>
        </ul>
      </div>
    </div>
  , document.body);
}