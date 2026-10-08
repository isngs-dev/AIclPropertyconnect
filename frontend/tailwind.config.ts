import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        fg: "var(--fg)",
        muted: "var(--muted)",
        line: "var(--line)",
        soft: "var(--soft)",
        navy: { DEFAULT: "#22236B", light: "#4DB8E8", deep: "#14154A", sky: "#1EA1DD" },
        brand: "var(--brand)",
        green: { DEFAULT: "#059669", light: "#34D399" },
        pink: { DEFAULT: "#EC4899", light: "#F472B6" },
        ok: "var(--ok-text)",
        warn: "var(--warn-text)",
        danger: "var(--danger-text)",
      },
      fontFamily: {
        heading: ["var(--font-sora)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: { card: "0 1px 2px rgba(15,11,31,.06), 0 8px 24px -12px rgba(20,21,74,.18)" },
      keyframes: {
        shake: { "0%,100%": { transform: "translateX(0)" }, "20%": { transform: "translateX(-8px)" }, "40%": { transform: "translateX(7px)" }, "60%": { transform: "translateX(-5px)" }, "80%": { transform: "translateX(3px)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: { shake: "shake .5s ease-in-out" },
    },
  },
  plugins: [],
};
export default config;
