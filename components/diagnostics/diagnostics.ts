/* ============================================================
   Validité des diagnostics de vente d'un bien : dates des
   rapports saisies par le conseiller, durées légales, et ce qui
   est expiré ou expirera avant la signature prévue.
   Fonctions pures : aussi utilisées par le briefing du matin.
   Rien n'est deviné : sans date, le diagnostic est « à fournir ».
   ============================================================ */

import type { Bien } from "@/lib/types";
import type { Tone } from "@/lib/format";

export type CleDiag = "dpe" | "amiante" | "plomb" | "termites" | "electricite" | "gaz" | "erp" | "carrez" | "assainissement";

export interface Diag {
  /** Date du rapport (AAAA-MM-JJ). */
  date?: string;
  /** Le bien est-il concerné ? Vide : réponse par défaut tirée de la fiche (type, année de construction). */
  concerne?: boolean;
  /** Amiante, plomb : présence relevée (la validité devient limitée). */
  presence?: boolean;
}

export type Diagnostics = Partial<Record<CleDiag, Diag>> & {
  /** Date de signature prévue (compromis ou acte) : les diagnostics doivent encore être valables ce jour-là. */
  signature?: string;
};
export type BienDiags = Bien & { diagnostics?: Diagnostics };

export const diagnosticsDe = (b: Bien): Diagnostics => (b as BienDiags).diagnostics ?? {};

interface Regle {
  cle: CleDiag;
  label: string;
  /** Quand le diagnostic est obligatoire, en clair. */
  quand: string;
  /** Durée de validité, en clair. */
  duree: string;
  resultat?: boolean;
}

export const DIAGS: Regle[] = [
  { cle: "dpe", label: "DPE", quand: "Tout logement", duree: "10 ans (ceux d'avant juillet 2021 ont expiré)" },
  { cle: "amiante", label: "Amiante", quand: "Permis de construire d'avant juillet 1997", duree: "Sans limite si absence, 3 ans si présence", resultat: true },
  { cle: "plomb", label: "Plomb (CREP)", quand: "Logement construit avant 1949", duree: "Sans limite si absence, 1 an si présence", resultat: true },
  { cle: "termites", label: "Termites", quand: "Zone délimitée par arrêté préfectoral", duree: "6 mois" },
  { cle: "electricite", label: "Électricité", quand: "Installation de plus de 15 ans", duree: "3 ans" },
  { cle: "gaz", label: "Gaz", quand: "Installation de plus de 15 ans", duree: "3 ans" },
  { cle: "erp", label: "État des risques (ERP)", quand: "Toujours", duree: "6 mois" },
  { cle: "carrez", label: "Surface loi Carrez", quand: "Lot de copropriété", duree: "Sans limite, sauf travaux" },
  { cle: "assainissement", label: "Assainissement non collectif", quand: "Maison non raccordée au tout-à-l'égout", duree: "3 ans" },
];

/** Date + n mois − 1 jour (un rapport du 03/07/2025 valable 10 ans l'est jusqu'au 02/07/2035). */
function jusquau(date: string, mois: number) {
  const d = new Date(date + "T12:00:00Z");
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mois);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Fin de validité (AAAA-MM-JJ), null si sans limite, undefined si on ne peut pas savoir (résultat à préciser). */
export function finValidite(cle: CleDiag, d: Diag): string | null | undefined {
  if (!d.date) return undefined;
  switch (cle) {
    case "dpe":
      if (d.date < "2018-01-01") return d.date < "2013-01-01" ? jusquau(d.date, 120) : "2022-12-31";
      if (d.date < "2021-07-01") return "2024-12-31";
      return jusquau(d.date, 120);
    case "amiante":
      // Repérage d'avant le 1er avril 2013 : à refaire pour une vente.
      if (d.date < "2013-04-01") return "2013-03-31";
      return d.presence == null ? undefined : d.presence ? jusquau(d.date, 36) : null;
    case "plomb":
      return d.presence == null ? undefined : d.presence ? jusquau(d.date, 12) : null;
    case "termites":
    case "erp":
      return jusquau(d.date, 6);
    case "electricite":
    case "gaz":
    case "assainissement":
      return jusquau(d.date, 36);
    case "carrez":
      return null;
  }
}

/** Le bien est-il concerné, d'après la fiche ? undefined quand la fiche ne permet pas de le dire. */
export function concerneParDefaut(cle: CleDiag, b: Bien, annee = new Date().getFullYear()): boolean | undefined {
  const logement = b.type !== "terrain" && b.type !== "parking";
  const a = b.anneeConstruction;
  switch (cle) {
    case "dpe":
      return logement;
    case "amiante":
      return b.type === "terrain" ? false : a == null ? undefined : a < 1997;
    case "plomb":
      return !logement ? false : a == null ? undefined : a < 1949;
    case "termites":
    case "erp":
      return true;
    case "electricite":
      return !logement ? false : a == null ? undefined : a <= annee - 15;
    case "gaz":
      return logement ? undefined : false;
    case "carrez":
      return b.type === "appartement" || b.type === "local" ? true : b.type === "maison" ? false : undefined;
    case "assainissement":
      return b.type === "maison" ? undefined : false;
  }
}

export type Etat = "expire" | "avantSignature" | "bientot" | "manquant" | "aPreciser" | "ok" | "nonConcerne";
export const ETAT: Record<Etat, string> = {
  expire: "Expiré",
  avantSignature: "Avant signature",
  bientot: "Expire bientôt",
  manquant: "À fournir",
  aPreciser: "À préciser",
  ok: "Valable",
  nonConcerne: "Non concerné",
};

export interface StatutDiag {
  cle: CleDiag;
  label: string;
  etat: Etat;
  fin?: string | null;
  texte: string;
  tone: Tone;
}

/** Signature à venir à laquelle les diagnostics doivent encore être valables : la plus tardive
    de la signature saisie ici et de l'acte prévu dans le suivi de la vente. */
export function signaturePrevue(b: Bien, aujourdhui: string): string | undefined {
  const acte = (b as { vente?: { acte?: string; acteSigne?: string } }).vente;
  return [diagnosticsDe(b).signature, acte?.acteSigne ? undefined : acte?.acte]
    .filter((x): x is string => !!x && x >= aujourdhui)
    .sort()
    .pop();
}

const date = (ymd: string, month: "short" | "long") => new Date(ymd + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month, year: "numeric" }).replace(/^1 /, "1er ");
const court = (ymd: string) => date(ymd, "short");
const joursEntre = (de: string, a: string) => Math.round((new Date(a + "T12:00:00").getTime() - new Date(de + "T12:00:00").getTime()) / 86400000);

/** État d'un diagnostic à une date donnée (AAAA-MM-JJ), en tenant compte de la signature prévue. */
export function statutDiag(cle: CleDiag, b: Bien, aujourdhui: string): StatutDiag {
  const regle = DIAGS.find((r) => r.cle === cle)!;
  const tout = diagnosticsDe(b);
  const d = tout[cle] ?? {};
  const base = { cle, label: regle.label };
  const concerne = d.concerne ?? concerneParDefaut(cle, b);
  if (concerne === false) return { ...base, etat: "nonConcerne", texte: "Non concerné", tone: "neutral" };
  if (concerne == null && !d.date) return { ...base, etat: "aPreciser", texte: `Concerné ? ${regle.quand}`, tone: "neutral" };
  if (!d.date) return { ...base, etat: "manquant", texte: "À fournir", tone: "warn" };
  if (cle === "amiante" && d.date < "2013-04-01") return { ...base, etat: "expire", fin: "2013-03-31", texte: "Repérage d'avant avril 2013 : à refaire pour la vente", tone: "danger" };
  const fin = finValidite(cle, d);
  if (fin === undefined) return { ...base, etat: "aPreciser", fin, texte: `Rapport du ${court(d.date)} : présence ou absence à préciser`, tone: "neutral" };
  if (fin === null) return { ...base, etat: "ok", fin, texte: `Rapport du ${court(d.date)}, sans limite de durée`, tone: "ok" };
  if (fin < aujourdhui) return { ...base, etat: "expire", fin, texte: `Expiré depuis le ${court(fin)}`, tone: "danger" };
  const signature = signaturePrevue(b, aujourdhui);
  if (signature && fin < signature) return { ...base, etat: "avantSignature", fin, texte: `Expire le ${court(fin)}, avant la signature du ${court(signature)}`, tone: "danger" };
  const reste = joursEntre(aujourdhui, fin);
  if (reste <= 30) return { ...base, etat: "bientot", fin, texte: `Expire le ${court(fin)} (dans ${reste} j)`, tone: "warn" };
  return { ...base, etat: "ok", fin, texte: `Valable jusqu'au ${court(fin)}`, tone: "ok" };
}

export const statutsDiags = (b: Bien, aujourdhui: string) => DIAGS.map((r) => statutDiag(r.cle, b, aujourdhui));

/** Des dates ont-elles été saisies pour ce bien ? (sinon rien n'est signalé dans le briefing) */
export const diagnosticsSuivis = (b: Bien) => DIAGS.some((r) => !!diagnosticsDe(b)[r.cle]?.date);

/** Ce qui demande une action : expiré, expirant avant la signature ou dans le mois, ou à fournir. */
export const ALERTES: Etat[] = ["expire", "avantSignature", "bientot", "manquant"];

/** Date trouvée dans un texte du dossier (« du 03/07/2025 »), proposée au conseiller sans être reprise d'office. */
export function dateDansTexte(texte?: string): string | undefined {
  const m = texte?.match(/\bdu (\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/** Une ligne par diagnostic renseigné ou manquant (pour le mail au notaire). */
export function resumeDiagnostics(b: Bien, aujourdhui: string) {
  const diags = diagnosticsDe(b);
  return statutsDiags(b, aujourdhui)
    .filter((s) => s.etat !== "nonConcerne" && s.etat !== "aPreciser")
    .map((s) => {
      const le = diags[s.cle]?.date;
      if (!le) return `${s.label} : à fournir`;
      const rapport = `${s.label} : rapport du ${date(le, "long")}`;
      if (s.cle === "amiante" && le < "2013-04-01") return `${rapport}, antérieur à avril 2013 (à refaire)`;
      const fin = s.fin ? `valable jusqu'au ${date(s.fin, "long")}` : s.fin === null ? "sans limite de durée" : "";
      return `${rapport}${fin ? `, ${fin}` : ""}${s.etat === "expire" ? " (expiré, à refaire)" : s.etat === "avantSignature" ? " (à refaire avant la signature)" : ""}`;
    })
    .join("\n");
}
