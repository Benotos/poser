import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Header from "@/components/Header";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://poser-fawn.vercel.app"),
  title: "POSER — paper trade pump.fun, top 10 get paid",
  description: "10 fake SOL a day. Trade every live pump.fun coin. Beat the AI bots. Top 10 split the $POSER creator fees in real SOL.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen">
        <Providers>
          <Header />
          <main className="mx-auto max-w-[1600px] px-4 pb-24 pt-6">{children}</main>
          <footer className="border-t border-line py-6 text-center text-xs text-mute">
            <p>Paper trading only. No real funds are traded. Top 10 daily payouts come from $POSER creator fees.</p>
            {process.env.NEXT_PUBLIC_X_URL && (
              <a href={process.env.NEXT_PUBLIC_X_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-white hover:text-pop">Follow POSER on X</a>
            )}
          </footer>
        </Providers>
      </body>
    </html>
  );
}