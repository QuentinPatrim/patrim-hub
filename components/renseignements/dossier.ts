/* ============================================================
   Fiche de renseignements en ligne (Hub Location).
   Un dossier par candidature : le candidat principal, ses
   colocataires ou son conjoint, et les garants de chacun. Chaque
   personne a son propre lien secret et ne voit que ses réponses.
   Ce fichier est lu par le navigateur ET par le serveur : aucune
   dépendance au store ni au navigateur ici.
   Pas de nationalité, pas de pièce interdite (art. 22-2 de la loi
   du 6 juillet 1989).
   ============================================================ */

export type RoleDossier = "locataire" | "colocataire" | "garant";
export type StatutPersonne = "a_remplir" | "en_cours" | "termine";

export type SituationFamiliale = "celibataire" | "concubinage" | "pacse" | "marie" | "divorce" | "veuf";
export type LogementActuel = "locataire" | "proprietaire" | "heberge" | "autre";
export type SituationPro = "cdi" | "cdd" | "interim" | "fonctionnaire" | "independant" | "etudiant" | "apprenti" | "retraite" | "sans" | "autre";

export interface Reponses {
  civilite?: "M." | "Mme";
  prenom?: string;
  nom?: string;
  nomNaissance?: string;
  dateNaissance?: string; // AAAA-MM-JJ
  lieuNaissance?: string;
  tel?: string;
  email?: string;
  adresse?: string;
  situation?: SituationFamiliale;
  aCharge?: number;
  logement?: LogementActuel;
  loyerActuel?: number;
  /** Garant : lien avec le locataire (parent, ami…). */
  lien?: string;
  pro?: SituationPro;
  profession?: string;
  employeur?: string;
  depuis?: string; // AAAA-MM-JJ
  finCdd?: string; // AAAA-MM-JJ
  salaire?: number;
  autresRevenus?: number;
  autresRevenusDetail?: string;
  /** Certifie l'exactitude et accepte l'usage pour la candidature. */
  accord?: boolean;
}

/** Ce que voit la personne qui ouvre le lien : le logement, jamais le propriétaire. */
export interface LogementPublic {
  titre: string;
  ville?: string;
  meuble?: boolean;
  loyer?: number; // hors charges
  charges?: number;
  depot?: number;
  honoraires?: number;
  entree?: string;
  photo?: string;
  conseiller?: { nom: string; tel?: string; mail?: string };
}

export interface PersonneDossier {
  id: string;
  role: RoleDossier;
  principal: boolean;
  garantDe?: string;
  prenom: string;
  statut: StatutPersonne;
  reponses?: Reponses;
  maj?: string;
}

export interface Dossier {
  id: string;
  bienId: string;
  logement: LogementPublic;
  ferme: boolean;
  creeLe: string;
  expire: string;
  personnes: PersonneDossier[];
}

/** Réponse de l'adresse publique : la personne du lien, et le foyer (prénoms et avancement seulement) pour le candidat principal. */
export interface VuePublique {
  logement: LogementPublic;
  moi: PersonneDossier;
  foyer?: Omit<PersonneDossier, "reponses">[];
  expire: string;
}

export const MAX_PERSONNES = 8;
export const DUREE_LIEN_JOURS = 30;
/** Dossiers effacés trois mois après leur création (RGPD : candidature non retenue). */
export const CONSERVATION_JOURS = 90;

export const SITUATIONS_FAMILIALES: { v: SituationFamiliale; label: string }[] = [
  { v: "celibataire", label: "Célibataire" },
  { v: "concubinage", label: "En couple" },
  { v: "pacse", label: "Pacsé(e)" },
  { v: "marie", label: "Marié(e)" },
  { v: "divorce", label: "Divorcé(e)" },
  { v: "veuf", label: "Veuf(ve)" },
];
export const LOGEMENTS_ACTUELS: { v: LogementActuel; label: string }[] = [
  { v: "locataire", label: "Locataire" },
  { v: "proprietaire", label: "Propriétaire" },
  { v: "heberge", label: "Hébergé(e)" },
  { v: "autre", label: "Autre" },
];
export const SITUATIONS_PRO: { v: SituationPro; label: string }[] = [
  { v: "cdi", label: "CDI" },
  { v: "cdd", label: "CDD" },
  { v: "interim", label: "Intérim" },
  { v: "fonctionnaire", label: "Fonctionnaire" },
  { v: "independant", label: "Indépendant" },
  { v: "etudiant", label: "Étudiant(e)" },
  { v: "apprenti", label: "Apprenti(e)" },
  { v: "retraite", label: "Retraité(e)" },
  { v: "sans", label: "Sans emploi" },
  { v: "autre", label: "Autre" },
];

export const libelle = <T extends string>(liste: { v: T; label: string }[], v?: T) => liste.find((x) => x.v === v)?.label ?? "";

/** « Garant de Marie », « Colocataire », « Locataire ». */
export function rolePersonne(p: Pick<PersonneDossier, "role" | "garantDe" | "principal">, foyer: Pick<PersonneDossier, "id" | "prenom">[] = []) {
  if (p.role === "garant") {
    const de = foyer.find((x) => x.id === p.garantDe)?.prenom;
    return de ? `Garant de ${de}` : "Garant";
  }
  if (p.role === "colocataire") return "Conjoint ou colocataire";
  return "Locataire";
}

export const sansEmploiSalarie = (r: Reponses) => r.pro === "etudiant" || r.pro === "retraite" || r.pro === "sans";

/** Champs à remplir avant de pouvoir envoyer. */
export function manquantsReponses(r: Reponses): string[] {
  const out: string[] = [];
  if (!r.civilite) out.push("Civilité");
  if (!r.prenom?.trim()) out.push("Prénom");
  if (!r.nom?.trim()) out.push("Nom");
  if (!r.dateNaissance) out.push("Date de naissance");
  if (!r.lieuNaissance?.trim()) out.push("Lieu de naissance");
  if (!r.tel?.trim()) out.push("Portable");
  if (!r.email?.trim()) out.push("E-mail");
  if (!r.adresse?.trim()) out.push("Adresse actuelle");
  if (!r.situation) out.push("Situation familiale");
  if (!r.logement) out.push("Logement actuel");
  if (!r.pro) out.push("Situation professionnelle");
  if (r.pro && !sansEmploiSalarie(r) && r.salaire == null) out.push("Revenu net mensuel");
  return out;
}

export const revenusMensuels = (r?: Reponses) => (r ? (r.salaire ?? 0) + (r.autresRevenus ?? 0) : 0);

const eur = (n?: number) => (n == null ? "" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`);
const dateFr = (ymd?: string) => (ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Réponses rangées pour l'affichage (« Renseignements ») : seules les lignes remplies s'affichent. */
export function groupesReponses(r: Reponses): { titre: string; etape: number; lignes: [string, string | undefined][] }[] {
  return [
    {
      titre: "Identité",
      etape: 0,
      lignes: [
        ["Nom", [r.civilite === "M." ? "Monsieur" : r.civilite === "Mme" ? "Madame" : "", r.prenom, r.nom?.toUpperCase()].filter(Boolean).join(" ")],
        ["Nom de naissance", r.nomNaissance],
        ["Né(e) le", [dateFr(r.dateNaissance), r.lieuNaissance && `à ${r.lieuNaissance}`].filter(Boolean).join(" ")],
      ],
    },
    { titre: "Coordonnées", etape: 1, lignes: [["Portable", r.tel], ["E-mail", r.email], ["Adresse", r.adresse]] },
    {
      titre: "Situation",
      etape: 2,
      lignes: [
        ["Situation familiale", libelle(SITUATIONS_FAMILIALES, r.situation)],
        ["Personnes à charge", String(r.aCharge ?? 0)],
        ["Logement actuel", [libelle(LOGEMENTS_ACTUELS, r.logement), r.loyerActuel != null && `${eur(r.loyerActuel)} par mois`].filter(Boolean).join(", ")],
        ["Lien", r.lien],
      ],
    },
    {
      titre: "Travail et revenus",
      etape: 3,
      lignes: [
        ["Situation", libelle(SITUATIONS_PRO, r.pro)],
        ["Profession", r.profession],
        ["Employeur", r.employeur],
        ["Depuis le", dateFr(r.depuis)],
        ["Fin du contrat", dateFr(r.finCdd)],
        ["Revenus par mois", r.salaire != null ? eur(r.salaire) : undefined],
        ["Autres revenus", r.autresRevenus ? `${eur(r.autresRevenus)}${r.autresRevenusDetail ? ` (${r.autresRevenusDetail})` : ""}` : undefined],
      ],
    },
  ];
}

/* ---------- Nettoyage des réponses reçues (serveur) ---------- */

const TEXTES: Record<string, number> = {
  prenom: 80,
  nom: 80,
  nomNaissance: 80,
  lieuNaissance: 120,
  tel: 24,
  email: 120,
  adresse: 240,
  lien: 80,
  profession: 120,
  employeur: 240,
  autresRevenusDetail: 200,
};
const DATES = ["dateNaissance", "depuis", "finCdd"] as const;
const MONTANTS = ["loyerActuel", "salaire", "autresRevenus"] as const;
const ENUMS: Record<string, readonly string[]> = {
  civilite: ["M.", "Mme"],
  situation: SITUATIONS_FAMILIALES.map((s) => s.v),
  logement: LOGEMENTS_ACTUELS.map((s) => s.v),
  pro: SITUATIONS_PRO.map((s) => s.v),
};

/** Ne garde que les champs connus, au bon format et à la bonne taille. Tout le reste est ignoré. */
export function nettoyerReponses(entree: unknown): Reponses {
  if (!entree || typeof entree !== "object" || Array.isArray(entree)) return {};
  const src = entree as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, max] of Object.entries(TEXTES)) {
    const v = src[k];
    if (typeof v === "string") {
      // Pas de caractères de contrôle ni de balises
      const t = v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
      if (t) out[k] = t;
    }
  }
  if (typeof out.tel === "string" && !/^[+\d][\d .()-]{5,22}$/.test(out.tel)) delete out.tel;
  if (typeof out.email === "string" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) delete out.email;
  for (const k of DATES) {
    const v = src[k];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))) out[k] = v;
  }
  for (const k of MONTANTS) {
    const v = src[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1_000_000) out[k] = Math.round(v * 100) / 100;
  }
  if (typeof src.aCharge === "number" && Number.isInteger(src.aCharge) && src.aCharge >= 0 && src.aCharge <= 20) out.aCharge = src.aCharge;
  for (const [k, vals] of Object.entries(ENUMS)) {
    const v = src[k];
    if (typeof v === "string" && vals.includes(v)) out[k] = v;
  }
  if (src.accord === true) out.accord = true;
  return out as Reponses;
}

export const nettoyerPrenom = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) : "");
