"use client";
// Pixel confetti burst for winning trades. Respects reduced motion.
export function confetti(colors = ["#14f195", "#9945ff", "#ffd24d", "#4da3ff"]) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas");
  c.width = innerWidth; c.height = innerHeight;
  c.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:70";
  document.body.appendChild(c);
  const g = c.getContext("2d")!;
  const ps = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.6,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 16 - 6, s: 4 + Math.floor(Math.random() * 3) * 2,
    col: colors[Math.floor(Math.random() * colors.length)],
  }));
  let f = 0;
  const step = () => {
    g.clearRect(0, 0, c.width, c.height);
    ps.forEach((p) => { p.vy += 0.5; p.x += p.vx; p.y += p.vy; g.fillStyle = p.col; g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); });
    if (++f < 110) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}
