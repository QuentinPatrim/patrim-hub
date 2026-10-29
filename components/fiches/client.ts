"use client";

/* Côté conseiller : appels au serveur, lien à envoyer, et passage des
   réponses vers les fiches contact, le mandat de vente et l'offre d'achat.
   Rien n'est envoyé au client : l'appli prépare le message, le conseiller
   l'envoie lui-même. */

import { authHeaders } from "@/lib/ai";
import { create, getAll, update } from "@/lib/store";
import { conseiller, nomConseiller } from "@/lib/equipe";
import { titrePublic } from "@/lib/titrePublic";
import { ecrireMandat, lireMandat, mandatInitial, type Mandat } from "@/components/mandat/mandat";
import { ecrireOffre, lireOffre, offreInitiale, partieDepuisContact, type ContactEtatCivil, type Offre, type Partie } from "@/components/offre/offre";
import { dossierDe, type BienDossier } from "@/components/biens/dossier";
import type { Bien, Contact, ContactRole, Rdv } from "@/lib/types";
import { diagnosticsDe, type CleDiag } from "@/components/diagnostics/diagnostics";
import { avecAutres, decouperAdresse, DIAGNOSTICS, libelle, OCCUPATIONS, PIECES, type Civilite, type Controle, type ContextePublic, type Fiche, type KindFiche, type Personne, type Reponses } from "./fiche";

async function appeler<T>(init: { method: "GET" | "POST"; query?: string; corps?: unknown }): Promise<T> {
  const r = await fetch(`/api/fiches${init.query ?? ""}`, {
    method: init.method,
    headers: { ...(await authHeaders()), ...(init.corps ? { "content-type": "application/json" } : {}) },
    body: init.corps ? JSON.stringify(init.corps) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error || "Le serveur ne répond pas pour l'instant.");
  return j;
}

export const listerFiches = (bienId: string, kind?: KindFiche) =>
  appeler<{ fiches: Fiche[] }>({ method: "GET", query: `?bien=${encodeURIComponent(bienId)}${kind ? `&kind=${kind}` : ""}` }).then((r) => r.fiches);
export const creerFiche = (kind: KindFiche, bienId: string, contexte: ContextePublic, prenom: string, reponses?: Reponses) =>
  appeler<{ id: string; jeton: string }>({ method: "POST", corps: { action: "creer", kind, bienId, contexte, prenom, reponses } });
export const nouveauLienFiche = (id: string) => appeler<{ id: string; jeton: string }>({ method: "POST", corps: { action: "lien", id } });
export const fermerFiche = (id: string, ferme: boolean) => appeler<{ ok: true }>({ method: "POST", corps: { action: "fermer", id, ferme } });
export const controlerFiche = (id: string, controle: Controle) => appeler<{ controle: Controle }>({ method: "POST", corps: { action: "controler", id, controle } });
export const piecesFiche = (id: string, pieces: string[], recues: string[]) => appeler<{ contexte: ContextePublic }>({ method: "POST", corps: { action: "pieces", id, pieces, recues } });
export const supprimerFiche = (id: string) => appeler<{ ok: true }>({ method: "POST", corps: { action: "supprimer", id } });

export const lienFiche = (jeton: string) => `${window.location.origin}/informations/${jeton}`;

/** Le bien tel que le client le voit : rien sur le vendeur ni sur l'adresse exacte. */
export function contextePublic(b: Bien, kind: KindFiche): ContextePublic {
  const c = conseiller();
  return {
    titre: titrePublic(b),
    ville: b.ville || undefined,
    prix: kind === "acquereur" ? b.prix : undefined,
    photo: b.photos?.find((p) => p.startsWith("https://")),
    conseiller: { nom: nomConseiller(), tel: c.tel || undefined, mail: c.mail || undefined },
  };
}

/** La personne à qui le lien est envoyé. */
export interface Destinataire {
  civilite?: Civilite;
  prenom?: string;
  nom?: string;
}

/** « Bonjour Monsieur DUPONT, » : formule de politesse du message. */
export function salutation(d: Destinataire) {
  const nom = d.nom?.trim().toUpperCase();
  if (nom && d.civilite) return `Bonjour ${d.civilite === "M." ? "Monsieur" : "Madame"} ${nom},`;
  const qui = [d.prenom?.trim(), nom].filter(Boolean).join(" ");
  return qui ? `Bonjour ${qui},` : "Bonjour,";
}

export const objetFiche = (kind: KindFiche, contexte: ContextePublic) =>
  kind === "vendeur" ? "Votre fiche vendeur – PATRIM" : `Votre offre d'achat – ${contexte.titre}${contexte.ville ? `, ${contexte.ville}` : ""}`;

/** Texte prêt à envoyer avec le lien (mail, SMS, WhatsApp). */
export function messageFiche(kind: KindFiche, d: Destinataire, contexte: ContextePublic, url: string, dejaRempli = false) {
  const c = contexte.conseiller;
  const pour =
    kind === "vendeur"
      ? "Afin de préparer votre mandat de vente, je vous invite à compléter votre fiche vendeur à l'aide du lien ci-dessous. Elle réunit en une seule fois les informations nécessaires au mandat et les vérifications que la réglementation impose aux agences immobilières."
      : `Afin de rédiger votre offre d'achat pour le bien « ${contexte.titre} »${contexte.ville ? ` à ${contexte.ville}` : ""}, je vous invite à compléter votre fiche acquéreur à l'aide du lien ci-dessous.`;
  return [
    salutation(d),
    "",
    pour,
    ...(dejaRempli ? ["J'y ai déjà indiqué les informations dont je dispose : il vous suffira de les vérifier et de compléter le reste."] : []),
    "",
    url,
    "",
    "Vous pouvez la remplir sur votre téléphone ou sur votre ordinateur ; comptez une dizaine de minutes. Ce lien vous est personnel, merci de ne pas le transférer.",
    "",
    "Je reste à votre disposition pour toute question.",
    "",
    "Bien cordialement,",
    [nomConseiller(), "PATRIM"].join(" – "),
    ...(c?.tel ? [c.tel] : []),
  ].join("\n");
}

/* ---------- Ce que le Hub sait déjà ---------- */

const NATURE_DE: Partial<Record<Bien["type"], Reponses["bienNature"]>> = { appartement: "Appartement", maison: "Maison", local: "Local", immeuble: "Immeuble", parking: "Garage", terrain: "Terrain" };

/** Identité et coordonnées d'un contact du Hub, pour la fiche. */
function personneDe(c?: ContactEtatCivil, d?: Destinataire & { tel?: string; email?: string }): Personne {
  return {
    civilite: d?.civilite || c?.civilite || undefined,
    prenom: d?.prenom || c?.prenom,
    nom: (d?.nom || (c?.nom && !c.nom.includes("[À compléter]") ? c.nom : undefined))?.toUpperCase(),
    dateNaissance: c?.dateNaissance,
    lieuNaissance: c?.lieuNaissance,
    profession: c?.profession,
    tel: d?.tel || c?.tel,
    email: d?.email || c?.email,
    ...decouperAdresse(c?.adresse),
  };
}

/** La fiche pré-remplie avec ce que le Hub sait déjà (le client vérifie et complète). */
export function reponsesInitiales(b: Bien, kind: KindFiche, d: Destinataire & { tel?: string; email?: string }, contactId?: string): Reponses {
  const contacts = getAll("contacts") as ContactEtatCivil[];
  const c = contactId ? contacts.find((x) => x.id === contactId) : undefined;
  const r: Reponses = personneDe(c, d);
  if (kind === "acquereur") {
    if (c?.financement?.apport != null) r.apport = c.financement.apport;
    if (c?.financement?.courtier) r.banque = c.financement.courtier;
    return r;
  }
  const dossier = dossierDe(b) ?? {};
  // Les autres propriétaires déjà connus (couple, indivision)
  const autres = (b.vendeurIds ?? []).filter((id) => id !== contactId).map((id) => contacts.find((x) => x.id === id)).filter(Boolean) as ContactEtatCivil[];
  if (autres.length) {
    r.parties = "plusieurs";
    r.autres = autres.slice(0, 5).map((x) => personneDe(x));
  }
  return {
    ...r,
    bienRue: b.adresse || undefined,
    bienCp: b.codePostal || undefined,
    bienVille: b.ville || undefined,
    bienNature: NATURE_DE[b.type],
    lots: dossier.lots,
    carrez: b.type === "appartement" && b.surface ? `${String(b.surface).replace(".", ",")} m²` : undefined,
    syndic: dossier.syndic,
    chargesAnnuelles: b.chargesAnnuelles,
    taxeFonciere: b.taxeFonciere,
    anneeConstruction: b.anneeConstruction,
    notaireVente: dossier.notaire,
    occupation: dossier.occupation ? (/lou/i.test(dossier.occupation) ? "loue" : /libre|vide/i.test(dossier.occupation) ? "libre" : undefined) : undefined,
    diagnostics: diagnosticsConnus(b),
  };
}

/** Diagnostics dont le rapport est déjà daté dans le Hub (carte « Diagnostics » du bien). */
const DIAG_FICHE: Partial<Record<CleDiag, (typeof DIAGNOSTICS)[number]>> = {
  dpe: "Diagnostic de performance énergétique",
  amiante: "État amiante",
  plomb: "Constat de risque d'exposition au plomb",
  termites: "État parasitaire",
  electricite: "État de l'installation intérieure d'électricité",
  gaz: "État de l'installation intérieure de gaz",
  erp: "État des risques",
  assainissement: "Contrôle assainissement (collectif ou individuel)",
};
function diagnosticsConnus(b: Bien): string[] | undefined {
  const d = diagnosticsDe(b);
  const out = (Object.keys(DIAG_FICHE) as CleDiag[]).filter((k) => d[k]?.date).map((k) => DIAG_FICHE[k]!);
  return out.length ? out : undefined;
}

/* ---------- Des réponses vers le Hub ---------- */

const memeTel = (a?: string, b?: string) => !!a && !!b && a.replace(/\D/g, "").slice(-9) === b.replace(/\D/g, "").slice(-9);
const nomSans = (p: Personne) => [p.prenom, p.nom?.toUpperCase()].filter(Boolean).join(" ");

/** Toutes les personnes de la fiche : le signataire, puis conjoint, coindivisaires ou co-acquéreurs. */
export const personnesFiche = (r: Reponses): Personne[] => [r, ...(avecAutres(r) ? (r.autres ?? []).filter((p) => p.nom?.trim()) : [])];

/** Crée ou complète la fiche contact d'une personne (sans effacer ce qui existe). */
function contactDe(p: Personne, role: ContactRole, bienId: string, extra: Partial<Contact> = {}): ContactEtatCivil {
  const contacts = getAll("contacts") as ContactEtatCivil[];
  const existant = contacts.find((c) => (p.email && c.email?.toLowerCase() === p.email.toLowerCase()) || memeTel(c.tel, p.tel));
  const champs: Partial<ContactEtatCivil> = {
    civilite: p.civilite,
    prenom: p.prenom,
    nom: p.nom?.toUpperCase(),
    tel: p.tel,
    email: p.email,
    adresse: p.adresse,
    dateNaissance: p.dateNaissance,
    lieuNaissance: p.lieuNaissance,
    profession: p.profession,
  };
  if (existant) {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries({ ...champs, ...extra })) if (v != null && v !== "" && (existant as unknown as Record<string, unknown>)[k] == null) patch[k] = v;
    if (!existant.roles.includes(role)) patch.roles = [...existant.roles, role];
    if (Object.keys(patch).length) update("contacts", existant.id, patch as Partial<Contact>);
    return { ...existant, ...patch } as ContactEtatCivil;
  }
  const note = role === "vendeur" ? "Vendeur (fiche vendeur en ligne)." : "Acquéreur (fiche acquéreur en ligne).";
  return create("contacts", { ...champs, ...extra, nom: champs.nom || "[À compléter]", roles: [role], bienOrigineId: bienId, notes: note } as Omit<Contact, "id" | "createdAt" | "updatedAt">) as ContactEtatCivil;
}

/** Fiches contact de toutes les personnes de la fiche. */
export function contactsDepuisFiche(b: Bien, f: Fiche): ContactEtatCivil[] {
  const r = f.reponses ?? {};
  const role: ContactRole = f.kind === "vendeur" ? "vendeur" : "acquereur";
  const extra: Partial<Contact> =
    f.kind === "acquereur" ? { etape: "offre", financement: { apport: r.apport, accordBanque: r.accordPrincipe, courtier: r.banque, aVendre: r.venteBien } } : {};
  return personnesFiche(r).map((p) => contactDe(p, role, b.id, extra));
}

const partie = (p: Personne, c: ContactEtatCivil): Partie => ({
  ...partieDepuisContact(c),
  civilite: p.civilite ?? c.civilite,
  prenom: p.prenom || c.prenom,
  nom: p.nom?.toUpperCase() || c.nom,
  dateNaissance: p.dateNaissance || c.dateNaissance,
  lieuNaissance: p.lieuNaissance || c.lieuNaissance,
  adresse: p.adresse || c.adresse,
  email: p.email || c.email,
  tel: p.tel || c.tel,
  profession: p.profession || c.profession,
});

const societeTexte = (r: Reponses) => {
  const s = r.societe ?? {};
  return [
    `la société ${[s.forme, s.denomination].filter(Boolean).join(" ") || "[À compléter]"}`,
    s.siren && `immatriculée sous le numéro SIREN ${s.siren}`,
    s.siege && `dont le siège est ${s.siege}`,
  ]
    .filter(Boolean)
    .join(", ");
};

/** Qualité des mandants, d'après la fiche. */
export function qualiteMandants(r: Reponses) {
  if (r.parties === "societe") return `Agissant en qualité de ${r.societe?.qualite || "gérant"} de ${societeTexte(r)}, seule propriétaire du bien`;
  if (avecAutres(r) && (r.autres ?? []).some((p) => p.nom?.trim()))
    return r.origine === "succession" ? "Agissant conjointement et solidairement en qualité de seuls propriétaires indivis" : "Agissant conjointement et solidairement en qualité de seuls propriétaires";
  return "Agissant en qualité de seul propriétaire";
}

/** Le conjoint doit consentir à la vente du logement de la famille (art. 215 du code civil), même s'il n'est pas propriétaire. */
export const conjointAConsentir = (r: Reponses) => !!r.residenceFamille && (r.situation === "marie" || r.situation === "pacse") && r.parties !== "couple";

const vide = (s?: string) => !s?.trim() || s.includes("[À compléter]");

/** Complète le bien et son dossier confidentiel avec la fiche vendeur, sans rien effacer. */
function completerBien(b: Bien, r: Reponses, vendeurs: ContactEtatCivil[]) {
  const d = dossierDe(b) ?? {};
  const patch: Partial<BienDossier> = {};
  const ids = [...new Set([...(b.vendeurIds ?? []), ...vendeurs.map((v) => v.id)])];
  if (ids.length !== (b.vendeurIds ?? []).length) patch.vendeurIds = ids;
  if (b.chargesAnnuelles == null && r.chargesAnnuelles != null) patch.chargesAnnuelles = r.chargesAnnuelles;
  if (b.taxeFonciere == null && r.taxeFonciere != null) patch.taxeFonciere = r.taxeFonciere;
  if (b.anneeConstruction == null && r.anneeConstruction) patch.anneeConstruction = r.anneeConstruction;
  const dossier = { ...d };
  if (!d.syndic && r.syndic) dossier.syndic = r.syndic;
  if (!d.lots && r.lots) dossier.lots = r.lots;
  if (!d.notaire && r.notaireVente) dossier.notaire = r.notaireVente;
  if (!d.occupation && r.occupation) dossier.occupation = [libelle(OCCUPATIONS, r.occupation), r.occupation === "loue" && r.loyer != null && `loyer ${r.loyer} € CC`, r.occupation === "loue" && r.finBail && `bail jusqu'au ${r.finBail}`].filter(Boolean).join(", ");
  if (JSON.stringify(dossier) !== JSON.stringify(d)) patch.dossier = dossier;
  if (Object.keys(patch).length) update("biens", b.id, patch as Partial<Bien>);
}

/** Met la fiche vendeur dans le brouillon de mandat du bien (créé s'il n'existe pas), et complète le bien. */
export function preparerMandat(b: Bien, f: Fiche): Mandat {
  const r = f.reponses ?? {};
  const contacts = contactsDepuisFiche(b, f);
  completerBien(b, r, contacts);
  const mandants = personnesFiche(r).map((p, i) => partie(p, contacts[i]));
  const base = lireMandat(b.id) ?? mandatInitial(b, contacts);
  const diagnostics = [...new Set([...base.diagnostics, ...(r.diagnostics ?? [])])];
  const m: Mandat = {
    ...base,
    mandants,
    qualite: qualiteMandants(r),
    nature: r.bienNature ?? base.nature,
    lots: r.lots || base.lots,
    carrez: r.carrez || base.carrez,
    adresseBien: r.bienAdresse || base.adresseBien,
    occupation: r.occupation === "loue" ? "loue" : r.occupation ? "libre" : base.occupation,
    netVendeur: base.netVendeur ?? r.prixSouhaite,
    diagnostics,
    conditionsParticulieres:
      conjointAConsentir(r) && !base.conditionsParticulieres?.includes("215")
        ? [base.conditionsParticulieres, "Le bien constituant le logement de la famille, le conjoint du mandant intervient au présent mandat pour y consentir (article 215 du code civil)."].filter(Boolean).join("\n")
        : base.conditionsParticulieres,
  };
  ecrireMandat(m);
  return m;
}

/** Acquéreurs déjà dans le brouillon d'offre du bien, s'ils sont différents de ceux de la fiche. */
export function autreOffreEnCours(b: Bien, f: Fiche): string | null {
  const o = lireOffre(b.id);
  if (!o?.acquereurs.length) return null;
  const noms = personnesFiche(f.reponses ?? {}).map((p) => p.nom?.toUpperCase());
  return o.acquereurs.some((a) => !noms.includes(a.nom?.toUpperCase())) ? o.acquereurs.map((a) => [a.prenom, a.nom?.toUpperCase()].filter(Boolean).join(" ")).join(", ") : null;
}

/** Met la fiche acquéreur dans le brouillon d'offre du bien (créé s'il n'existe pas). */
export function preparerOffre(b: Bien, f: Fiche): Offre {
  const r = f.reponses ?? {};
  const contacts = contactsDepuisFiche(b, f);
  const acquereurs = personnesFiche(r).map((p, i) => partie(p, contacts[i]));
  const existant = lireOffre(b.id);
  const vendeurs = (b.vendeurIds ?? []).map((v) => (getAll("contacts") as ContactEtatCivil[]).find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];
  // Une offre en cours pour d'autres acquéreurs est remplacée (le conseiller a confirmé)
  const base = existant && !autreOffreEnCours(b, f) ? existant : offreInitiale(b, existant?.vendeurs.length ? existant.vendeurs : vendeurs.map(partieDepuisContact));
  const pret = r.financement === "pret";
  const conditions = [
    base.conditionsParticulieres,
    r.parties === "societe" && `L'acquisition est faite par ${societeTexte(r)}, représentée par ${nomSans(r)} en qualité de ${r.societe?.qualite || "gérant"}.`,
    pret && r.venteBien && `Sous réserve de la vente par l'acquéreur de son bien${r.venteBienDetail ? ` (${r.venteBienDetail})` : ""}.`,
    r.conditions,
  ]
    .filter(Boolean)
    .filter((x, i, a) => a.indexOf(x) === i)
    .join("\n");
  const o: Offre = {
    ...base,
    acquereurs,
    prix: r.prixPropose ?? base.prix,
    financement: r.financement ?? base.financement,
    detailFinancement: r.apport != null || r.montantPret != null ? true : base.detailFinancement,
    apport: r.apport ?? base.apport,
    montantPret: pret ? r.montantPret ?? base.montantPret : undefined,
    dureePret: pret ? r.dureePret ?? base.dureePret : undefined,
    tauxMax: pret ? r.tauxMax ?? base.tauxMax : undefined,
    conditionSuspensive: pret || !!r.venteBien,
    motif: pret ? "pret" : r.venteBien ? "vente" : base.motif,
    motifTexte: !pret && r.venteBien ? r.venteBienDetail : base.motifTexte,
    conditionsParticulieres: conditions || undefined,
  };
  ecrireOffre(o);
  return o;
}

/* ---------- Pour aller plus vite à la création du lien ---------- */

/** Documents à cocher d'office : rien d'inutile pour ce bien, rien de déjà reçu sur une autre fiche du bien. */
export function piecesProposees(b: Bien, kind: KindFiche, fiches: Fiche[] = []): string[] {
  const dejaRecues = new Set(fiches.filter((f) => f.kind === kind).flatMap((f) => f.contexte.recues ?? []));
  const occupation = dossierDe(b)?.occupation;
  return PIECES[kind].filter((x) => {
    if (x.startsWith("Pièce d'identité")) return true; // une pièce par personne : toujours demandée
    if (dejaRecues.has(x)) return false;
    if (kind === "vendeur" && x.startsWith("Copropriété") && (b.type === "maison" || b.type === "terrain")) return false;
    if (kind === "vendeur" && x.startsWith("Bien loué") && occupation && !/lou/i.test(occupation)) return false;
    return true;
  });
}

/** Acquéreurs probables pour ce bien : offre en cours, visite faite ou prévue, bien proposé ou lead entrant. */
export function acquereursProbables(b: Bien): { id: string; nom: string; raison: string }[] {
  const contacts = (getAll("contacts") as Contact[]).filter((c) => c.roles?.includes("acquereur") && c.etape !== "perdu" && c.etape !== "gagne");
  const visites = new Set((getAll("rdvs") as Rdv[]).filter((r) => r.bienId === b.id && r.type === "visite" && r.statut !== "annule").flatMap((r) => r.contactIds ?? []));
  const rang = (c: Contact) => (c.etape === "offre" ? 0 : visites.has(c.id) ? 1 : 2);
  return contacts
    .filter((c) => visites.has(c.id) || c.biensProposes?.includes(b.id) || c.bienOrigineId === b.id)
    .sort((x, y) => rang(x) - rang(y) || (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""))
    .slice(0, 6)
    .map((c) => ({
      id: c.id,
      nom: [c.prenom, c.nom && !c.nom.includes("[À compléter]") ? c.nom.toUpperCase() : ""].filter(Boolean).join(" ") || "Sans nom",
      raison: c.etape === "offre" ? "veut faire une offre" : visites.has(c.id) ? "a visité" : c.bienOrigineId === b.id ? "a demandé ce bien" : "bien proposé",
    }));
}

/** Relance polie, sans nouveau lien : le client reprend celui qu'il a déjà reçu. */
export function messageRelance(kind: KindFiche, d: Destinataire, envoyeLe: string, commencee: boolean) {
  const le = new Date(envoyeLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  return [
    salutation(d),
    "",
    commencee
      ? `Je me permets de revenir vers vous au sujet de votre fiche ${kind === "vendeur" ? "vendeur" : "acquéreur"}, que vous avez commencé à remplir. Vos réponses sont gardées : il vous suffit de rouvrir le lien que je vous ai adressé le ${le} pour la terminer.`
      : `Je me permets de revenir vers vous au sujet de la fiche ${kind === "vendeur" ? "vendeur" : "acquéreur"} que je vous ai adressée le ${le}. Elle me permettra de ${kind === "vendeur" ? "préparer votre mandat de vente" : "rédiger votre offre d'achat"} sans vous redemander ces informations.`,
    "",
    "Si vous ne retrouvez plus le lien, dites-le-moi et je vous en envoie un nouveau.",
    "",
    "Bien cordialement,",
    [nomConseiller(), "PATRIM"].join(" – "),
  ].join("\n");
}
