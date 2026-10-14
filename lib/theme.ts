"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "patrim-hub:theme";
// Posé dans <head> avant l'affichage pour éviter le flash de thème
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t;if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}`;

const ls = new Set<() => void>();
const get = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.documentElement.classList.toggle("dark", t === "dark");
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
