// Deterministic pixel avatar from a seed. Placeholder until the final mascot art lands.
const SKINS = ["#f5e9ff", "#ffd7b5", "#c98b5e", "#8d5a3b", "#9df5c8", "#b9c4ff", "#ffb3e6"];
const HATS = ["#9945ff", "#14f195", "#ffd24d", "#4da3ff", "#ff7a45", "#b07aff", "#ff4d6a"];
const LENS = ["#14f195", "#9945ff", "#4da3ff", "#ffd24d"];

function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507)), (h >>> 0) / 4294967296);
}

export function avatarSvg(seed: string, bot = false): string {
  const r = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const skin = bot ? "#c7ccd9" : pick(SKINS);
  const hat = pick(HATS);
  const lens = pick(LENS);
  const hatStyle = Math.floor(r() * 3);
  const px: string[] = [];
  const p = (x: number, y: number, c: string) => px.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`);
  // face 2..9 x 4..11
  for (let y = 4; y < 12; y++) for (let x = 2; x < 10; x++) p(x, y, skin);
  // hat
  if (hatStyle === 0) { for (let x = 2; x < 10; x++) { p(x, 2, hat); p(x, 3, hat); } for (let x = 6; x < 12; x++) p(x, 4, hat); }
  else if (hatStyle === 1) { for (let x = 3; x < 9; x++) p(x, 1, hat); for (let x = 2; x < 10; x++) { p(x, 2, hat); p(x, 3, hat); } }
  else { [3, 5, 7].forEach((x) => p(x, 1, hat)); for (let x = 2; x < 10; x++) { p(x, 2, hat); p(x, 3, hat); } }
  // shades
  for (let x = 1; x < 11; x++) p(x, 6, "#111");
  [3, 4, 7, 8].forEach((x) => p(x, 7, "#111"));
  p(3, 7, lens); p(7, 7, lens);
  // mouth
  if (bot) { [4, 5, 6, 7].forEach((x) => p(x, 10, "#111")); p(5, 0, "#ff4d6a"); p(5, 1, "#888"); }
  else { [5, 6].forEach((x) => p(x, 10, "#9945ff")); p(4, 9, "#111"); }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${px.join("")}</svg>`;
}

export const avatarUri = (seed: string, bot = false) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(avatarSvg(seed, bot));
