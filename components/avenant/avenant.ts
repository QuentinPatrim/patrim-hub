"use client";

/* ============================================================
   Avenant au mandat de vente : nouveau prix, nouveaux honoraires
   (et, au besoin, une autre modification écrite à la main).
   Même fonctionnement que le mandat : brouillon sur l'appareil,
   copie gardée sur la fiche du bien, PDF prêt pour ICSIGN.
   ============================================================ */

import { adresseComplete } from "@/components/biens/utils";
import { dossierDe } from "@/components/biens/dossier";
import { CHAMPS, manquants, partieDepuisContact, type Champ, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import { retenirSignataire, signataireRetenu, type Signataire } from "@/components/mandat/mandat";
import type { Acte } from "@/components/documents/archive";
import { today } from "@/lib/format";
import type { Bien, MandatType } from "@/lib/types";

/** Pour un avenant, l'identité et les coordonnées de signature suffisent (l'état civil complet est au mandat). */
export const CHAMPS_AVENANT: Champ[] = CHAMPS.filter((c) => ["prenom", "nom", "adresse", "email", "tel"].includes(c.key));

export interface ConditionsPrix {
  netVendeur?: number;
  honoraires?: number;
  charge?: "acquereur" | "vendeur";
}

export interface Avenant {
  bienId: string;
  /** Copie gardée sur la fiche du bien (voir components/documents/archive.ts). */
  acteId?: string;
  numero?: string;
  mandatNumero?: string;
  mandatDate?: string; // AAAA-MM-JJ
  mandatType?: MandatType;
  mandants: Partie[];
  adresseBien: string;
  /** Prix et honoraires du mandat (ou du dernier avenant), quand ils sont connus. */
  ancien: ConditionsPrix;
  /** D'où vient l'ancien prix, pour le rappeler à l'écran. */
  ancienSource?: "acte" | "dossier";
  nouveau: ConditionsPrix & { charge: "acquereur" | "vendeur" };
  autres?: string;
  signataire: Signataire;
  date: string;
  maj: string;
}

export const prixPresentation = (c: ConditionsPrix) => (c.netVendeur != null && c.honoraires != null ? c.netVendeur + c.honoraires : undefined);

/** Nombre d'informations encore manquantes (elles sortent en [À compléter] dans le PDF). */
export function manquantsAvenant(a: Avenant) {
  const vides = [a.mandatNumero, a.mandatDate, a.nouveau.netVendeur, a.signataire.email, a.signataire.tel].filter((x) => !x).length;
  return a.mandants.reduce((n, p) => n + manquants(p, CHAMPS_AVENANT).length, 0) + vides + (a.nouveau.honoraires != null ? 0 : 1);
}

/* ---------- Brouillon sur l'appareil ---------- */

const cle = (bienId: string) => `patrim-hub:avenant:${bienId}`;

export function lireAvenant(bienId: string): Avenant | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? (JSON.parse(raw) as Avenant) : null;
  } catch {
    return null;
  }
}
export function ecrireAvenant(a: Avenant) {
  try {
    localStorage.setItem(cle(a.bienId), JSON.stringify({ ...a, maj: new Date().toISOString() }));
  } catch {}
  retenirSignataire(a.signataire);
}
export function effacerAvenant(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}

/* ---------- Brouillon de départ ---------- */

const montant = (s: string) => Number(s.replace(/\D/g, ""));
const NOMBRE = String.raw`(\d{1,3}(?:[\s  .]\d{3})+|\d+)`;
/** « 550 000 € net vendeur + 20 000 € d'honoraires » (ou « 440 000 € net + 17 000 € ») */
const PRIX_MANDAT = new RegExp(`${NOMBRE}\\s?€ net(?: vendeur)?\\s?\\+\\s?${NOMBRE}\\s?€`);

/** Prix du mandat tel que le dossier du bien le cite (point « Prix : … le mandat prévoit … »). À vérifier. */
export function prixMandatDuDossier(b: Bien): ConditionsPrix | undefined {
  for (const p of dossierDe(b)?.aVerifier ?? []) {
    if (!/^Prix\s?:/.test(p) || !/mandat/i.test(p)) continue;
    const m = p.match(PRIX_MANDAT);
    if (m) return { netVendeur: montant(m[1]), honoraires: montant(m[2]) };
  }
}

/** Prix en vigueur avant l'avenant : dernier avenant signé, sinon mandat signé gardé sur la fiche, sinon le dossier. */
function prixEnVigueur(b: Bien, actes: Acte[]): { prix: ConditionsPrix; source: Avenant["ancienSource"] } | undefined {
  const signes = actes.filter((a) => a.statut === "signe").sort((x, y) => y.maj.localeCompare(x.maj));
  for (const a of signes) {
    if (a.kind === "avenant" && (!b.mandat?.numero || a.data.mandatNumero === b.mandat.numero)) return { prix: { ...a.data.nouveau }, source: "acte" };
    if (a.kind === "mandat" && (!b.mandat?.numero || a.data.numero === b.mandat.numero))
      return { prix: { netVendeur: a.data.netVendeur, honoraires: a.data.honoraires, charge: a.data.charge }, source: "acte" };
  }
  const dossier = prixMandatDuDossier(b);
  return dossier ? { prix: dossier, source: "dossier" } : undefined;
}

export function avenantInitial(b: Bien, vendeurs: ContactEtatCivil[], actes: Acte[]): Avenant {
  const honoraires = b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined);
  const avant = prixEnVigueur(b, actes);
  const deja = actes.filter((a) => a.kind === "avenant" && a.data.mandatNumero === b.mandat?.numero).length;
  return {
    bienId: b.id,
    numero: String(deja + 1),
    mandatNumero: b.mandat?.numero,
    mandatDate: b.mandat?.debut,
    mandatType: b.mandat?.type,
    mandants: vendeurs.map(partieDepuisContact),
    adresseBien: adresseComplete(b),
    ancien: avant?.prix ?? {},
    ancienSource: avant?.source,
    nouveau: {
      netVendeur: b.netVendeur ?? (b.prix && honoraires != null ? b.prix - honoraires : undefined),
      honoraires,
      charge: b.honorairesCharge ?? avant?.prix.charge ?? "acquereur",
    },
    signataire: signataireRetenu(),
    date: today(),
    maj: new Date().toISOString(),
  };
}

/** Point « à vérifier » du dossier qui appelle un avenant (« Prix : … aucun avenant trouvé »). */
export const pointAvenant = (texte: string) => /^Prix\s?:/.test(texte) && /\b(aucun|sans) avenant/i.test(texte);

export const titreAvenant = (a: Pick<Avenant, "numero" | "mandatNumero">) =>
  `Avenant${a.numero ? ` n° ${a.numero}` : ""} au mandat${a.mandatNumero ? ` n° ${a.mandatNumero}` : ""}`;
