import type { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata({ params }: { params: { name: string } }): Promise<Metadata> {
  const title = `${decodeURIComponent(params.name)}'s day on POSER`;
  const img = `/api/card/day/${params.name}?v=${Date.now().toString(36).slice(0, -3)}`;
  return { title, openGraph: { title, images: [img] }, twitter: { card: "summary_large_image", title, images: [img] } };
}

export default function Share({ params }: { params: { name: string } }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/card/day/${params.name}`} alt="Daily PnL card" className="w-full rounded-xl border border-line" />
      <div className="flex justify-center gap-3">
        <Link href="/terminal" className="btn-pop">Start trading</Link>
        <Link href={`/u/${params.name}`} className="btn-ghost">See profile</Link>
      </div>
    </div>
  );
}
