/* ============================================================
   Fiches vendeur et acquéreur à remplir en ligne (Hub Transaction).
   - Fiche vendeur : envoyée avant le mandat. Tout ce qu'il faut pour
     le rédiger (état civil, régime matrimonial, propriétaires, bien,
     lots, syndic…) et, dans le même parcours, l'identification
     demandée par la lutte contre le blanchiment (origine de
     propriété, personne politiquement exposée…).
   - Fiche acquéreur : envoyée quand un acquéreur veut faire une offre
     sur un bien. Identité, coordonnées de signature, prix proposé,
     financement, origine des fonds.
   Un lien secret par fiche ; la personne qui l'ouvre ne voit que sa
   fiche. Ce fichier est lu par le navigateur ET par le serveur :
   aucune dépendance au store ni au navigateur ici.
   ============================================================ */

export type KindFiche = "vendeur" | "acquereur";
export type StatutFiche = "a_remplir" | "en_cours" | "termine";

export type Civilite = "M." | "Mme";
export type Situation = "celibataire" | "concubinage" | "pacse" | "marie" | "divorce" | "veuf";
export type Regime = "communaute_legale" | "separation" | "participation" | "communaute_universelle" | "autre" | "inconnu";
export type RegimePacs = "separation" | "indivision";
export type Parties = "seul" | "couple" | "plusieurs" | "societe";
export type Occupation = "libre" | "occupe" | "loue";
export type Origine = "achat" | "succession" | "donation" | "construction" | "autre";
export type Destination = "principale" | "secondaire" | "locatif";
export type Financement = "pret" | "comptant";
export type Ppe = "non" | "moi" | "proche";
export type Nature = "Appartement" | "Maison" | "Local" | "Immeuble" | "Garage" | "Terrain" | "Autre";

/** Une personne : le signataire principal, ou un autre propriétaire / acquéreur. */
export interface Personne {
  civilite?: Civilite;
  prenom?: string;
  nom?: string;
  nomNaissance?: string;
  dateNaissance?: string; // AAAA-MM-JJ
  lieuNaissance?: string;
  nationalite?: string;
  profession?: string;
  adresse?: string;
  tel?: string;
  email?: string;
  /** Autre personne : lien avec le signataire (conjoint, frère, indivisaire…). */
  lien?: string;
  /** Autre personne : personne politiquement exposée. */
  ppe?: Ppe;
}

export interface Societe {
  denomination?: string;
  forme?: string; // SCI, SARL…
  siren?: string;
  siege?: string;
  qualite?: string; // qualité du signataire : gérant…
  /** Personnes qui détiennent plus de 25 % des parts ou des droits de vote. */
  beneficiaires?: string;
}

export interface Reponses extends Personne {
  situation?: Situation;
  regime?: Regime;
  regimePacs?: RegimePacs;
  dateMariage?: string;
  lieuMariage?: string;
  /** Seul, en couple, à plusieurs (indivision), via une société. */
  parties?: Parties;
  autres?: Personne[];
  societe?: Societe;

  /* ---- Vendeur : le bien ---- */
  bienAdresse?: string;
  bienNature?: Nature;
  lots?: string;
  carrez?: string;
  occupation?: Occupation;
  loyer?: number;
  finBail?: string;
  residenceFamille?: boolean;
  syndic?: string;
  chargesAnnuelles?: number;
  taxeFonciere?: number;
  anneeConstruction?: number;
  diagnostics?: string[];
  travaux?: string;
  prixSouhaite?: number;
  /* ---- Vendeur : origine de propriété et projet ---- */
  origine?: Origine;
  origineAnnee?: number;
  origineNotaire?: string;
  prixAcquisition?: number;
  credit?: boolean;
  creditBanque?: string;
  notaireVente?: string;
  projet?: string;

  /* ---- Acquéreur : l'offre et le financement ---- */
  prixPropose?: number;
  destination?: Destination;
  conditions?: string;
  financement?: Financement;
  apport?: number;
  montantPret?: number;
  dureePret?: number;
  tauxMax?: number;
  banque?: string;
  accordPrincipe?: boolean;
  venteBien?: boolean;
  venteBienDetail?: string;
  origineFonds?: string[];
  origineFondsDetail?: string;
  etablissementFonds?: string;

  /* ---- Vérifications légales (les deux fiches) ---- */
  ppeDetail?: string;
  propreCompte?: boolean;
  pourCompteDe?: string;
  residenceFiscale?: string;

  /** Certifie l'exactitude et accepte l'usage pour le mandat ou l'offre. */
  accord?: boolean;
}

/** Ce que voit la personne qui ouvre le lien : le bien, jamais le vendeur ni les autres acquéreurs. */
export interface ContextePublic {
  titre: string;
  ville?: string;
  /** Fiche acquéreur : prix affiché, honoraires inclus. */
  prix?: number;
  photo?: string;
  conseiller?: { nom: string; tel?: string; mail?: string };
}

/** Évaluation du risque par l'agence (vigilance anti-blanchiment) : saisie par le conseiller, jamais montrée au client. */
export type Risque = "faible" | "moyen" | "eleve";
export interface Controle {
  risque?: Risque;
  identiteVerifiee?: boolean;
  justificatifs?: boolean;
  /** Mesures prises ou remarques (vigilance renforcée, pièces demandées…). */
  commentaire?: string;
  par?: string;
  le?: string; // AAAA-MM-JJ
}
export const RISQUES: { v: Risque; label: string }[] = [
  { v: "faible", label: "Risque faible" },
  { v: "moyen", label: "Risque moyen" },
  { v: "eleve", label: "Risque élevé" },
];
export const controleFait = (c?: Controle) => !!c?.risque && !!c.le;

export interface Fiche {
  id: string;
  kind: KindFiche;
  bienId: string;
  contexte: ContextePublic;
  prenom: string;
  statut: StatutFiche;
  reponses?: Reponses;
  controle?: Controle;
  ferme: boolean;
  creeLe: string;
  expire: string;
  maj?: string;
}

/** Réponse de l'adresse publique. */
export interface VuePublique {
  kind: KindFiche;
  contexte: ContextePublic;
  prenom: string;
  statut: StatutFiche;
  reponses: Reponses;
  expire: string;
}

export const DUREE_LIEN_JOURS = 30;
/** Les fiches sont effacées du Hub un an après leur création ; l'agence garde le PDF dans son dossier LCB-FT (5 ans). */
export const CONSERVATION_JOURS = 365;
export const MAX_AUTRES = 5;

export const SITUATIONS: { v: Situation; label: string }[] = [
  { v: "celibataire", label: "Célibataire" },
  { v: "concubinage", label: "En couple (union libre)" },
  { v: "pacse", label: "Pacsé(e)" },
  { v: "marie", label: "Marié(e)" },
  { v: "divorce", label: "Divorcé(e)" },
  { v: "veuf", label: "Veuf(ve)" },
];
export const REGIMES: { v: Regime; label: string }[] = [
  { v: "communaute_legale", label: "Sans contrat (communauté légale)" },
  { v: "separation", label: "Séparation de biens" },
  { v: "participation", label: "Participation aux acquêts" },
  { v: "communaute_universelle", label: "Communauté universelle" },
  { v: "autre", label: "Autre" },
  { v: "inconnu", label: "Je ne sais pas" },
];
export const REGIMES_PACS: { v: RegimePacs; label: string }[] = [
  { v: "separation", label: "Séparation des patrimoines" },
  { v: "indivision", label: "Indivision" },
];
export const PARTIES: Record<KindFiche, { v: Parties; label: string }[]> = {
  vendeur: [
    { v: "seul", label: "Je suis seul(e) propriétaire" },
    { v: "couple", label: "Avec mon conjoint ou partenaire" },
    { v: "plusieurs", label: "À plusieurs (indivision, succession…)" },
    { v: "societe", label: "Par une société (SCI…)" },
  ],
  acquereur: [
    { v: "seul", label: "J'achète seul(e)" },
    { v: "couple", label: "Avec mon conjoint ou partenaire" },
    { v: "plusieurs", label: "À plusieurs" },
    { v: "societe", label: "Par une société (SCI…)" },
  ],
};
export const NATURES: Nature[] = ["Appartement", "Maison", "Local", "Immeuble", "Garage", "Terrain", "Autre"];
export const OCCUPATIONS: { v: Occupation; label: string }[] = [
  { v: "libre", label: "Vide, libre à la vente" },
  { v: "occupe", label: "J'y habite" },
  { v: "loue", label: "Loué" },
];
export const ORIGINES: { v: Origine; label: string }[] = [
  { v: "achat", label: "Achat" },
  { v: "succession", label: "Succession" },
  { v: "donation", label: "Donation" },
  { v: "construction", label: "Construction" },
  { v: "autre", label: "Autre" },
];
export const DESTINATIONS: { v: Destination; label: string }[] = [
  { v: "principale", label: "Résidence principale" },
  { v: "secondaire", label: "Résidence secondaire" },
  { v: "locatif", label: "Investissement locatif" },
];
export const FINANCEMENTS: { v: Financement; label: string }[] = [
  { v: "pret", label: "Avec un prêt" },
  { v: "comptant", label: "Comptant, sans prêt" },
];
export const ORIGINES_FONDS = ["Épargne personnelle", "Vente d'un bien immobilier", "Donation", "Succession", "Prêt familial", "Revenus professionnels", "Autre"] as const;
export const PPES: { v: Ppe; label: string }[] = [
  { v: "non", label: "Non" },
  { v: "moi", label: "Oui, moi" },
  { v: "proche", label: "Oui, un proche" },
];
/** Même liste que le mandat (components/mandat/mandat.ts), pour la reprise. */
export const DIAGNOSTICS = [
  "Diagnostic de performance énergétique",
  "État amiante",
  "Constat de risque d'exposition au plomb",
  "État de l'installation intérieure d'électricité",
  "État de l'installation intérieure de gaz",
  "État parasitaire",
  "Contrôle assainissement (collectif ou individuel)",
  "État des risques",
  "Audit énergétique",
  "Bornage",
] as const;

export const libelle = <T extends string>(liste: { v: T; label: string }[], v?: T) => liste.find((x) => x.v === v)?.label ?? "";
export const TITRE_FICHE: Record<KindFiche, string> = { vendeur: "Fiche vendeur", acquereur: "Fiche acquéreur" };

export const estMarie = (r: Reponses) => r.situation === "marie";
/** Autres personnes à renseigner : conjoint, coindivisaires ou co-acquéreurs. */
export const avecAutres = (r: Reponses) => r.parties === "couple" || r.parties === "plusieurs";
export const nomPersonne = (p: Personne) => [p.civilite === "M." ? "Monsieur" : p.civilite === "Mme" ? "Madame" : "", p.prenom, p.nom?.toUpperCase()].filter(Boolean).join(" ");

/** Étapes du parcours : identiques pour les deux fiches sauf le milieu. */
export const ETAPES: Record<KindFiche, readonly string[]> = {
  vendeur: ["Identité", "Coordonnées", "Situation familiale", "Les propriétaires", "Le bien", "Origine et projet", "Vérifications légales", "Vérification"],
  acquereur: ["Identité", "Coordonnées", "Situation familiale", "Les acquéreurs", "Votre offre", "Financement", "Vérifications légales", "Vérification"],
};

/** Champs à remplir avant de pouvoir envoyer. */
export function manquantsReponses(kind: KindFiche, r: Reponses): string[] {
  const out: string[] = [];
  const t = (v?: string) => !v?.trim();
  if (!r.civilite) out.push("Civilité");
  if (t(r.prenom)) out.push("Prénom");
  if (t(r.nom)) out.push("Nom");
  if (!r.dateNaissance) out.push("Date de naissance");
  if (t(r.lieuNaissance)) out.push("Lieu de naissance");
  if (t(r.nationalite)) out.push("Nationalité");
  if (t(r.profession)) out.push("Profession");
  if (t(r.adresse)) out.push("Adresse");
  if (t(r.tel)) out.push("Portable");
  if (t(r.email)) out.push("E-mail");
  if (!r.situation) out.push("Situation familiale");
  if (estMarie(r) && !r.regime) out.push("Régime matrimonial");
  if (!r.parties) out.push(kind === "vendeur" ? "Propriétaires" : "Acquéreurs");
  if (avecAutres(r)) {
    const autres = r.autres ?? [];
    if (!autres.length || autres.some((p) => t(p.prenom) || t(p.nom))) out.push(kind === "vendeur" ? "Autres propriétaires" : "Autres acquéreurs");
  }
  if (r.parties === "societe" && (t(r.societe?.denomination) || t(r.societe?.siren))) out.push("Société");
  if (kind === "vendeur") {
    if (t(r.bienAdresse)) out.push("Adresse du bien");
    if (!r.occupation) out.push("Occupation du bien");
    if (!r.origine) out.push("Origine de propriété");
  } else {
    if (r.prixPropose == null) out.push("Prix proposé");
    if (!r.financement) out.push("Financement");
    if (!r.origineFonds?.length) out.push("Origine des fonds");
  }
  if (!r.ppe) out.push("Personne politiquement exposée");
  if (r.propreCompte == null) out.push("Pour votre compte");
  return out;
}

const eur = (n?: number) => (n == null ? "" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`);
const dateFr = (ymd?: string) => (ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
const ouiNon = (b?: boolean) => (b == null ? undefined : b ? "Oui" : "Non");

export type Groupe = { titre: string; etape: number; lignes: [string, string | undefined][]; lcb?: boolean };

function lignesPersonne(p: Personne): [string, string | undefined][] {
  return [
    ["Nom", nomPersonne(p)],
    ["Nom de naissance", p.nomNaissance],
    ["Né(e) le", [dateFr(p.dateNaissance), p.lieuNaissance && `à ${p.lieuNaissance}`].filter(Boolean).join(" ")],
    ["Nationalité", p.nationalite],
    ["Profession", p.profession],
  ];
}

/** Réponses rangées pour l'affichage et le PDF : seules les lignes remplies s'affichent. */
export function groupesReponses(kind: KindFiche, r: Reponses): Groupe[] {
  const autres = (r.autres ?? []).filter((p) => p.prenom || p.nom);
  const g: Groupe[] = [
    { titre: "Identité", etape: 0, lignes: lignesPersonne(r) },
    { titre: "Coordonnées", etape: 1, lignes: [["Adresse", r.adresse], ["Portable", r.tel], ["E-mail", r.email]] },
    {
      titre: "Situation familiale",
      etape: 2,
      lignes: [
        ["Situation", libelle(SITUATIONS, r.situation)],
        ["Régime", r.situation === "marie" ? libelle(REGIMES, r.regime) : r.situation === "pacse" ? libelle(REGIMES_PACS, r.regimePacs) : undefined],
        ["Mariage", r.situation === "marie" ? [dateFr(r.dateMariage), r.lieuMariage && `à ${r.lieuMariage}`].filter(Boolean).join(" ") : undefined],
      ],
    },
    {
      titre: kind === "vendeur" ? "Les propriétaires" : "Les acquéreurs",
      etape: 3,
      lignes: [
        ["Situation", libelle(PARTIES[kind], r.parties)],
        ...(r.parties === "societe" && r.societe
          ? ([
              ["Société", [r.societe.forme, r.societe.denomination].filter(Boolean).join(" ")],
              ["SIREN", r.societe.siren],
              ["Siège", r.societe.siege],
              ["Qualité du signataire", r.societe.qualite],
              ["Bénéficiaires effectifs", r.societe.beneficiaires],
            ] as [string, string | undefined][])
          : []),
      ],
    },
    ...(avecAutres(r)
      ? autres.map((p, i) => ({
          titre: `${kind === "vendeur" ? "Propriétaire" : "Acquéreur"} ${i + 2}${p.lien ? ` · ${p.lien}` : ""}`,
          etape: 3,
          lignes: [...lignesPersonne(p), ["Adresse", p.adresse], ["Portable", p.tel], ["E-mail", p.email], ["Personne exposée", p.ppe && p.ppe !== "non" ? "Oui (voir vérifications)" : p.ppe ? "Non" : undefined]] as [string, string | undefined][],
        }))
      : []),
  ];
  if (kind === "vendeur") {
    g.push(
      {
        titre: "Le bien",
        etape: 4,
        lignes: [
          ["Adresse", r.bienAdresse],
          ["Nature", r.bienNature],
          ["Lots de copropriété", r.lots],
          ["Surface Carrez", r.carrez],
          ["Occupation", [libelle(OCCUPATIONS, r.occupation), r.occupation === "loue" && r.loyer != null && `${eur(r.loyer)} par mois`, r.occupation === "loue" && r.finBail && `bail jusqu'au ${dateFr(r.finBail)}`].filter(Boolean).join(", ")],
          ["Logement de la famille", ouiNon(r.residenceFamille)],
          ["Syndic", r.syndic],
          ["Charges par an", r.chargesAnnuelles != null ? eur(r.chargesAnnuelles) : undefined],
          ["Taxe foncière", r.taxeFonciere != null ? eur(r.taxeFonciere) : undefined],
          ["Construit en", r.anneeConstruction ? String(r.anneeConstruction) : undefined],
          ["Diagnostics faits", r.diagnostics?.length ? r.diagnostics.join(", ") : undefined],
          ["Travaux récents", r.travaux],
          ["Prix souhaité", r.prixSouhaite != null ? `${eur(r.prixSouhaite)} net vendeur` : undefined],
        ],
      },
      {
        titre: "Origine de propriété",
        etape: 5,
        lcb: true,
        lignes: [
          ["Acquis par", [libelle(ORIGINES, r.origine), r.origineAnnee && `en ${r.origineAnnee}`].filter(Boolean).join(" ")],
          ["Notaire de l'acte", r.origineNotaire],
          ["Prix d'acquisition", r.prixAcquisition != null ? eur(r.prixAcquisition) : undefined],
          ["Crédit en cours", r.credit == null ? undefined : r.credit ? `Oui${r.creditBanque ? ` (${r.creditBanque})` : ""}` : "Non"],
          ["Notaire pour la vente", r.notaireVente],
          ["Projet après la vente", r.projet],
        ],
      }
    );
  } else {
    g.push(
      {
        titre: "L'offre",
        etape: 4,
        lignes: [
          ["Prix proposé", r.prixPropose != null ? eur(r.prixPropose) : undefined],
          ["Destination", libelle(DESTINATIONS, r.destination)],
          ["Conditions souhaitées", r.conditions],
        ],
      },
      {
        titre: "Financement",
        etape: 5,
        lcb: true,
        lignes: [
          ["Financement", libelle(FINANCEMENTS, r.financement)],
          ["Apport", r.apport != null ? eur(r.apport) : undefined],
          ["Prêt", r.financement === "pret" ? [r.montantPret != null && eur(r.montantPret), r.dureePret && `sur ${r.dureePret} ans`, r.tauxMax && `taux max ${r.tauxMax.toLocaleString("fr-FR")} %`].filter(Boolean).join(", ") : undefined],
          ["Banque ou courtier", r.banque],
          ["Accord de principe", r.financement === "pret" ? ouiNon(r.accordPrincipe) : undefined],
          ["Vente d'un bien nécessaire", r.venteBien == null ? undefined : r.venteBien ? `Oui${r.venteBienDetail ? ` (${r.venteBienDetail})` : ""}` : "Non"],
          ["Origine des fonds", r.origineFonds?.length ? r.origineFonds.join(", ") + (r.origineFondsDetail ? ` (${r.origineFondsDetail})` : "") : undefined],
          ["Banque des fonds", r.etablissementFonds],
        ],
      }
    );
  }
  g.push({
    titre: "Vérifications légales",
    etape: 6,
    lcb: true,
    lignes: [
      ["Personne politiquement exposée", r.ppe === "non" ? "Non" : r.ppe ? `${r.ppe === "moi" ? "Oui, personnellement" : "Oui, un proche"}${r.ppeDetail ? ` : ${r.ppeDetail}` : ""}` : undefined],
      ["Agit pour son propre compte", r.propreCompte == null ? undefined : r.propreCompte ? "Oui" : `Non${r.pourCompteDe ? `, pour ${r.pourCompteDe}` : ""}`],
      ["Résidence fiscale", r.residenceFiscale],
    ],
  });
  return g;
}

/* ---------- Nettoyage des réponses reçues (serveur) ---------- */

const propre = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined);
const montant = (v: unknown, max = 100_000_000) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : undefined);
const entier = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const choix = <T extends string>(v: unknown, vals: readonly T[]) => (typeof v === "string" && (vals as readonly string[]).includes(v) ? (v as T) : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
const tel = (v: unknown) => {
  const t = propre(v, 24);
  return t && /^[+\d][\d .()-]{5,22}$/.test(t) ? t : undefined;
};
const mail = (v: unknown) => {
  const t = propre(v, 120);
  return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : undefined;
};
/** Supprime les clés vides, pour garder la base légère. */
const sansVide = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && !(Array.isArray(v) && !v.length))) as T;

function nettoyerPersonne(src: Record<string, unknown>): Personne {
  return sansVide({
    civilite: choix(src.civilite, ["M.", "Mme"] as const),
    prenom: propre(src.prenom, 80),
    nom: propre(src.nom, 80),
    nomNaissance: propre(src.nomNaissance, 80),
    dateNaissance: date(src.dateNaissance),
    lieuNaissance: propre(src.lieuNaissance, 120),
    nationalite: propre(src.nationalite, 60),
    profession: propre(src.profession, 120),
    adresse: propre(src.adresse, 240),
    tel: tel(src.tel),
    email: mail(src.email),
    lien: propre(src.lien, 80),
    ppe: choix(src.ppe, ["non", "moi", "proche"] as const),
  });
}

/** Ne garde que les champs connus, au bon format et à la bonne taille. Tout le reste est ignoré. */
export function nettoyerReponses(kind: KindFiche, entree: unknown): Reponses {
  if (!entree || typeof entree !== "object" || Array.isArray(entree)) return {};
  const s = entree as Record<string, unknown>;
  const soc = s.societe && typeof s.societe === "object" && !Array.isArray(s.societe) ? (s.societe as Record<string, unknown>) : null;
  const autres = Array.isArray(s.autres)
    ? s.autres
        .filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p))
        .slice(0, MAX_AUTRES)
        .map(({ lien, ...p }) => ({ ...nettoyerPersonne(p), ...(propre(lien, 80) ? { lien: propre(lien, 80) } : {}) }))
    : undefined;
  const liste = (v: unknown, vals: readonly string[]) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && vals.includes(x)))] : undefined);
  const commun: Reponses = {
    ...nettoyerPersonne(s),
    lien: undefined,
    situation: choix(s.situation, SITUATIONS.map((x) => x.v)),
    regime: choix(s.regime, REGIMES.map((x) => x.v)),
    regimePacs: choix(s.regimePacs, REGIMES_PACS.map((x) => x.v)),
    dateMariage: date(s.dateMariage),
    lieuMariage: propre(s.lieuMariage, 120),
    parties: choix(s.parties, ["seul", "couple", "plusieurs", "societe"] as const),
    autres,
    societe: soc
      ? sansVide({
          denomination: propre(soc.denomination, 160),
          forme: propre(soc.forme, 40),
          siren: propre(soc.siren, 20),
          siege: propre(soc.siege, 240),
          qualite: propre(soc.qualite, 80),
          beneficiaires: propre(soc.beneficiaires, 500),
        })
      : undefined,
    ppeDetail: propre(s.ppeDetail, 300),
    propreCompte: bool(s.propreCompte),
    pourCompteDe: propre(s.pourCompteDe, 200),
    residenceFiscale: propre(s.residenceFiscale, 60),
    accord: s.accord === true ? true : undefined,
  };
  const specifique =
    kind === "vendeur"
      ? {
          bienAdresse: propre(s.bienAdresse, 240),
          bienNature: choix(s.bienNature, NATURES),
          lots: propre(s.lots, 200),
          carrez: propre(s.carrez, 40),
          occupation: choix(s.occupation, ["libre", "occupe", "loue"] as const),
          loyer: montant(s.loyer, 100_000),
          finBail: date(s.finBail),
          residenceFamille: bool(s.residenceFamille),
          syndic: propre(s.syndic, 240),
          chargesAnnuelles: montant(s.chargesAnnuelles, 1_000_000),
          taxeFonciere: montant(s.taxeFonciere, 1_000_000),
          anneeConstruction: entier(s.anneeConstruction, 1000, 2100),
          diagnostics: liste(s.diagnostics, DIAGNOSTICS),
          travaux: propre(s.travaux, 500),
          prixSouhaite: montant(s.prixSouhaite),
          origine: choix(s.origine, ORIGINES.map((x) => x.v)),
          origineAnnee: entier(s.origineAnnee, 1900, 2100),
          origineNotaire: propre(s.origineNotaire, 200),
          prixAcquisition: montant(s.prixAcquisition),
          credit: bool(s.credit),
          creditBanque: propre(s.creditBanque, 120),
          notaireVente: propre(s.notaireVente, 200),
          projet: propre(s.projet, 300),
        }
      : {
          prixPropose: montant(s.prixPropose),
          destination: choix(s.destination, DESTINATIONS.map((x) => x.v)),
          conditions: propre(s.conditions, 600),
          financement: choix(s.financement, ["pret", "comptant"] as const),
          apport: montant(s.apport),
          montantPret: montant(s.montantPret),
          dureePret: entier(s.dureePret, 1, 40),
          tauxMax: typeof s.tauxMax === "number" && Number.isFinite(s.tauxMax) && s.tauxMax > 0 && s.tauxMax < 20 ? Math.round(s.tauxMax * 100) / 100 : undefined,
          banque: propre(s.banque, 160),
          accordPrincipe: bool(s.accordPrincipe),
          venteBien: bool(s.venteBien),
          venteBienDetail: propre(s.venteBienDetail, 200),
          origineFonds: liste(s.origineFonds, ORIGINES_FONDS),
          origineFondsDetail: propre(s.origineFondsDetail, 300),
          etablissementFonds: propre(s.etablissementFonds, 160),
        };
  return sansVide({ ...commun, ...specifique });
}

export const nettoyerPrenom = (v: unknown) => propre(v, 60) ?? "";

export function nettoyerControle(entree: unknown): Controle {
  if (!entree || typeof entree !== "object" || Array.isArray(entree)) return {};
  const s = entree as Record<string, unknown>;
  return sansVide({
    risque: choix(s.risque, ["faible", "moyen", "eleve"] as const),
    identiteVerifiee: bool(s.identiteVerifiee),
    justificatifs: bool(s.justificatifs),
    commentaire: propre(s.commentaire, 600),
    par: propre(s.par, 80),
    le: date(s.le),
  });
}
