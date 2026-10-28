"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { refreshAll } from "@/lib/store";
import { chargerMoi, conseiller, viderAppareil } from "@/lib/equipe";

/** Avec Supabase configuré, l'appli exige une connexion. Sinon, mode local. */
export function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  // Fiche d'un bien envoyée à un acquéreur, fiche de renseignements d'un candidat locataire, fiche vendeur ou acquéreur : sans compte.
  const publique = path.startsWith("/imprimer/partage/") || path.startsWith("/imprimer/vendeur/") || path.startsWith("/b/") || path.startsWith("/renseignements/") || path.startsWith("/informations/");
  const [ok, setOk] = useState(!supabase || publique);

  useEffect(() => {
    if (!supabase || publique) return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session && !path.startsWith("/connexion")) return router.replace("/connexion");
      // Un autre compte s'est connecté sur cet appareil : on n'affiche jamais les fiches du précédent
      const avant = conseiller().userId;
      if (data.session && avant && avant !== data.session.user.id) {
        viderAppareil();
        return window.location.reload();
      }
      if (data.session) void chargerMoi();
      setOk(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN") {
        const avant = conseiller().userId;
        if (avant && session && avant !== session.user.id) {
          viderAppareil();
          return window.location.replace("/");
        }
        void chargerMoi(true);
        refreshAll();
      }
      if (event === "SIGNED_OUT") {
        // Rien ne reste sur l'appareil après une déconnexion
        viderAppareil();
        window.location.replace("/connexion");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [path, router, publique]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (!ok && !path.startsWith("/connexion")) return <div className="min-h-dvh grid place-items-center"><div className="size-8 rounded-full border-2 border-accent border-r-transparent animate-spin" /></div>;
  return <>{children}</>;
}
