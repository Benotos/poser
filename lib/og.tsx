// Shared bits for the PnL share cards (next/og, edge runtime)
import { avatarSvg } from "./avatar";

export async function pixelFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Silkscreen:wght@700&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export const avatarData = (seed: string, bot = false) =>
  `data:image/svg+xml;base64,${btoa(avatarSvg(seed, bot))}`;

export const C = { ink: "#050505", panel: "#0f0f12", line: "#1f1f26", pop: "#9945ff", mint: "#14f195", bleed: "#ff4d6a", sun: "#ffd24d", mute: "#8e8e9c", text: "#f2f2f5" };

export function Frame({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.ink, padding: 56, position: "relative",
      border: `10px solid ${accent}`, fontFamily: "Pixel, sans-serif", color: C.text }}>
      {children}
    </div>
  );
}
