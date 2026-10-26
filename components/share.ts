export function shareToX(text: string, path: string) {
  const url = (process.env.NEXT_PUBLIC_SITE_URL || window.location.origin) + path;
  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank", "noopener,noreferrer");
}
