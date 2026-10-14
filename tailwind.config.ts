import type { Config } from "tailwindcss";

// Charte PATRIM : encre, or, crème. Les couleurs passent par des variables CSS
// (app/globals.css) pour gérer le thème clair / sombre.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0d1420", 2: "#141d2c", 3: "#1c2738" },
        brand: { DEFAULT: "#6c191e", light: "#8e2a30", dark: "#4f1115", 50: "#fbf3f3" },
        coral: "#ef402a",
        slate: { patrim: "#4a4f55" },
        gold: { DEFAULT: "#c9a35b", light: "#e2c98f" },
        cream: "#f6f1e7",
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        accent: v("accent"),
        ok: v("ok"),
        warn: v("warn"),
        danger: v("danger"),
      },
      fontFamily: {
        serif: ['"Playfair Display"', "Georgia", "serif"],
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "20px" },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)",
        glow: "0 0 0 1px rgb(108 25 30 / 0.35), 0 12px 32px -12px rgb(108 25 30 / 0.45)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      animation: { "fade-up": "fade-up .35s ease-out both", shimmer: "shimmer 1.6s linear infinite" },
    },
  },
  plugins: [],
} satisfies Config;
