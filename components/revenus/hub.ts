/* ============================================================
   Ventes en cours lues sur les fiches des biens du Hub (sous
   offre, compromis), pour le prévisionnel de « Mes revenus ».
   Un bien déjà suivi dans les dossiers (même bien, même mandat,
   même propriétaire ou même adresse) n'est pas compté deux fois.
   ============================================================ */

import type { Bien, Contact } from "@/lib/types";
import { honorairesDe } from "@/components/chiffres/chiffres";
import { VENTE_EN_COURS, offreRetenue, venteDe } from "@/components/vente/vente";
import type { Contrat, VenteRevenu } from "./revenus";

const normal = (t?: string) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const VIDES = new Set(["sci", "indivision", "madame", "monsieur", "mme", "succession", "vente", "epoux", "consorts", "et"]);
const mots = (t?: string) => normal(t).split(" ").filter((m) => m.length >= 3 && !VIDES.has(m) && !/^\d+$/.test(m));

/** Le dossier suit-il déjà ce bien ? */
function memeDossier(v: VenteRevenu, b: Bien, noms: Set<string>) {
  if (v.bienId === b.id || v.cle === `bien:${b.id}`) return true;
  if ((v.type ?? "vente") !== "vente") return false;
  const num = (t?: string) => (t ?? "").replace(/\D/g, "");
  if (num(v.mandat) && num(v.mandat) === num(b.mandat?.numero)) return true;
  if (mots(v.libelle).some((m) => noms.has(m))) return true;
  const a = normal(v.adresse);
  const ab = normal(b.adresse);
  return a.length >= 8 && ab.length >= 8 && (ab.includes(a) || a.includes(ab));
}

export function dossiersDuHub(biens: Bien[], contacts: Contact[], ventes: VenteRevenu[], contrat: Contrat, auj: string): VenteRevenu[] {
  const ignores = new Set(contrat.ignores ?? []);
  const parId = new Map(contacts.map((c) => [c.id, c]));
  const out: VenteRevenu[] = [];
  for (const b of biens) {
    const s = venteDe(b);
    const enCours = VENTE_EN_COURS(b) || (b.statut === "vendu" && !!s.acteSigne && s.acteSigne > auj);
    if (!enCours || ignores.has(b.id) || (s.acteSigne && s.acteSigne <= auj)) continue;
    const vendeurs = (b.vendeurIds ?? []).map((id) => parId.get(id)).filter((c): c is Contact => !!c);
    const noms = new Set(vendeurs.flatMap((c) => mots(c.nom)));
    if (ventes.some((v) => memeDossier(v, b, noms))) continue;
    const offre = offreRetenue(b);
    const signe = !!s.signature && s.signature <= auj;
    out.push({
      id: `hub:${b.id}`,
      nature: "vente",
      type: "vente",
      libelle: vendeurs.length ? [...new Set(vendeurs.map((c) => c.nom.toUpperCase()))].join(" / ") : b.titre,
      adresse: b.adresse || undefined,
      mandat: b.mandat?.numero,
      prixVente: offre?.prix ?? b.prix,
      honoraires: honorairesDe(b),
      dateOffre: offre?.date,
      dateCompromis: s.signature,
      dateActe: s.acteSigne ?? s.acte,
      statut: b.statut === "compromis" || signe || b.statut === "vendu" ? "compromis" : "offre",
      partage: 1,
      source: "saisie",
      cle: `bien:${b.id}`,
      bienId: b.id,
      updatedAt: "",
    });
  }
  return out;
}
