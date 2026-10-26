import { Badge, TIER_COLOR } from "@/lib/xp";

const ICON: Record<string, string> = {
  first: "M3 9h10v2H3zm2-4h6v2H5zm2-4h2v2H7z", win: "M2 11l4-4 3 3 5-6v3l-5 6-3-3-4 4z", "2x": "M2 3h5v2H4v2h3v2H4v2h3v2H2zm7 0h2l1 3 1-3h2l-2 5 2 5h-2l-1-3-1 3H9l2-5z",
  "10x": "M3 3h2v10H3zm4 0h6v10H7zm2 2v6h2V5z", 100: "M2 3h12v2H2zm0 4h12v2H2zm0 4h12v2H2z", 1000: "M1 2h14v12H1zm2 2v8h10V4zm2 2h6v2H5z",
  green: "M7 1h2v4h4v2H9v8H7V7H3V5h4z", streak: "M8 1l2 4 4 1-3 3 1 5-4-2-4 2 1-5-3-3 4-1z", top10: "M4 2h8v4a4 4 0 01-8 0zm-3 1h3v2H1zm11 0h3v2h-3zM7 10h2v3h3v2H4v-2h3z",
  champ: "M2 4l3 3 3-5 3 5 3-3-1 8H3zm1 9h10v2H3z", bots: "M4 3h8v2h2v6h-2v2H4v-2H2V5h2zm1 3v2h2V6zm4 0v2h2V6zM6 10h4v1H6z", sharp: "M8 1l7 7-7 7-7-7zm0 3L4 8l4 4 4-4z",
};

export default function Badges({ list }: { list: Badge[] }) {
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {list.map((b) => (
        <li key={b.key} title={b.desc} className={"flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center " + (b.got ? "border-line bg-ink" : "border-dashed border-line opacity-40")}>
          <svg width="28" height="28" viewBox="0 0 16 16" fill={b.got ? TIER_COLOR[b.tier] : "#8e8e9c"} shapeRendering="crispEdges" aria-hidden><path d={ICON[b.key]} /></svg>
          <span className="text-xs font-semibold">{b.name}</span>
          <span className="text-[10px] leading-tight text-mute">{b.desc}</span>
        </li>
      ))}
    </ul>
  );
}
