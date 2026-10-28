"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/* ============================================================
   Bouton retour : revenir là d'où l'on vient, comme le geste
   retour du téléphone, au lieu d'un lien fixe vers une page.
   - Chaque page visitée dans l'appli est numérotée dans
     l'historique du navigateur (0 = première page ouverte).
   - « Retour » remonte l'historique s'il y a une page de
     l'appli avant ; sinon il ouvre la page parente logique
     (ex. offre → fiche du bien → liste des biens).
   - Les parcours en plusieurs étapes (fiche vendeur, estimation…)
     ajoutent une entrée par étape : le geste retour revient à
     l'étape précédente au lieu de quitter la page.
   ============================================================ */

const PROF = "__patrimProf";
const CHEMINS = "patrim-hub:chemins";

type Etat = Record<string, unknown> | null;
const etat = () => (typeof window === "undefined" ? null : (window.history.state as Etat));

let courante = -1;
let remplace = false;
let chemins: Record<number, string> = {};

function lireChemins() {
  try {
    chemins = JSON.parse(sessionStorage.getItem(CHEMINS) || "{}");
  } catch {
    chemins = {};
  }
}
function noterChemin(prof: number) {
  chemins[prof] = window.location.pathname;
  try {
    sessionStorage.setItem(CHEMINS, JSON.stringify(chemins));
  } catch {
    /* stockage indisponible : la mémoire suffit pour la session */
  }
}

/** Numérote l'entrée d'historique courante si elle ne l'est pas encore. */
function marquer(depuisRetour: boolean) {
  const s = etat() ?? {};
  const n = s[PROF];
  if (typeof n === "number") courante = n;
  else {
    // Entrée nouvelle (lien, bouton) : une de plus. Atteinte par le geste retour sans numéro : une de moins.
    // Page remplacée par « Retour » : même rang.
    courante = depuisRetour ? Math.max(0, courante - 1) : remplace ? Math.max(0, courante) : courante + 1;
    window.history.replaceState({ ...s, [PROF]: courante }, "");
  }
  remplace = false;
  noterChemin(courante);
}

/** À appeler une fois, tout en haut de l'appli. */
export function useSuiviRetour() {
  const path = usePathname();
  useEffect(() => {
    lireChemins();
    const onPop = () => marquer(true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    marquer(false);
  }, [path]);
}

const sansQuery = (href: string) => href.split(/[?#]/)[0];

/**
 * Retour intelligent.
 * - par défaut : page précédente de l'appli s'il y en a une, sinon `parent`.
 * - `parentSeulement` : revient en arrière seulement si la page précédente est `parent`
 *   (ex. « Modifier » sur un PDF ramène au formulaire), sinon ouvre `parent` à la place
 *   de la page actuelle, pour ne pas tourner en rond.
 */
export function useRetour(parent: string, opts?: { parentSeulement?: boolean }) {
  const router = useRouter();
  const seul = opts?.parentSeulement;
  return useCallback(() => {
    const n = etat()?.[PROF];
    if (typeof n === "number" && n > 0) {
      // Saute les étapes de la page actuelle : « Retour » quitte la page.
      const ici = window.location.pathname;
      let k = n - 1;
      while (k > 0 && chemins[k] === ici) k--;
      if (chemins[k] !== ici && (!seul || chemins[k] === sansQuery(parent))) {
        window.history.go(k - n);
        return;
      }
    }
    remplace = true;
    router.replace(parent);
  }, [router, parent, seul]);
}

/**
 * Étapes d'un parcours reliées à l'historique : `aller(v)` ajoute une entrée,
 * le geste retour (ou `aller` vers l'étape précédente) revient d'une étape.
 * `appliquer` affiche l'étape demandée.
 */
export function useEtapesHistorique<T extends string | number>(cle: string, valeur: T, appliquer: (v: T) => void) {
  const K = `__patrimEtape_${cle}`;
  const val = useRef(valeur);
  val.current = valeur;
  const app = useRef(appliquer);
  app.current = appliquer;
  const pile = useRef<T[]>([]);

  useEffect(() => {
    const onPop = () => {
      const v = etat()?.[K] as T | undefined;
      if (v === undefined) return;
      const p = pile.current;
      while (p.length > 1 && p[p.length - 1] !== v) p.pop();
      app.current(v);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [K]);

  return useCallback(
    (v: T) => {
      const cur = val.current;
      if (v === cur) return;
      const p = pile.current;
      if (p.length > 1 && p[p.length - 2] === v) {
        window.history.back();
        return;
      }
      // Fige l'étape affichée sur l'entrée actuelle, puis ajoute l'étape suivante.
      const s = etat() ?? {};
      window.history.replaceState({ ...s, [K]: cur }, "");
      const prof = typeof s[PROF] === "number" ? (s[PROF] as number) + 1 : 1;
      window.history.pushState({ ...s, [K]: v, [PROF]: prof }, "");
      courante = prof;
      noterChemin(prof);
      if (!p.length) p.push(cur);
      p.push(v);
      app.current(v);
    },
    [K]
  );
}
