export function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** opens a coin's X link from inside a clickable row without nesting links */
export function CoinX({ url }: { url?: string | null }) {
  if (!url) return null;
  const href = /^https?:\/\//.test(url) ? url : `https://x.com/${url.replace(/^@/, "")}`;
  return (
    <button type="button" aria-label="Open on X" title="Open on X" className="text-mute hover:text-white"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(href, "_blank", "noopener,noreferrer"); }}>
      <XIcon size={12} />
    </button>
  );
}

const norm = (u: string, base: string) => (/^https?:\/\//.test(u) ? u : base + u.replace(/^@/, ""));
const stop = (e: React.MouseEvent) => e.stopPropagation();

/** X, Telegram and website links for a coin row. Real links (never nested in another link), so they always open */
export function CoinSocials({ twitter, telegram, website, size = 12 }: { twitter?: string | null; telegram?: string | null; website?: string | null; size?: number }) {
  const btn = "pointer-events-auto relative z-10 flex h-5 w-5 items-center justify-center rounded transition";
  return (
    <span className="flex items-center gap-1">
      {twitter && (
        <a href={norm(twitter, "https://x.com/")} target="_blank" rel="noreferrer" onClick={stop} title="Open on X" aria-label="Open on X" className={btn + " bg-white/5 text-white/80 hover:bg-white hover:text-ink"}>
          <XIcon size={size - 2} />
        </a>
      )}
      {telegram && (
        <a href={norm(telegram, "https://t.me/")} target="_blank" rel="noreferrer" onClick={stop} title="Open Telegram" aria-label="Open Telegram" className={btn + " bg-[#29a9eb]/15 text-[#29a9eb] hover:bg-[#29a9eb] hover:text-white"}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M21.9 4.6 18.7 19.7c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.4l-4.8-1.5c-1-.3-1-1 .2-1.5L20.5 3.1c.9-.3 1.6.2 1.4 1.5z" /></svg>
        </a>
      )}
      {website && (
        <a href={norm(website, "https://")} target="_blank" rel="noreferrer" onClick={stop} title="Open website" aria-label="Open website" className={btn + " bg-mint/10 text-mint hover:bg-mint hover:text-ink"}>
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>
        </a>
      )}
    </span>
  );
}

/** copy a CA from inside a clickable row */
export function CopyCa({ mint }: { mint: string }) {
  return (
    <button type="button" title="Copy contract address" aria-label="Copy contract address"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(mint); const t = e.currentTarget; t.dataset.ok = "1"; setTimeout(() => delete t.dataset.ok, 900); }}
      className="num pointer-events-auto relative z-10 rounded px-1 text-[10px] text-mute hover:text-white data-[ok]:text-mint">
      {mint.slice(0, 4)}…{mint.slice(-4)}
    </button>
  );
}