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
import type { Bien, Contact, ContactRole } from "@/lib/types";
import { avecAutres, libelle, OCCUPATIONS, type ContextePublic, type Fiche, type KindFiche, type Personne, type Reponses } from "./fiche";

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
export const creerFiche = (kind: KindFiche, bienId: string, contexte: ContextePublic, prenom: string) =>
  appeler<{ id: string; jeton: string }>({ method: "POST", corps: { action: "creer", kind, bienId, contexte, prenom } });
export const nouveauLienFiche = (id: string) => appeler<{ id: string; jeton: string }>({ method: "POST", corps: { action: "lien", id } });
export const fermerFiche = (id: string, ferme: boolean) => appeler<{ ok: true }>({ method: "POST", corps: { action: "fermer", id, ferme } });
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

/** Texte prêt à envoyer avec le lien (SMS, WhatsApp, mail). */
export function messageFiche(kind: KindFiche, prenom: string, contexte: ContextePublic, url: string) {
  const pour =
    kind === "vendeur"
      ? "Pour préparer votre mandat de vente, voici le lien de votre fiche vendeur. Elle réunit en une fois les informations du mandat et les vérifications que la loi impose aux agences :"
      : `Pour rédiger votre offre d'achat sur le bien « ${contexte.titre} »${contexte.ville ? ` à ${contexte.ville}` : ""}, voici le lien de votre fiche acquéreur :`;
  return [
    `Bonjour${prenom ? ` ${prenom}` : ""},`,
    pour,
    url,
    "Comptez une dizaine de minutes, depuis votre téléphone. Ce lien est personnel : merci de ne pas le transférer.",
    `${nomConseiller()} – PATRIM`,
  ].join("\n");
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
