"use client";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "./Auth";
import { useToast } from "./Toasts";

/** shown to guests: link a wallet before reset to be eligible for payouts */
export default function LinkWalletBanner() {
  const { me, linkWallet } = useAuth();
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const toast = useToast();
  const [want, setWant] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try { await linkWallet(); toast({ tone: "mint", title: "Wallet linked", body: "You're eligible for payouts." }); }
    catch (e: any) { toast({ tone: "bleed", title: e.message }); }
    setBusy(false);
  };
  useEffect(() => { if (want && connected) { setWant(false); go(); } }, [want, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me.profile || me.profile.wallet) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sun/40 bg-sun/10 px-4 py-3 text-sm">
      <p className="flex-1">
        <span className="font-semibold text-sun">You're playing as a guest.</span>{" "}
        <span className="text-mute">Link a wallet before 00:00 UTC to get paid if you finish top 10. It's one free signature that can't move funds.</span>
      </p>
      <button className="btn-pop px-4 py-1.5 text-sm" disabled={busy} onClick={() => (connected ? go() : (setWant(true), setVisible(true)))}>
        {busy ? "Check wallet" : "Link wallet"}
      </button>
    </div>
  );
}
