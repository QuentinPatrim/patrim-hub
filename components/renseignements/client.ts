"use client";

/* Côté conseiller : appels au serveur, liens à envoyer, et passage des
   réponses vers les fiches contact, le bail et l'acte de cautionnement. */

import { authHeaders } from "@/lib/ai";
import { create, getAll, update } from "@/lib/store";
import { conseiller, nomConseiller } from "@/lib/equipe";
import { titrePublic } from "@/lib/titrePublic";
import { ficheInitiale, lireFiche } from "@/components/candidat/candidat";
import { bailInitial, ecrireBail, lireBail, type Bail } from "@/components/bail/bail";
import { cautionInitiale, ecrireCaution, nomCaution, type Caution, type Situation } from "@/components/caution/caution";
import { partieDepuisContact, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import type { Acte, BienActes } from "@/components/documents/archive";
import type { Bien, Contact } from "@/lib/types";
import type { Dossier, LogementPublic, PersonneDossier, Reponses, RoleDossier } from "./dossier";

async function appeler<T>(init: { method: "GET" | "POST"; query?: string; corps?: unknown }): Promise<T> {
  const r = await fetch(`/api/renseignements${init.query ?? ""}`, {
    method: init.method,
    headers: { ...(await authHeaders()), ...(init.corps ? { "content-type": "application/json" } : {}) },
    body: init.corps ? JSON.stringify(init.corps) : undefined,
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok || j.error) throw new Error(j.error || "Le serveur ne répond pas pour l'instant.");
  return j;
}

export const listerDossiers = (bienId: string) => appeler<{ dossiers: Dossier[] }>({ method: "GET", query: `?bien=${encodeURIComponent(bienId)}` }).then((r) => r.dossiers);
export const creerDossier = (bienId: string, logement: LogementPublic, prenom: string) =>
  appeler<{ id: string; personneId: string; jeton: string }>({ method: "POST", corps: { action: "creer", bienId, logement, prenom } });
export const nouveauLien = (personneId: string) => appeler<{ id: string; jeton: string }>({ method: "POST", corps: { action: "lien", personneId } });
export const ajouterPersonne = (dossierId: string, role: Exclude<RoleDossier, "locataire">, prenom: string, garantDe?: string) =>
  appeler<{ id: string; jeton: string }>({ method: "POST", corps: { action: "ajouter", dossierId, role, prenom, garantDe } });
export const retirerPersonne = (personneId: string) => appeler<{ ok: true }>({ method: "POST", corps: { action: "retirer", personneId } });
export const fermerDossier = (dossierId: string, ferme: boolean) => appeler<{ ok: true }>({ method: "POST", corps: { action: "fermer", dossierId, ferme } });
export const supprimerDossier = (dossierId: string) => appeler<{ ok: true }>({ method: "POST", corps: { action: "supprimer", dossierId } });

export const lienPublic = (jeton: string) => `${window.location.origin}/renseignements/${jeton}`;

/** Le logement tel que le candidat le voit : rien sur le propriétaire ni sur l'adresse exacte. */
export function logementPublic(b: Bien): LogementPublic {
  const f = lireFiche(b.id) ?? ficheInitiale(b);
  const c = conseiller();
  return {
    titre: titrePublic(b),
    ville: b.ville || undefined,
    meuble: f.meuble,
    loyer: f.loyer,
    charges: f.charges,
    depot: f.depot,
    honoraires: f.honoraires,
    entree: f.entree,
    photo: b.photos?.find((p) => p.startsWith("https://")),
    conseiller: { nom: nomConseiller(), tel: c.tel || undefined, mail: c.mail || undefined },
  };
}

/** Texte prêt à envoyer avec le lien (SMS, WhatsApp, mail). */
export function messageLien(prenom: string, role: PersonneDossier["role"], logement: LogementPublic, url: string, deQui?: string) {
  const pour = role === "garant" ? `en tant que garant${deQui ? ` de ${deQui}` : ""} pour` : "pour votre candidature sur";
  return [
    `Bonjour${prenom ? ` ${prenom}` : ""},`,
    `Voici le lien pour remplir votre fiche de renseignements ${pour} le logement « ${logement.titre} »${logement.ville ? ` à ${logement.ville}` : ""} :`,
    url,
    "Cela prend quelques minutes depuis votre téléphone. Ce lien est personnel : merci de ne pas le transférer.",
    `${nomConseiller()} – PATRIM`,
  ].join("\n");
}

/* ---------- Des réponses vers le Hub ---------- */

const memeTel = (a?: string, b?: string) => !!a && !!b && a.replace(/\D/g, "").slice(-9) === b.replace(/\D/g, "").slice(-9);

/** Crée ou complète la fiche contact de la personne (sans effacer ce qui existe). */
export function contactDepuisReponses(r: Reponses, role: RoleDossier, bienId: string): ContactEtatCivil {
  const contacts = getAll("contacts") as ContactEtatCivil[];
  const existant = contacts.find((c) => (r.email && c.email?.toLowerCase() === r.email.toLowerCase()) || memeTel(c.tel, r.tel));
  const champs: Partial<ContactEtatCivil> = {
    civilite: r.civilite,
    prenom: r.prenom,
    nom: r.nom?.toUpperCase(),
    tel: r.tel,
    email: r.email,
    adresse: r.adresse,
    dateNaissance: r.dateNaissance,
    lieuNaissance: r.lieuNaissance,
    profession: r.profession,
  };
  const note = role === "garant" ? "Garant d'un candidat locataire (fiche de renseignements en ligne)." : "Candidat locataire (fiche de renseignements en ligne).";
  if (existant) {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(champs)) if (v && !(existant as unknown as Record<string, unknown>)[k]) patch[k] = v;
    if (!existant.roles.includes("locataire")) patch.roles = [...existant.roles, "locataire"];
    if (Object.keys(patch).length) update("contacts", existant.id, patch as Partial<Contact>);
    return { ...existant, ...patch } as ContactEtatCivil;
  }
  return create("contacts", { ...champs, nom: champs.nom || "[À compléter]", roles: ["locataire"], bienOrigineId: bienId, notes: note } as Omit<Contact, "id" | "createdAt" | "updatedAt">) as ContactEtatCivil;
}

const proprietaires = (b: Bien) => (b.vendeurIds ?? []).map((v) => (getAll("contacts") as ContactEtatCivil[]).find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];

/** Locataires du dossier (principal, puis conjoint ou colocataires), avec une fiche contact chacun. */
function partiesLocataires(b: Bien, d: Dossier) {
  const parId = new Map<string, Partie>();
  for (const p of d.personnes.filter((x) => x.role !== "garant" && x.reponses?.nom)) parId.set(p.id, partieDepuisContact(contactDepuisReponses(p.reponses!, p.role, b.id)));
  return parId;
}

/** Met les locataires du dossier dans le brouillon de bail du bien (créé s'il n'existe pas). */
export function preparerBail(b: Bien, d: Dossier): Bail {
  const locataires = [...partiesLocataires(b, d).values()];
  const bail = lireBail(b.id) ?? bailInitial(b, proprietaires(b));
  const x = { ...bail, locataires };
  ecrireBail(x);
  return x;
}

const SITUATION_CAUTION: Record<NonNullable<Reponses["situation"]>, Situation> = {
  celibataire: "celibataire",
  concubinage: "celibataire",
  pacse: "pacse",
  marie: "marie",
  divorce: "divorce",
  veuf: "veuf",
};

/** Prépare le brouillon d'acte de cautionnement pour un garant, sur le dernier bail du bien (ou le brouillon). */
export function preparerCaution(b: Bien, d: Dossier, garant: PersonneDossier): Caution {
  const actes = ((b as BienActes).actes ?? []).filter((a): a is Extract<Acte, { kind: "bail" }> => a.kind === "bail" && a.statut !== "refuse");
  const dernier = actes[actes.length - 1];
  const bail = dernier?.data ?? lireBail(b.id) ?? preparerBail(b, d);
  const r = garant.reponses ?? {};
  const partie = partieDepuisContact(contactDepuisReponses(r, "garant", b.id));
  const garanti = d.personnes.find((p) => p.id === garant.garantDe);
  const base = cautionInitiale(bail, dernier?.id);
  const lie = garanti?.reponses?.nom ? nomCaution({ civilite: garanti.reponses.civilite, prenom: garanti.reponses.prenom, nom: garanti.reponses.nom }) : undefined;
  const c: Caution = {
    ...base,
    personnes: [partie],
    situation: r.situation ? SITUATION_CAUTION[r.situation] : base.situation,
    profession: r.profession,
    contrat: r.pro === "cdi" || r.pro === "fonctionnaire" ? "cdi" : r.pro === "cdd" ? "cdd" : r.pro ? "autre" : base.contrat,
    finCdd: r.finCdd,
    remuneration: r.salaire,
    autresRevenus: r.autresRevenus,
    colocataireLie: bail.locataires.length > 1 ? lie ?? base.colocataireLie : undefined,
    etudiantApprenti: garanti?.reponses?.pro === "etudiant" || garanti?.reponses?.pro === "apprenti" || undefined,
  };
  ecrireCaution(c);
  return c;
}
