/* ============================================================
   Annonce d'un bien, prête à saisir dans ICS (qui la diffuse sur
   les portails). Texte au format de l'agence (accroche QUARTIER /
   rue, un seul paragraphe, coordonnées, prix) suivi des mentions
   obligatoires, calculées à partir de la fiche :
   - vente : prix honoraires inclus, honoraires en % TTC et à la
     charge de qui, net vendeur, copropriété (lots, charges,
     procédures), DPE/GES, coût estimé de l'énergie, « logement à
     consommation énergétique excessive » en F ou G ;
   - location : loyer charges comprises, charges (provision ou
     forfait), dépôt de garantie, honoraires locataire dont état des
     lieux, meublé ou vide, surface habitable, DPE/GES et coût.
   Rien de ce que contient le dossier confidentiel n'est repris.
   ============================================================ */

import { locationDe, locationSeule } from "@/components/location/bienLocation";
import { ventilerHonoraires } from "@/components/location/loi";
import type { Bien } from "@/lib/types";

export interface InfosAnnonce {
  /** Corps de l'annonce (description), modifiable ; les mentions sont ajoutées en dessous. */
  corps?: string;
  /** Rue ou repère pour l'accroche (« GRAND-ROND / rue de Tivoli »). */
  rue?: string;
  dpeKwh?: number;
  gesKg?: number;
  energieMin?: number;
  energieMax?: number;
  energieAnnee?: number;
  /** Procédure en cours dans la copropriété ; vide = aucune. */
  procedure?: string;
  /** Location : charges au forfait (sinon provision avec régularisation annuelle). */
  forfait?: boolean;
  /** Location : date de disponibilité. */
  dispo?: string;
  /** Date où l'annonce a été saisie dans ICS. */
  ics?: string;
}

export type BienAnnonce = Bien & { annonce?: InfosAnnonce };
export const annonceDe = (b: Bien): InfosAnnonce => (b as BienAnnonce).annonce ?? {};

export const TEL_AGENCE = "05.61.99.08.08";

const nb = (n: number, dec = 2) => n.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ /g, " ");
const euros = (n: number) => `${nb(n)} €`;
const entier = (n: number) => n.toLocaleString("fr-FR").replace(/ /g, " ");
const trou = (quoi: string) => `[À compléter : ${quoi}]`;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const dateTexte = (ymd: string) => {
  const [a, m, j] = ymd.split("-").map(Number);
  return `${j === 1 ? "1er" : j} ${MOIS[m - 1]} ${a}`;
};

export const enCopro = (b: Bien) => !!b.lotsCopro || b.type === "appartement";
export const passoire = (b: Bien) => b.dpe === "F" || b.dpe === "G";

/** Taux d'honoraires TTC en % du net vendeur (vente). */
export function tauxHonoraires(b: Bien) {
  const net = b.netVendeur ?? (b.prix && b.honoraires ? b.prix - b.honoraires : undefined);
  if (!net || !b.honoraires) return undefined;
  return Math.round((b.honoraires / net) * 10000) / 100;
}

const etageTexte = (b: Bien) => {
  if (b.etage == null) return trou("étage");
  if (b.etage === 0) return "Au rez-de-chaussée";
  return `Au ${b.etage === 1 ? "1er" : `${b.etage}ème`} étage ${b.ascenseur ? "avec ascenseur" : "sans ascenseur"}`;
};

/** Accroche « QUARTIER / rue : ». */
export function accroche(b: Bien, a: InfosAnnonce) {
  const lieu = (b.quartier || b.ville || "").toUpperCase();
  return `${lieu || trou("quartier")}${a.rue ? ` / ${a.rue}` : ""} :`;
}

/** Premier jet du corps quand la fiche n'a pas encore de description. */
export function corpsParDefaut(b: Bien) {
  const typo = b.pieces ? `de Type ${b.pieces}` : trou("type");
  const surf = b.surface ? `d'env ${entier(b.surface)} m²` : trou("surface");
  const nature = b.type === "maison" ? `maison ${typo} ${surf}` : `appartement ${typo} ${surf}`;
  const debut = b.type === "maison" ? `Maison ${typo} ${surf}` : `${etageTexte(b)} d'un ${trou("type d'immeuble")}, ${nature}`;
  const annexes = [b.exterieur, b.parking, b.cave ? "une cave" : ""].filter(Boolean).join(", ");
  return `${debut} comprenant : ${trou("pièces")}.${annexes ? ` Le bien dispose de ${annexes}.` : ""}`;
}

/** Corps retenu : celui saisi, sinon la description de la fiche, sinon un premier jet.
    Coupé avant « Agence Patrim… » : coordonnées, prix et mentions sont ajoutés ensuite. */
export const corpsDe = (b: Bien, a: InfosAnnonce) => (a.corps?.trim() || b.description?.trim() || corpsParDefaut(b)).split(/\s*Agence Patrim\b/i)[0].trim().replace(/([^.!?…])$/, "$1.");

/** Le corps commence déjà par une accroche « QUARTIER / rue : » (annonces reprises de patrim.fr). */
const aDejaAccroche = (t: string) => /^[A-ZÀ-ÖØ-Ý0-9][A-ZÀ-ÖØ-Ý0-9 '’.\-]{2,}(\s*\/[^:]{1,60})?\s*:/.test(t);
const avecAccroche = (b: Bien, a: InfosAnnonce) => {
  const c = corpsDe(b, a);
  return aDejaAccroche(c) ? c : `${accroche(b, a)} ${c}`;
};

function mentionsEnergie(b: Bien, a: InfosAnnonce): string[] {
  const out: string[] = [];
  const dpe = b.dpe ? `classe ${b.dpe}${a.dpeKwh ? ` (${entier(a.dpeKwh)} kWh/m²/an)` : ""}` : trou("classe DPE");
  const ges = b.ges ? `classe ${b.ges}${a.gesKg ? ` (${entier(a.gesKg)} kg CO₂/m²/an)` : ""}` : trou("classe GES");
  out.push(`DPE : ${dpe}. GES : ${ges}.`);
  if (passoire(b)) out.push("Logement à consommation énergétique excessive.");
  out.push(
    a.energieMin && a.energieMax
      ? `Montant estimé des dépenses annuelles d'énergie pour un usage standard : entre ${entier(a.energieMin)} et ${entier(a.energieMax)} euros. Prix moyens des énergies indexés en ${a.energieAnnee ?? trou("année")}.`
      : `Montant estimé des dépenses annuelles d'énergie pour un usage standard : ${trou("fourchette du DPE")}.`,
  );
  return out;
}

/** Texte complet de l'annonce de vente. */
function texteVente(b: Bien, a: InfosAnnonce) {
  const taux = tauxHonoraires(b);
  const net = b.netVendeur ?? (b.prix && b.honoraires ? b.prix - b.honoraires : undefined);
  const prix =
    b.honorairesCharge === "vendeur"
      ? `Le prix du bien est de ${b.prix ? euros(b.prix) : trou("prix")}, honoraires à la charge du vendeur.`
      : `Le prix du bien net vendeur est de ${net ? euros(net) : trou("net vendeur")} plus ${taux != null ? `${nb(taux)}%` : trou("taux")} TTC d'honoraires charge acquéreur soit un prix total de ${b.prix ? `${nb(b.prix)} euros` : trou("prix")}.`;
  const p1 = `${avecAccroche(b, a)} Agence Patrim ${TEL_AGENCE}. ${prix} ${mentionsEnergie(b, a).join(" ")}`;
  const copro = enCopro(b)
    ? [
        `Bien soumis au statut de la copropriété. Nombre de lots : ${b.lotsCopro ?? trou("nombre de lots")}. Charges annuelles prévisionnelles : ${b.chargesAnnuelles != null ? euros(b.chargesAnnuelles) : trou("charges annuelles")}.`,
        a.procedure?.trim() ? `Procédure en cours : ${a.procedure.trim()}.` : "Aucune procédure en cours au titre des articles 29-1 A et 29-1 de la loi du 10 juillet 1965.",
      ].join(" ")
    : "";
  const honos = b.honorairesCharge === "vendeur" ? "Honoraires à la charge du vendeur." : `Honoraires à la charge de l'acquéreur : ${taux != null ? `${nb(taux)}%` : trou("taux")} TTC du prix net vendeur.`;
  return [p1, [copro, honos].filter(Boolean).join("\n")].join("\n\n");
}

/** Texte complet de l'annonce de location. */
function texteLocation(b: Bien, a: InfosAnnonce) {
  const l = locationDe(b);
  const loyerCc = l?.loyer != null ? l.loyer + (l.charges ?? 0) : undefined;
  const hono = l?.honoraires ? ventilerHonoraires(l.honoraires, b.surface) : undefined;
  const dispo = a.dispo ? ` Disponible le ${dateTexte(a.dispo)}.` : "";
  const p1 = `${avecAccroche(b, a)}${dispo} Agence Patrim ${TEL_AGENCE}.`;
  const lignes = [
    `Location ${l?.meuble ? "meublée" : "vide"}. Surface habitable : ${b.surface ? `${entier(b.surface)} m²` : trou("surface")}.`,
    `Loyer : ${loyerCc != null ? `${euros(loyerCc)} par mois charges comprises` : trou("loyer")}, dont ${l?.charges != null ? euros(l.charges) : trou("charges")} de charges ${a.forfait ? "forfaitaires" : "(provision avec régularisation annuelle)"}.`,
    `Dépôt de garantie : ${l?.depot != null ? euros(l.depot) : trou("dépôt de garantie")}.`,
    `Honoraires à la charge du locataire : ${l?.honoraires ? `${euros(l.honoraires)} TTC, dont ${hono?.edl ? euros(hono.edl) : trou("part état des lieux")} pour l'état des lieux` : trou("honoraires")}.`,
    ...mentionsEnergie(b, a),
  ];
  return [p1, lignes.join("\n")].join("\n\n");
}

export const texteAnnonce = (b: Bien, a: InfosAnnonce) => (locationSeule(b) ? texteLocation(b, a) : texteVente(b, a));

/** Ce qui reste à compléter dans le texte (« [À compléter : …] »). */
export const trous = (t: string) => [...new Set([...t.matchAll(/\[À compléter : ([^\]]+)\]/g)].map((m) => m[1]))];

/** Champs à recopier dans ICS, un par un. */
export function champsIcs(b: Bien, a: InfosAnnonce): [string, string][] {
  const l = locationDe(b);
  const out: [string, string | number | undefined][] = locationSeule(b)
    ? [
        ["Loyer hors charges", l?.loyer],
        ["Charges", l?.charges],
        ["Dépôt de garantie", l?.depot],
        ["Honoraires locataire", l?.honoraires],
      ]
    : [
        ["Prix honoraires inclus", b.prix],
        ["Net vendeur", b.netVendeur],
        ["Honoraires (€)", b.honoraires],
        ["Honoraires (%)", tauxHonoraires(b) != null ? nb(tauxHonoraires(b)!) : undefined],
        ["Lots de copropriété", b.lotsCopro],
        ["Charges annuelles", b.chargesAnnuelles],
        ["Taxe foncière", b.taxeFonciere],
      ];
  out.push(
    ["Surface", b.surface],
    ["Pièces", b.pieces],
    ["Chambres", b.chambres],
    ["Étage", b.etage],
    ["DPE", b.dpe && `${b.dpe}${a.dpeKwh ? ` · ${a.dpeKwh} kWh/m²/an` : ""}`],
    ["GES", b.ges && `${b.ges}${a.gesKg ? ` · ${a.gesKg} kg CO₂/m²/an` : ""}`],
    ["Énergie (€/an)", a.energieMin && a.energieMax ? `${a.energieMin} – ${a.energieMax} (${a.energieAnnee ?? "?"})` : undefined],
  );
  return out.filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v).replace(/^(\d+)\.(\d+)$/, "$1,$2")]);
}

/** Contrôle des mentions obligatoires : ce qui manque pour publier. */
export function controles(b: Bien, a: InfosAnnonce): { ok: boolean; texte: string }[] {
  const energie = !!(a.energieMin && a.energieMax && a.energieAnnee);
  const base = [
    { ok: !!b.surface, texte: "Surface habitable" },
    { ok: !!b.dpe && !!b.ges, texte: "Classes DPE et GES" },
    { ok: energie, texte: "Coût estimé de l'énergie (fourchette et année du DPE)" },
  ];
  if (locationSeule(b)) {
    const l = locationDe(b);
    return [
      { ok: l?.loyer != null && l?.charges != null, texte: "Loyer et charges" },
      { ok: l?.depot != null, texte: "Dépôt de garantie" },
      { ok: !!l?.honoraires, texte: "Honoraires locataire (dont état des lieux)" },
      ...base,
    ];
  }
  return [
    { ok: !!b.prix, texte: "Prix honoraires inclus" },
    { ok: b.honorairesCharge === "vendeur" || tauxHonoraires(b) != null, texte: "Honoraires en % TTC et à la charge de qui" },
    ...(enCopro(b) ? [{ ok: b.lotsCopro != null && b.chargesAnnuelles != null, texte: "Copropriété : nombre de lots et charges annuelles" }] : []),
    ...base,
  ];
}
