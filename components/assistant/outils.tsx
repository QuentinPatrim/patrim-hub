"use client";

/* Petits outils de l'Assistant : copier, partager, message bref en haut de l'écran. */

import { Check } from "lucide-react";
import { useCallback, useRef, useState } from "react";

/** Copie un texte dans le presse-papiers (avec repli pour les vieux navigateurs). */
export async function copier(texte: string) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = texte;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/** Partage natif (téléphone). Renvoie "partage" | "copie" | "annule". */
export async function partager(data: { title?: string; text: string }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(data);
      return "partage" as const;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "annule" as const;
    }
  }
  await copier(data.text);
  return "copie" as const;
}

/** Message bref affiché en haut de l'écran ("Copié", "Enregistré"…). */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  const node = msg ? (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+68px)] lg:top-6 z-[70] flex justify-center px-4">
      <div className="animate-fade-up flex items-center gap-2 rounded-full bg-ink px-4 h-10 text-sm font-medium text-white shadow-2xl">
        <Check size={16} className="text-coral" /> {msg}
      </div>
    </div>
  ) : null;
  return { toast, node };
}
