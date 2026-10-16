import type { Bien, Contact } from "@/lib/types";
import type { ContactEtatCivil } from "@/components/offre/offre";
import type { Tableau } from "./lecture";

/* Rapprochement d'un export ICS avec les propriétaires du Hub.
   Seuls les propriétaires déjà dans le Hub sont cherchés : les autres lignes du fichier sont ignorées.
   On ne propose que de remplir des champs vides ; une valeur différente est signalée, jamais remplacée.
   Module pur (testable hors navigateur). */

export type Champ = "tel" | "email" | "adresse" | "civilite" | "prenom" | "dateNaissance" | "lieuNaissance" | "profession";
type Role = Exclude<Champ, "adresse"> | "portable" | "coordonnees" | "nom" | "nomComplet" | "adresse" | "complement" | "cp" | "ville";

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
const LIBELLE_ROLE: Record<Role, string> = { ...LIBELLE, portable: "Portable", coordonnees: "Coordonnées", nom: "Nom", nomComplet: "Nom", complement: "Complément d'adresse", cp: "Code postal", ville: "Ville" };

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
  let d = s.replace(/\(0\)/g, "").replace(/[^\d+]/g, "");
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

/* Téléphones et e-mails pris dans un texte libre : « Tél. dom : 05 61… Port. : 06… Mail : x@y.fr ». */
const MAIL_DANS = /[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}/gi;
const TEL_FR = /(?:(?:\+|\b00)33[\s.-]?(?:\(0\)[\s.-]?)?|\b0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g;
const TEL_ETRANGER = /(?:\+|\b00)(?!33)\d[\d\s.-]{6,16}\d(?!\d)/g;

export function coordonnees(texte: string): { tels: string[]; mails: string[] } {
  const mails = [...texte.matchAll(MAIL_DANS)].map((m) => m[0].toLowerCase()).filter((x) => EMAIL.test(x));
  const reste = texte.replace(MAIL_DANS, " ");
  // Un numéro seul de 9 chiffres : le zéro de tête a été perdu dans Excel.
  const bruts = /^\s*[1-9]\d{8}\s*$/.test(reste) ? [reste] : [...reste.matchAll(TEL_FR)].map((m) => m[0]);
  bruts.push(...[...reste.replace(TEL_FR, " ").matchAll(TEL_ETRANGER)].map((m) => m[0]));
  return { tels: bruts.map(telNormal).filter((x): x is string => !!x), mails };
}

/* Étiquettes qui accompagnent un numéro ou un e-mail (« Tél. : », « Port. », « (dom) »). */
const ETIQUETTE = /(^|\s)\(?(t[ée]l[ée]?(phone)?s?|port(able)?|mob(ile)?|gsm|fax|bur(eau)?|dom(icile)?|perso|pro|e-?mails?|mails?|courriels?|m[ée]l)\)?\.?\s*:?(?=\s|$)/gi;

/** Texte d'une cellule sans ses numéros, e-mails et étiquettes ; vide si elle ne contient que cela. */
function sansCoordonnees(s: string) {
  const net = (x: string) => x.replace(ETIQUETTE, " ").replace(/^[\s:;,/|–-]+|[\s:;,/|–-]+$/g, "").replace(ESPACES, " ").trim();
  const sans = s.replace(MAIL_DANS, " ").replace(TEL_FR, " ").replace(TEL_ETRANGER, " ");
  if (sans !== s) return net(sans);
  return net(s) ? s.replace(ESPACES, " ").trim() : "";
}

/* Ligne d'adresse sous un nom (« 12 rue des Lilas », « 31000 TOULOUSE ») : jamais prise pour une personne. */
const PERSONNE_OU_SOCIETE = /^(m|mr|mme|mlle|mm|mmes|monsieur|madame|mademoiselle|messieurs|mesdames|sci|sarl|sas|sasu|sa|eurl|snc|scp|sccv|indivision|consorts|succession|ste|societe|cabinet|association|syndicat)\b/;
const RUE = /\b(rue|avenue|av|bd|boulevard|chemin|impasse|allees?|route|quai|residence|lotissement|lieu dit|batiment|bat|appt|appartement|escalier|etage|bp|cs|cedex|faubourg|square|passage|voie)\b/;
function adresseProbable(s: string) {
  const t = sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !PERSONNE_OU_SOCIETE.test(t) && (/^\d/.test(t) || /\b\d{5}\b/.test(t) || RUE.test(t));
}

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
  ["coordonnees", /\bcoordonnees\b|\b(tels?|telephones?)\b.*\b(e ?mails?|mails?|courriels?)\b|\b(e ?mails?|mails?|courriels?)\b.*\b(tels?|telephones?)\b/],
  ["email", /\b(e ?mails?|mails?|courriels?|mel)\b/],
  ["portable", /\b(portable|mobile|gsm|cellulaire)\b/],
  ["tel", /\b(tel|tels|telephone|telephones|phone|fixe|domicile)\b/],
  ["lieuNaissance", /\blieu (de )?naissance\b|\bne( ?e)? a\b|\bville (de )?naissance\b/],
  ["dateNaissance", /\bdate (de )?naissance\b|\bne( ?e)? le\b|^naissance$/],
  ["cp", /\b(code postal|cp|postal)\b/],
  ["ville", /\b(ville|commune|localite)\b/],
  ["complement", /\b(complement|residence|batiment|bat)\b/],
  ["adresse", /\b(adresse|adr|rue|voie)\b/],
  ["nomComplet", /\b(nom (et )?prenoms?|prenoms? (et )?nom|nom complet|proprietaires?|mandants?|bailleurs?|coproprietaires?|personnes?|tiers|contacts?|interlocuteurs?|designation|intitule|raison sociale|libelle|identite|denomination)\b/],
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
    // Une phrase (« Choix : Propriétaires - Edité le 16/10/2026 ») n'est pas un titre de colonne.
    if (/\S\s*:\s*\S/.test(brut) || /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(brut) || h.split(" ").length > 6) return;
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

const DONNEES: Role[] = ["tel", "portable", "coordonnees", "email", "adresse", "dateNaissance", "lieuNaissance", "profession"];

/** Colonnes sans titre faites surtout de téléphones ou d'e-mails (une colonne titrée mais inconnue n'est jamais lue). */
function colonnesDeCoordonnees(t: Tableau, ligne: number, prises: Set<number>): number[] {
  const lignes = t.slice(ligne + 1, ligne + 301);
  const largeur = Math.max(0, ...lignes.map((l) => l.length));
  const res: number[] = [];
  for (let k = 0; k < largeur; k++) {
    if (prises.has(k) || (ligne >= 0 && (t[ligne][k] ?? "").trim())) continue;
    let pleines = 0;
    let oui = 0;
    for (const l of lignes) {
      const v = (l[k] ?? "").trim();
      if (!v) continue;
      pleines++;
      const x = coordonnees(v);
      if (x.tels.length || x.mails.length) oui++;
    }
    if (pleines && oui / pleines >= 0.5) res.push(k);
  }
  return res;
}

const commeUnNom = (v: string) => /\p{L}{2}/u.test(v) && !v.includes("@") && (v.match(/\d/g) ?? []).length < 3;

export function trouverColonnes(t: Tableau): Colonnes | null {
  let meilleure: Colonnes | null = null;
  let record = 0;
  for (let i = 0; i < Math.min(t.length, 15); i++) {
    const roles = reconnaitre(t[i]);
    const nom = roles.has("nom") || roles.has("nomComplet");
    // Colonne de coordonnées sans titre (ex. ICS « Liste Téléphones et Mails » : « Personnes » puis une colonne vide),
    // seulement quand la ligne ne parle d'aucune autre personne (locataire, garant…).
    if (nom && !t[i].some((x) => AUTRE_PERSONNE.test(entete(x)))) {
      const extra = colonnesDeCoordonnees(t, i, new Set([...roles.values()].flat()));
      if (extra.length) roles.set("coordonnees", [...(roles.get("coordonnees") ?? []), ...extra]);
    }
    const donnees = DONNEES.filter((r) => roles.has(r)).length;
    const score = donnees * 10 + roles.size;
    if (nom && donnees && score > record) {
      record = score;
      meilleure = { ligne: i, roles };
    }
  }
  if (meilleure) return meilleure;
  // Fichier sans ligne de titres : une seule colonne de noms et des colonnes de coordonnées, sinon on ne devine pas.
  const contacts = colonnesDeCoordonnees(t, -1, new Set());
  if (!contacts.length) return null;
  const lignes = t.slice(0, 300);
  const largeur = Math.max(0, ...lignes.map((l) => l.length));
  const noms: number[] = [];
  for (let k = 0; k < largeur; k++) {
    if (contacts.includes(k)) continue;
    const pleines = lignes.map((l) => (l[k] ?? "").trim()).filter(Boolean);
    if (pleines.length && pleines.filter(commeUnNom).length / pleines.length >= 0.8) noms.push(k);
  }
  return noms.length === 1 ? { ligne: -1, roles: new Map<Role, number[]>([["nomComplet", noms], ["coordonnees", contacts]]) } : null;
}

/** Libellés des colonnes reconnues, pour l'affichage. */
export function colonnesLues(t: Tableau, c: Colonnes): string[] {
  const vus = new Set<string>();
  for (const [role, idx] of c.roles) {
    if (role === "nom" || role === "nomComplet") vus.add("Nom");
    else for (const i of idx) vus.add((c.ligne >= 0 ? t[c.ligne][i] : "") || LIBELLE_ROLE[role]);
  }
  return [...vus];
}

/** Titre de colonne connu, jamais une donnée de personne : seul affiché quand un fichier n'est pas reconnu. */
function enteteConnu(x: string) {
  const h = entete(x);
  if (!h || h.length > 40 || /\d/.test(h)) return false;
  return REGLES.some(([, re]) => re.test(h)) || AUTRE_PERSONNE.test(h) || DU_BIEN.test(h) || IDENTIFIANT.test(h) || /\b(type|nature|date|observations?|commentaires?|remarques?|fax|statut|categorie|solde|montant)\b/.test(h);
}

/** Cellule faite uniquement de mots de titre (« Personnes », « Nom et prénom ») : un titre répété, pas une personne. */
const MOTS_DE_TITRE = new Set(
  ("nom noms prenom prenoms personne personnes proprietaire proprietaires coproprietaire coproprietaires mandant mandants bailleur bailleurs " +
    "tiers contact contacts interlocuteur interlocuteurs identite designation intitule libelle denomination raison sociale civilite civ titre " +
    "qualite tel tels telephone telephones phone fixe domicile portable portables mobile gsm fax mail mails email emails e courriel courriels mel " +
    "coordonnees adresse adresses complement code postal cp ville commune localite date lieu naissance ne nee profession metier observations " +
    "commentaires remarques type nature statut categorie n no num numero ref reference et ou de du des la le les a au aux d l").split(" "),
);
function titreSeul(x: string) {
  const m = entete(x).split(" ").filter(Boolean);
  return m.length > 0 && m.length <= 6 && m.every((w) => MOTS_DE_TITRE.has(w)) && m.some((w) => w.length > 2);
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

/** Téléphones et e-mails d'une ligne, colonne « Portable » d'abord. */
function contactsDe(l: string[], c: Colonnes) {
  const tels: string[] = [];
  const mails: string[] = [];
  for (const r of ["portable", "tel", "coordonnees", "email", "nomComplet", "nom", "prenom"] as Role[])
    for (const k of c.roles.get(r) ?? []) {
      const x = coordonnees(l[k] ?? "");
      tels.push(...x.tels);
      mails.push(...x.mails);
    }
  return { tels, mails };
}

/** Portable de préférence ; les autres numéros et e-mails sont gardés pour information. */
function rangerContacts(f: Fiche, tels: string[], mails: string[]) {
  const uniques = tels.filter((t, k) => tels.findIndex((u) => telChiffres(u) === telChiffres(t)) === k);
  uniques.sort((a, b) => Number(estPortable(b)) - Number(estPortable(a)));
  const mailsUniques = [...new Set(mails)];
  if (uniques[0]) f.valeurs.tel = uniques[0];
  if (mailsUniques[0]) f.valeurs.email = mailsUniques[0];
  f.autres = [...uniques.slice(1), ...mailsUniques.slice(1)];
}

/** Personnes du fichier. Une ligne sans nom qui ne porte que des coordonnées complète la personne du dessus. */
function lireFiches(t: Tableau, c: Colonnes): Fiche[] {
  const lues: { f: Fiche; tels: string[]; mails: string[] }[] = [];
  let dessus: (typeof lues)[number] | undefined;
  const unSeulNom = !c.roles.has("nom") && !c.roles.has("prenom");
  for (let i = c.ligne + 1; i < t.length; i++) {
    let f = fiche(t[i], i, c);
    const x = contactsDe(t[i], c);
    // Titre de colonne répété : la personne du dessus s'arrête là.
    if (f && titreSeul(f.libelle)) {
      dessus = undefined;
      continue;
    }
    // Adresse écrite sous le nom, dans la même colonne : la suite de la personne du dessus.
    if (f && unSeulNom && dessus && adresseProbable(f.libelle)) f = null;
    if (f) lues.push((dessus = { f, ...x }));
    else if (dessus && (x.tels.length || x.mails.length)) {
      dessus.tels.push(...x.tels);
      dessus.mails.push(...x.mails);
    }
  }
  for (const { f, tels, mails } of lues) rangerContacts(f, tels, mails);
  return lues.map((x) => x.f);
}

const UNE_COLONNE: Colonnes = { ligne: -1, roles: new Map<Role, number[]>([["nomComplet", [0]]]) };
const CIVILITE = /^(m|mr|mme|mlle|monsieur|madame|mademoiselle)\b/;

/** Fichier sans colonnes reconnues (PDF, texte) : chaque ligne est lue comme « nom … coordonnées ».
    Deux noms complets sur une même ligne (propriétaire et locataire…) : ligne ignorée, on ne devine pas. */
function lireLignes(t: Tableau): Fiche[] {
  const lues: { f: Fiche; tels: string[]; mails: string[] }[] = [];
  let dessus: (typeof lues)[number] | undefined;
  t.forEach((l, i) => {
    const tels: string[] = [];
    const mails: string[] = [];
    const noms: string[] = [];
    for (const cel of l) {
      if (!cel.trim()) continue;
      const x = coordonnees(cel);
      tels.push(...x.tels);
      mails.push(...x.mails);
      const reste = sansCoordonnees(cel);
      if (reste && commeUnNom(reste) && !adresseProbable(reste) && !titreSeul(reste)) noms.push(reste);
    }
    if (noms.filter((n) => CIVILITE.test(entete(n))).length > 1 || noms.filter((n) => entete(n).split(" ").length > 1).length > 1) {
      dessus = undefined;
      return;
    }
    const f = noms.length ? fiche([noms.join(" ")], i, UNE_COLONNE) : null;
    if (f) lues.push((dessus = { f, tels, mails }));
    else if (dessus) {
      dessus.tels.push(...tels);
      dessus.mails.push(...mails);
    }
  });
  for (const { f, tels, mails } of lues) rangerContacts(f, tels, mails);
  return lues.map((x) => x.f);
}

function fiche(l: string[], i: number, c: Colonnes): Fiche | null {
  const cel = (r: Role) => (c.roles.get(r) ?? []).map((k) => (l[k] ?? "").trim()).filter(Boolean);
  const un = (r: Role) => cel(r).join(" ").replace(ESPACES, " ").trim();
  const civ = un("civilite");
  const nom = sansCoordonnees(un("nom"));
  const prenom = sansCoordonnees(un("prenom"));
  const complet = sansCoordonnees(un("nomComplet"));
  const libelle = (complet || [civ, nom, prenom].filter(Boolean).join(" ")).replace(ESPACES, " ").trim();
  // Un code (« P0012 ») ou un numéro n'est jamais un morceau de nom.
  const motsNom = nomMots(complet || `${nom} ${prenom}`).filter((m) => !/\d/.test(m));
  if (!motsNom.length) return null;

  const valeurs: Fiche["valeurs"] = {};
  const autres: string[] = [];

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
  let fiches = c ? lireFiches(t, c) : [];
  let colonnes = c ? colonnesLues(t, c) : [];
  const joignable = (f: Fiche) => !!(f.valeurs.tel || f.valeurs.email);
  if (!fiches.some(joignable)) {
    // Colonnes non reconnues (liste imprimée en PDF…) : lecture ligne à ligne.
    const parLigne = lireLignes(t);
    if (parLigne.some(joignable)) {
      fiches = parLigne;
      colonnes = ["Nom", "Coordonnées"];
    } else if (!c)
      // Titres connus seulement, pris sur une ligne qui en a au moins deux : jamais un nom ni une coordonnée.
      return { colonnesTrouvees: (t.slice(0, 15).find((l) => l.filter(enteteConnu).length >= 2) ?? []).filter(enteteConnu).slice(0, 20) };
  }

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
  return { lignes: fiches.length, colonnes, retrouves, absents };
}

/** Choix par défaut : la seule fiche au nom et prénom exacts, sinon aucune (à choisir). */
/** Code d'aide au dépannage : la forme du tableau lu, sans rien de son contenu (ni nom, ni coordonnée).
 *  Nombre de lignes ; pour chaque colonne, ce qu'elle contient surtout en % des lignes (N noms, T téléphones,
 *  M e-mails, D dates, 9 nombres, ? autre) ; ligne des titres et rôles reconnus (E) ; personnes lues par
 *  colonnes (F) et ligne à ligne (G), joignables sur total. */
export function empreinte(t: Tableau): string {
  const lignes = t.filter((l) => l.some((x) => x.trim()));
  const largeur = Math.min(8, lignes.reduce((n, l) => Math.max(n, l.length), 0));
  const genre = (v: string) => {
    if (v.includes("@")) return "M";
    if (coordonnees(v).tels.length) return "T";
    if (/\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(v)) return "D";
    const lettres = (v.match(/\p{L}/gu) ?? []).length;
    const chiffres = (v.match(/\d/g) ?? []).length;
    return lettres >= 2 && lettres >= chiffres ? "N" : chiffres > lettres ? "9" : "?";
  };
  const colonnes: string[] = [];
  for (let k = 0; k < largeur; k++) {
    const n = new Map<string, number>();
    for (const l of lignes) {
      const v = (l[k] ?? "").trim();
      if (v) n.set(genre(v), (n.get(genre(v)) ?? 0) + 1);
    }
    const parts = [...n].map(([g, x]) => [g, Math.round((100 * x) / lignes.length)] as const).filter(([, p]) => p >= 5);
    colonnes.push(parts.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, p]) => `${g}${p}`).join("") || "-");
  }
  const c = trouverColonnes(t);
  const compte = (f: Fiche[]) => `${f.filter((x) => x.valeurs.tel || x.valeurs.email).length}/${f.length}`;
  const roles = c ? `E${c.ligne + 1} ${[...c.roles].map(([r, k]) => `${r}${k.join("+")}`).join(",")}` : "E-";
  return `${lignes.length} lignes [${colonnes.join(" | ")}] ${roles} F${c ? compte(lireFiches(t, c)) : "-"} G${compte(lireLignes(t))}`;
}

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
