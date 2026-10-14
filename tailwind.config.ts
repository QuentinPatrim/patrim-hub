import type { Config } from "tailwindcss";

// Charte PATRIM : bordeaux, anthracite, filet corail, encre. Les couleurs passent par des variables CSS
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
        xs: "0 1px 2px rgb(var(--shadow) / 0.05)",
        card: "0 1px 2px rgb(var(--shadow) / 0.04), 0 4px 12px -4px rgb(var(--shadow) / 0.05), 0 16px 32px -20px rgb(var(--shadow) / 0.12)",
        lift: "0 2px 4px rgb(var(--shadow) / 0.05), 0 12px 28px -8px rgb(var(--shadow) / 0.14), 0 28px 56px -28px rgb(var(--shadow) / 0.22)",
        btn: "inset 0 1px 0 rgb(255 255 255 / 0.14), 0 1px 2px rgb(60 10 14 / 0.25), 0 6px 16px -8px rgb(108 25 30 / 0.6)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.25), 0 12px 32px -12px rgb(108 25 30 / 0.4)",
        nav: "0 -1px 0 rgb(var(--line) / 0.6), 0 -8px 24px -12px rgb(var(--shadow) / 0.12)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(8px)" }, to: { opacity: "1", transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "sheet-up": { from: { transform: "translateY(24px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        shimmer: { from: { backgroundPosition: "-200% 0" }, to: { backgroundPosition: "200% 0" } },
      },
      animation: { "fade-up": "fade-up .45s cubic-bezier(.22,1,.36,1) both", "fade-in": "fade-in .2s ease-out both", "sheet-up": "sheet-up .35s cubic-bezier(.22,1,.36,1) both", shimmer: "shimmer 1.6s linear infinite" },
    },
  },
  plugins: [],
} satisfies Config;
