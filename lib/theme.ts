"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "patrim-hub:theme";
// Fond de l'appli (= --bg de globals.css), repris par la barre d'état du téléphone
export const THEME_COLORS: Record<Theme, string> = { light: "#f7f5f1", dark: "#0b0d11" };
// Posé dans <head> avant l'affichage pour éviter le flash de thème
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;if(t==="dark")document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?"${"#0b0d11"}":"${"#f7f5f1"}")}catch(e){}`;

const ls = new Set<() => void>();
const get = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle("dark", t === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[t]);
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {}
  ls.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      ls.add(cb);
      return () => ls.delete(cb);
    },
    get,
    () => "light" as Theme
  );
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
