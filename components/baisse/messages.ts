"use client";

/* ============================================================
   Messages d'annonce d'une baisse de prix (SMS, WhatsApp, mail) :
   uniquement des informations publiques (prix honoraires inclus,
   caractéristiques, secteur), jamais le vendeur ni l'adresse.
   Rien n'est envoyé d'ici : le message s'ouvre pour relecture.
   ============================================================ */

import { getAll, update } from "@/lib/store";
import { eur, today } from "@/lib/format";
import { titrePublic } from "@/lib/titrePublic";
import type { Bien, Contact } from "@/lib/types";
import type { BaissePrix, BienBaisse, Cible } from "./baisse";

type Nom = { le: string; un: string; f: boolean };

/** « le T3 de 72 m² secteur Carmes » : de quoi reconnaître le bien, sans adresse ni vendeur. */
function nomDuBien(b: Bien): Nom {
  const surface = b.surface ? ` de ${b.surface.toLocaleString("fr-FR")} m²` : "";
  const lieu = b.quartier ? ` secteur ${b.quartier}` : b.ville ? ` à ${b.ville}` : "";
  const avec = (n: Nom) => ({ ...n, le: n.le + surface + lieu, un: n.un + surface + lieu });
  if (b.type === "appartement")
    return avec(b.pieces === 1 ? { le: "le studio", un: "un studio", f: false } : b.pieces ? { le: `le T${b.pieces}`, un: `un T${b.pieces}`, f: false } : { le: "l'appartement", un: "un appartement", f: false });
  return avec(
    {
      maison: { le: "la maison", un: "une maison", f: true },
      terrain: { le: "le terrain", un: "un terrain", f: false },
      local: { le: "le local", un: "un local", f: false },
      immeuble: { le: "l'immeuble", un: "un immeuble", f: false },
      parking: { le: "la place de parking", un: "une place de parking", f: true },
    }[b.type as Exclude<Bien["type"], "appartement">],
  );
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const bonjour = (c: Contact) => `Bonjour ${c.prenom || [c.civilite, c.nom].filter(Boolean).join(" ")},`;

export interface MessageBaisse {
  sms: string;
  sujet: string;
  mail: string;
}

/** SMS court et mail détaillé pour annoncer la baisse à un acquéreur. */
export function messageBaisse(b: Bien, x: Pick<Cible, "c" | "groupe" | "aVenir" | "grace">, baisse: Pick<BaissePrix, "de" | "a">): MessageBaisse {
  const n = nomDuBien(b);
  const e = n.f ? "e" : "";
  const prix = baisse.de != null && baisse.de > baisse.a ? `de ${eur(baisse.de)} à ${eur(baisse.a)}` : `à ${eur(baisse.a)}`;
  const annonce = b.annonceUrl ? `L'annonce : ${b.annonceUrl}` : "";

  // « du T3… », « de la maison… », « de l'appartement… »
  const du = n.le.replace(/^le /, "du ").replace(/^la /, "de la ").replace(/^l'/, "de l'");

  const sms = {
    visite: x.aVenir
      ? `Bonne nouvelle avant votre visite : le prix ${du} passe ${prix} honoraires inclus. À très bientôt.`
      : `Bonne nouvelle : ${n.le} que vous avez visité${e} passe ${prix} honoraires inclus. Souhaitez-vous qu'on en reparle ?`,
    propose: `${majuscule(n.le)} que je vous avais proposé${e} passe ${prix} honoraires inclus. Souhaitez-vous organiser une visite ?`,
    budget: `${majuscule(n.un)} correspondant à votre recherche vient de passer à ${eur(baisse.a)} honoraires inclus${x.grace ? ", dans votre budget" : ""}. Souhaitez-vous en savoir plus ?`,
  }[x.groupe];

  const accroche = {
    visite: x.aVenir ? `Bonne nouvelle avant votre visite : le prix ${du} vient de baisser.` : `Bonne nouvelle : le prix ${du} que vous avez visité${e} vient de baisser.`,
    propose: `Le prix ${du} que je vous avais proposé${e} vient de baisser.`,
    budget: `Je pense à vous pour ${n.un} qui correspond à votre recherche et dont le prix vient de baisser${x.grace ? ` : ${n.f ? "elle" : "il"} entre maintenant dans votre budget` : ""}.`,
  }[x.groupe];

  const visiter = `Si vous souhaitez ${n.f ? "la" : "le"} visiter, je vous propose quelques créneaux dès cette semaine. Dites-moi ce qui vous arrange.`;
  const suite = {
    visite: x.aVenir ? "Je vous retrouve comme prévu pour la visite." : "Souhaitez-vous qu'on en reparle, ou organiser une nouvelle visite ? Dites-moi ce qui vous arrange.",
    propose: visiter,
    budget: visiter,
  }[x.groupe];

  const carac = [
    b.type === "appartement" || b.type === "maison" ? (b.pieces ? `${b.pieces} pièce${b.pieces > 1 ? "s" : ""}` : "") : "",
    b.surface ? `${b.surface.toLocaleString("fr-FR")} m²` : "",
    b.exterieur ?? "",
    b.parking ?? "",
  ].filter(Boolean);

  const mail = [
    bonjour(x.c),
    "",
    accroche,
    "",
    titrePublic(b),
    carac.length ? `• ${carac.join(" · ")}` : null,
    `• Prix : ${eur(baisse.a)} honoraires inclus${baisse.de != null && baisse.de > baisse.a ? ` (au lieu de ${eur(baisse.de)})` : ""}`,
    b.dpe ? `• DPE : classe ${b.dpe}` : null,
    annonce ? `\n${annonce}` : null,
    "",
    suite,
    "",
    "Bien à vous,",
    "Quentin Delsol",
    "PATRIM Immobilier",
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return {
    sms: [bonjour(x.c), sms, annonce, "Quentin Delsol, PATRIM"].filter(Boolean).join("\n"),
    sujet: `Baisse de prix : ${titrePublic(b)}`,
    mail,
  };
}

export type Canal = "sms" | "whatsapp" | "mail" | "appel";

/**
 * Note l'acquéreur comme prévenu de la baisse (sur le bien et dans son historique).
 * Si la baisse n'était pas encore gardée sur le bien (prix changé hors de l'appli), elle l'est maintenant.
 */
export function marquerPrevenu(bienId: string, x: Cible, canal: Canal, baisse: Pick<BaissePrix, "de" | "a">) {
  const b = getAll("biens").find((y) => y.id === bienId) as BienBaisse | undefined;
  const c = getAll("contacts").find((y) => y.id === x.c.id);
  if (!b || !c) return;
  const now = new Date().toISOString();
  const actuelle = b.baisse?.a === baisse.a ? b.baisse : undefined;
  const deja = !!actuelle?.prevenus?.[c.id];
  update("biens", b.id, {
    baisse: { de: baisse.de, a: baisse.a, date: actuelle?.date ?? today(), prevenus: { ...(actuelle?.prevenus ?? {}), [c.id]: now } },
  } as Partial<Bien>);
  if (deja) return;
  update("contacts", c.id, {
    historique: [
      { date: now, type: canal === "mail" ? "mail" : canal === "appel" ? "appel" : "sms", texte: `Baisse de prix annoncée : ${b.titre} (${baisse.de != null ? `${eur(baisse.de)} → ` : ""}${eur(baisse.a)})` },
      ...(c.historique ?? []),
    ],
    dernierContact: now,
    // Un acquéreur trouvé par son budget : le bien compte aussi comme proposé.
    ...(x.groupe === "budget" && !c.biensProposes?.includes(b.id) ? { biensProposes: [...(c.biensProposes ?? []), b.id] } : {}),
  });
}
