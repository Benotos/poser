import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050505",
        panel: "#0f0f12",
        line: "#1f1f26",
        mute: "#8e8e9c",
        pop: "#9945ff",
        mint: "#14f195",
        bleed: "#ff4d6a",
        sun: "#ffd24d",
      },
      fontFamily: {
        pixel: ["Silkscreen", "monospace"],
        sans: ["'Schibsted Grotesk'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
