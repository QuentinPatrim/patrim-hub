"use client";

import { useSyncExternalStore } from "react";

// « dashboard » = thème sombre en verre dépoli posé sur une photo de fond (voir lib/fond.ts)
export type Theme = "light" | "dark" | "dashboard";
export const THEMES: Theme[] = ["light", "dark", "dashboard"];
export const THEME_KEY = "patrim-hub:theme";
// Fond de l'appli (= --bg de globals.css), repris par la barre d'état du téléphone
export const THEME_COLORS: Record<Theme, string> = { light: "#f7f5f1", dark: "#0b0d11", dashboard: "#1a0d10" };
// Posé dans <head> avant l'affichage pour éviter le flash de thème
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"&&t!=="dashboard"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;if(t!=="light")document.documentElement.classList.add("dark");var c=${JSON.stringify(THEME_COLORS)};var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[t])}catch(e){}`;

const ls = new Set<() => void>();
const get = (): Theme => {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || t === "dashboard" ? t : "light";
};

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle("dark", t !== "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[t]);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
  ls.forEach((l) => l());
}

/** Thème suivant du bouton de l'en-tête : clair → sombre → dashboard → clair. */
export const themeSuivant = (t: Theme): Theme => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      ls.add(cb);
      return () => ls.delete(cb);
    },
    get,
    () => "light" as Theme
  );
  return { theme, toggle: () => setTheme(themeSuivant(theme)) };
}
