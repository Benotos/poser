export function sol(n: number | null | undefined, d = 3) {
  if (n == null || !isFinite(n)) return "–";
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) });
}
export function compact(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
export function usd(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  return "$" + compact(n);
}
export function pct(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "–";
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
}
export function ago(ts: string | number | Date) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return Math.floor(s) + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
export function shortAddr(a: string) {
  return a.slice(0, 4) + "…" + a.slice(-4);
}
export function hms(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return [h, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}
