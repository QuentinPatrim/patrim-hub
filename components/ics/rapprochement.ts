import type { Bien, Contact } from "@/lib/types";
import type { ContactEtatCivil } from "@/components/offre/offre";
import type { Tableau } from "./lecture";

/* Rapprochement d'un export ICS avec les propriétaires du Hub.
   Seuls les propriétaires déjà dans le Hub sont cherchés : les autres lignes du fichier sont ignorées.
   On ne propose que de remplir des champs vides ; une valeur différente est signalée, jamais remplacée.
   Module pur (testable hors navigateur). */

export type Champ = "tel" | "email" | "adresse" | "civilite" | "prenom" | "dateNaissance" | "lieuNaissance" | "profession";
type Role = Exclude<Champ, "adresse"> | "portable" | "nom" | "nomComplet" | "adresse" | "complement" | "cp" | "ville";

export const CHAMPS: Champ[] = ["tel", "email", "adresse", "civilite", "prenom", "dateNaissance", "lieuNaissance", "profession"];
export const LIBELLE: Record<Champ, string> = {
  tel: "Téléphone",
  email: "E-mail",
  adresse: "Adresse",
  civilite: "Civilité",
  prenom: "Prénom",
  dateNaissance: "Date de naissance",
  lieuNaissance: "Lieu de naissance",
  profession: "Profession",
};
const LIBELLE_ROLE: Record<Role, string> = { ...LIBELLE, portable: "Portable", nom: "Nom", nomComplet: "Nom", complement: "Complément d'adresse", cp: "Code postal", ville: "Ville" };

/* ---------- normalisation ---------- */

export const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const entete = (s: string) => sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const mots = (s?: string) => sansAccents(s ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
const ESPACES = /\s+/g;

/** Mots qui ne font pas partie d'un nom (civilités, liaisons). */
const VIDES = new Set(["M", "MR", "MM", "MME", "MMES", "MLLE", "MONSIEUR", "MADAME", "MADEMOISELLE", "MESSIEURS", "MESDAMES", "ET", "OU", "EPOUSE", "EP", "NEE", "NE", "VEUVE", "VVE", "DR", "DOCTEUR", "ME", "MAITRE"]);
const nomMots = (s?: string) => mots(s).filter((m) => !VIDES.has(m));

/** Numéro français au format 06 12 34 56 78 ; numéro étranger gardé tel quel. */
export function telNormal(brut: string): string | undefined {
  const s = brut.trim();
  let d = s.replace(/[^\d+]/g, "");
  if (d.replace(/\D/g, "").length < 6) return undefined;
  if (d.startsWith("+33")) d = "0" + d.slice(3);
  else if (d.startsWith("0033")) d = "0" + d.slice(4);
  else if (d.startsWith("33") && d.length === 11) d = "0" + d.slice(2);
  else if (/^[1-9]\d{8}$/.test(d)) d = "0" + d; // zéro de tête perdu dans Excel
  if (/^0[1-9]\d{8}$/.test(d)) return d.replace(/(\d{2})(?=\d)/g, "$1 ");
  return s.replace(ESPACES, " ");
}
const telChiffres = (t?: string) => {
  const d = (t ?? "").replace(/[^\d+]/g, "").replace(/^\+33|^0033/, "0");
  return /^[1-9]\d{8}$/.test(d) ? "0" + d : d;
};
const estPortable = (t: string) => /^0[67]/.test(telChiffres(t));

const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i;

/** Date au format AAAA-MM-JJ, depuis 03/02/1950, 1950-02-03 ou un numéro de série Excel. */
export function dateNormale(brut: string): string | undefined {
  const s = brut.trim();
  const iso = (a: number, m: number, j: number) => {
    const d = new Date(Date.UTC(a, m - 1, j));
    if (a < 1900 || a > 2030 || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return undefined;
    return d.toISOString().slice(0, 10);
  };
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return undefined;
}

/** « JEAN-YVES » → « Jean-Yves » (laissé tel quel s'il a déjà des minuscules). */
const propre = (s: string) =>
  s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : s;

const PLUSIEURS = /\bet\b|&|,|\/|\bou\b/i;

function civiliteDe(s: string): "M." | "Mme" | undefined {
  if (PLUSIEURS.test(s)) return undefined;
  const m = mots(s);
  if (m.some((x) => ["MM", "MMES", "MESSIEURS", "MESDAMES"].includes(x))) return undefined;
  if (["M", "MR", "MONSIEUR"].includes(m[0])) return "M.";
  if (["MME", "MADAME", "MLLE", "MADEMOISELLE"].includes(m[0])) return "Mme";
  return undefined;
}

/* ---------- colonnes ---------- */

const REGLES: [Role, RegExp][] = [
  ["email", /\b(e ?mail|mail|courriel|mel)\b/],
  ["portable", /\b(portable|mobile|gsm|cellulaire)\b/],
  ["tel", /\b(tel|tels|telephone|telephones|phone|fixe|domicile)\b/],
  ["lieuNaissance", /\blieu (de )?naissance\b|\bne( ?e)? a\b|\bville (de )?naissance\b/],
  ["dateNaissance", /\bdate (de )?naissance\b|\bne( ?e)? le\b|^naissance$/],
  ["cp", /\b(code postal|cp|postal)\b/],
  ["ville", /\b(ville|commune|localite)\b/],
  ["complement", /\b(complement|residence|batiment|bat)\b/],
  ["adresse", /\b(adresse|adr|rue|voie)\b/],
  ["nomComplet", /\b(nom (et )?prenoms?|prenoms? (et )?nom|nom complet|proprietaires?|mandants?|bailleurs?|coproprietaires?|designation|intitule|raison sociale|libelle|identite|denomination)\b/],
  ["prenom", /\bprenoms?\b/],
  ["nom", /\bnom( de famille| usuel| de naissance)?\b/],
  ["civilite", /\b(civilite|civ|titre|qualite)\b/],
  ["profession", /\b(profession|metier)\b/],
];
/** Colonnes qui parlent d'une autre personne ou du bien, jamais reprises. */
const AUTRE_PERSONNE = /\b(locataires?|occupants?|syndic|gardien|notaire|agence|banque|garant|caution|conjoint|epoux|epouse|contact urgence)\b/;
const DU_BIEN = /\b(bien|biens|lot|lots|immeuble|logement|local|location|propriete|residence principale)\b/;
const IDENTIFIANT = /\b(code|n|no|num|numero|ref|reference|id|matricule|compte|iban|rib|bic)\b/;

export interface Colonnes {
  ligne: number; // index de la ligne d'en-têtes
  roles: Map<Role, number[]>;
}

function reconnaitre(ligne: string[]): Map<Role, number[]> {
  const roles = new Map<Role, number[]>();
  ligne.forEach((brut, i) => {
    const h = entete(brut);
    if (!h || h.length > 60 || AUTRE_PERSONNE.test(h)) return;
    if (/\b(iban|rib|bic|nir|secu|securite sociale|revenu|salaire|impot)\b/.test(h)) return; // jamais
    for (const [role, re] of REGLES) {
      if (!re.test(h)) continue;
      const adresse = role === "adresse" || role === "complement" || role === "cp" || role === "ville";
      if (adresse && DU_BIEN.test(h)) return;
      if ((role === "nom" || role === "nomComplet" || role === "prenom") && IDENTIFIANT.test(h)) return;
      roles.set(role, [...(roles.get(role) ?? []), i]);
      return;
    }
  });
  return roles;
}

const DONNEES: Role[] = ["tel", "portable", "email", "adresse", "dateNaissance", "lieuNaissance", "profession"];

export function trouverColonnes(t: Tableau): Colonnes | null {
  let meilleure: Colonnes | null = null;
  let record = 0;
  for (let i = 0; i < Math.min(t.length, 15); i++) {
    const roles = reconnaitre(t[i]);
    const nom = roles.has("nom") || roles.has("nomComplet");
    const donnees = DONNEES.filter((r) => roles.has(r)).length;
    const score = donnees * 10 + roles.size;
    if (nom && donnees && score > record) {
      record = score;
      meilleure = { ligne: i, roles };
    }
  }
  return meilleure;
}

/** Libellés des colonnes reconnues, pour l'affichage. */
export function colonnesLues(t: Tableau, c: Colonnes): string[] {
  const vus = new Set<string>();
  for (const [role, idx] of c.roles) {
    if (role === "nom" || role === "nomComplet") vus.add("Nom");
    else for (const i of idx) vus.add(t[c.ligne][i] || LIBELLE_ROLE[role]);
  }
  return [...vus];
}

/* ---------- fiches du fichier ---------- */

export interface Fiche {
  ligne: number;
  /** Nom tel qu'écrit dans le fichier. */
  libelle: string;
  mots: string[];
  /** Prénoms donnés par une colonne dédiée (vide si aucune). */
  prenoms: string[];
  valeurs: Partial<Record<Champ, string>>;
  /** Autres téléphones ou e-mails de la ligne, pour information. */
  autres: string[];
}

function fiche(l: string[], i: number, c: Colonnes): Fiche | null {
  const cel = (r: Role) => (c.roles.get(r) ?? []).map((k) => (l[k] ?? "").trim()).filter(Boolean);
  const un = (r: Role) => cel(r).join(" ").replace(ESPACES, " ").trim();
  const civ = un("civilite");
  const nom = un("nom");
  const prenom = un("prenom");
  const complet = un("nomComplet");
  const libelle = (complet || [civ, nom, prenom].filter(Boolean).join(" ")).replace(ESPACES, " ").trim();
  const motsNom = nomMots(complet || `${nom} ${prenom}`);
  if (!motsNom.length) return null;

  const valeurs: Fiche["valeurs"] = {};
  const autres: string[] = [];

  const tels = [...cel("portable"), ...cel("tel")]
    .flatMap((x) => x.split(/[;,|/]|\bou\b/i))
    .map(telNormal)
    .filter((x): x is string => !!x);
  const uniques = tels.filter((t, k) => tels.findIndex((u) => telChiffres(u) === telChiffres(t)) === k);
  uniques.sort((a, b) => Number(estPortable(b)) - Number(estPortable(a)));
  if (uniques[0]) valeurs.tel = uniques[0];
  autres.push(...uniques.slice(1));

  const mails = cel("email")
    .flatMap((x) => x.split(/[;,\s]+/))
    .map((x) => x.trim().toLowerCase().replace(/^mailto:/, ""))
    .filter((x) => EMAIL.test(x));
  const mailsUniques = [...new Set(mails)];
  if (mailsUniques[0]) valeurs.email = mailsUniques[0];
  autres.push(...mailsUniques.slice(1));

  const rue = [un("adresse"), un("complement")].filter(Boolean).join(", ");
  if (rue) {
    const ville = [un("cp"), un("ville")].filter(Boolean).join(" ");
    valeurs.adresse = [rue, ville].filter(Boolean).join(", ");
  }

  const civilite = civiliteDe(civ || complet);
  if (civilite) valeurs.civilite = civilite;
  if (prenom && !PLUSIEURS.test(prenom)) valeurs.prenom = propre(prenom);
  const naissance = dateNormale(un("dateNaissance"));
  if (naissance) valeurs.dateNaissance = naissance;
  const lieu = un("lieuNaissance");
  if (lieu) valeurs.lieuNaissance = lieu;
  const metier = un("profession");
  if (metier) valeurs.profession = metier;

  return { ligne: i, libelle, mots: motsNom, prenoms: prenom ? prenom.split(PLUSIEURS).flatMap(nomMots) : [], valeurs, autres };
}

/* ---------- rapprochement ---------- */

export type Niveau = "nomPrenom" | "nom";

export interface Proposition {
  champ: Champ;
  valeur: string;
  /** Valeur actuelle du Hub, quand elle diffère. */
  actuel?: string;
}

export interface Candidat {
  fiche: Fiche;
  niveau: Niveau;
  ajouts: Proposition[];
  differences: Proposition[];
}

export interface Rapprochement {
  contact: Contact;
  biens: Bien[];
  candidats: Candidat[];
}

export interface Analyse {
  /** Lignes de personnes lues dans le fichier. */
  lignes: number;
  colonnes: string[];
  /** Propriétaires du Hub retrouvés dans le fichier. */
  retrouves: Rapprochement[];
  /** Propriétaires du Hub absents du fichier. */
  absents: Contact[];
}

const position = (meule: string[], aiguille: string[]) => {
  for (let i = 0; i + aiguille.length <= meule.length; i++) if (aiguille.every((m, k) => meule[i + k] === m)) return i;
  return -1;
};

function niveau(c: Contact, f: Fiche): Niveau | null {
  const nom = nomMots(c.nom);
  if (!nom.length) return null;
  const p = position(f.mots, nom);
  if (p < 0) return null;
  // Civilités contraires : ce n'est pas la même personne (M. DUPONT pour Mme DUPONT).
  if (c.civilite && f.valeurs.civilite && c.civilite !== f.valeurs.civilite) return null;
  const prenom = nomMots(c.prenom);
  if (!prenom.length) return "nom";
  const reste = f.prenoms.length ? f.prenoms : f.mots.filter((_, k) => k < p || k >= p + nom.length);
  if (reste.includes(prenom[0])) return "nomPrenom";
  // Le fichier donne un autre prénom : sans doute un autre membre de la famille.
  return reste.length ? null : "nom";
}

const pareil = (champ: Champ, a: string, b: string) => {
  if (champ === "tel") return telChiffres(a) === telChiffres(b);
  if (champ === "email") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return mots(a).join(" ") === mots(b).join(" ");
};

function propositions(c: Contact, f: Fiche) {
  const ec = c as ContactEtatCivil;
  const ajouts: Proposition[] = [];
  const differences: Proposition[] = [];
  for (const champ of CHAMPS) {
    const valeur = f.valeurs[champ];
    if (!valeur) continue;
    const actuel = (ec[champ] as string | undefined)?.trim();
    if (!actuel) ajouts.push({ champ, valeur });
    else if (!pareil(champ, actuel, valeur) && champ !== "civilite" && champ !== "prenom") differences.push({ champ, valeur, actuel });
  }
  return { ajouts, differences };
}

/** Propriétaires du Hub : rôle vendeur ou prospect vendeur, ou vendeur d'un bien. */
export function proprietaires(contacts: Contact[], biens: Bien[]) {
  const ids = new Set(biens.flatMap((b) => b.vendeurIds ?? []));
  return contacts.filter((c) => ids.has(c.id) || c.roles?.includes("vendeur") || c.roles?.includes("prospect_vendeur"));
}

export function analyser(t: Tableau, contacts: Contact[], biens: Bien[]): Analyse | { colonnesTrouvees: string[] } {
  const c = trouverColonnes(t);
  // En-têtes seulement (jamais une ligne de données : pas d'arobase, presque pas de chiffres).
  const titres = (l: string[]) => l.filter((x) => x && x.length <= 40 && !x.includes("@") && (x.match(/\d/g) ?? []).length < 3);
  if (!c) return { colonnesTrouvees: titres(t.find((l) => titres(l).length >= 2) ?? []).slice(0, 20) };
  const fiches = t
    .slice(c.ligne + 1)
    .map((l, k) => fiche(l, c.ligne + 1 + k, c))
    .filter((f): f is Fiche => !!f);

  const retrouves: Rapprochement[] = [];
  const absents: Contact[] = [];
  for (const contact of proprietaires(contacts, biens)) {
    const candidats: Candidat[] = [];
    for (const f of fiches) {
      const n = niveau(contact, f);
      if (n) candidats.push({ fiche: f, niveau: n, ...propositions(contact, f) });
    }
    // Les fiches au nom et prénom exacts passent devant ; au-delà de 5 homonymes, on n'en garde que 5.
    candidats.sort((a, b) => Number(b.niveau === "nomPrenom") - Number(a.niveau === "nomPrenom") || b.ajouts.length - a.ajouts.length);
    if (!candidats.length) absents.push(contact);
    else retrouves.push({ contact, biens: biens.filter((b) => b.vendeurIds?.includes(contact.id)), candidats: candidats.slice(0, 5) });
  }
  const tri = (x: Contact) => `${mots(x.nom).join(" ")} ${mots(x.prenom).join(" ")}`;
  retrouves.sort((a, b) => Number(b.candidats.some((k) => k.ajouts.length)) - Number(a.candidats.some((k) => k.ajouts.length)) || tri(a.contact).localeCompare(tri(b.contact)));
  absents.sort((a, b) => tri(a).localeCompare(tri(b)));
  return { lignes: fiches.length, colonnes: colonnesLues(t, c), retrouves, absents };
}

/** Choix par défaut : la seule fiche au nom et prénom exacts, sinon aucune (à choisir). */
export const choixParDefaut = (r: Rapprochement) => (r.candidats.length === 1 && r.candidats[0].niveau === "nomPrenom" ? 0 : -1);

/** Valeur lisible d'une proposition. */
export function valeurAffichee(p: Proposition) {
  if (p.champ === "dateNaissance") {
    const d = new Date(p.valeur + "T12:00:00Z");
    return isNaN(d.getTime()) ? p.valeur : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  }
  return p.valeur;
}

/** Modifications à enregistrer sur un contact (champs vides seulement) et note d'historique. */
export function modification(c: Contact, choisis: Proposition[], maintenant = new Date()) {
  const ec = c as ContactEtatCivil;
  const patch: Record<string, unknown> = {};
  for (const p of choisis) if (!(ec[p.champ] as string | undefined)?.trim()) patch[p.champ] = p.valeur;
  const champs = Object.keys(patch) as Champ[];
  if (!champs.length) return null;
  const liste = champs.map((k) => LIBELLE[k].toLowerCase());
  patch.historique = [...(c.historique ?? []), { date: maintenant.toISOString(), type: "note" as const, texte: `Complété depuis ICS : ${liste.join(", ")}.` }];
  return { patch, champs };
}
