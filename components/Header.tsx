"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "./Auth";
import { useSocial } from "./Social";
import Avatar from "./Avatar";
import LevelChip from "./LevelChip";
import SettingsMenu from "./SettingsMenu";
import NameModal from "./NameModal";
import JoinModal from "./JoinModal";
import Ticker from "./Ticker";
import { XIcon } from "./XIcon";
import { SearchButton } from "./Search";
import { sol } from "@/lib/format";
import { START_SOL } from "@/lib/constants";

const NAV = [
  ["/", "Home"],
  ["/terminal", "Terminal"],
  ["/leaderboard", "Leaderboard"],
  ["/agents", "Bots"],
  ["/portfolio", "Portfolio"],
  ["/how", "Rules"],
];

export default function Header() {
  const path = usePathname();
  const { connected } = useWallet();
  const { me, signIn, signOut, loading, setJoinOpen } = useAuth();
  const { xp, rank } = useSocial();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ca = process.env.NEXT_PUBLIC_POSER_CA;
  const eq = me.entry?.equity_sol ?? START_SOL;
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-30 bg-ink/95 backdrop-blur">
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2.5" aria-label="POSER home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={34} height={34} className="px rounded-lg" />
            <span className="pixel sol-text text-2xl">POSER</span>
          </Link>
          <nav className="hidden gap-0.5 lg:flex">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href}
                className={"rounded-md px-3 py-1.5 text-sm " + (active(href) ? "bg-panel text-white" : "text-mute hover:text-white")}>
                {label}
              </Link>
            ))}
          </nav>
          <SearchButton className="hidden w-64 md:flex xl:w-80" wide />
          <div className="ml-auto flex items-center gap-2">
            {ca ? (
              <button onClick={() => navigator.clipboard.writeText(ca)} title="Copy contract address"
                className="hidden rounded-md border border-line px-2.5 py-2 text-xs text-mute hover:text-white xl:block">
                $POSER {ca.slice(0, 4)}…{ca.slice(-4)}
              </button>
            ) : (
              <span className="hidden rounded-md border border-line px-2.5 py-2 text-xs text-mute xl:block">$POSER CA soon</span>
            )}
            {process.env.NEXT_PUBLIC_X_URL && (
              <a href={process.env.NEXT_PUBLIC_X_URL} target="_blank" rel="noreferrer" aria-label="POSER on X" title="Follow POSER on X"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-line text-mute hover:text-white">
                <XIcon size={15} />
              </a>
            )}
            <SettingsMenu />
            {me.profile ? (
              <>
                <Link href="/portfolio" className="flex items-center gap-2.5 rounded-md bg-panel px-2.5 py-1.5">
                  <Avatar seed={me.profile.avatar_seed} size={26} />
                  <span className="hidden flex-col sm:flex">
                    <span className="text-xs font-semibold leading-tight">{me.profile.username}</span>
                    <LevelChip xp={xp} compact />
                  </span>
                  <span className="flex flex-col items-end leading-tight">
                    <span className={"num text-sm font-semibold " + (eq >= START_SOL ? "text-mint" : "text-bleed")}>{sol(eq, 2)}</span>
                    <span className="text-[10px] text-mute">{rank ? `#${rank} today` : "SOL"}</span>
                  </span>
                </Link>
                <button className="hidden text-xs text-mute hover:text-white sm:block"
                  onClick={() => { if (me.profile!.wallet || confirm("Guest accounts live in this browser. Signing out without a linked wallet loses this account. Sign out anyway?")) signOut(); }}>
                  Sign out
                </button>
              </>
            ) : !loading ? (
              <>
                {connected ? (
                  <button className="btn-ghost hidden sm:inline-flex" disabled={busy}
                    onClick={async () => { setErr(null); setBusy(true); try { await signIn(); } catch (e: any) { setErr(e.message); } setBusy(false); }}>
                    {busy ? "Check wallet" : "Wallet sign in"}
                  </button>
                ) : null}
                <button className="btn-pop" onClick={() => setJoinOpen(true)}>Play now</button>
              </>
            ) : null}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={"whitespace-nowrap rounded-md px-3 py-1 text-sm " + (active(href) ? "bg-panel text-white" : "text-mute")}>{label}</Link>
          ))}
        </nav>
      </div>
      <Ticker />
      {err && <p className="bg-bleed/15 px-4 py-2 text-center text-sm text-bleed">{err}</p>}
      <NameModal />
      <JoinModal />
    </header>
  );
}