"use client";
import { SearchProvider } from "./Search";
import { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";
import { AuthProvider } from "./Auth";
import { ToastProvider } from "./Toasts";
import { SocialProvider } from "./Social";

export default function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const wallets = useMemo(() => [], []); // Phantom, Solflare, Backpack etc. register via Wallet Standard
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <ToastProvider>
            <AuthProvider>
              <SocialProvider><SearchProvider>{children}</SearchProvider></SocialProvider>
            </AuthProvider>
          </ToastProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}