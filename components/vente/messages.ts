"use client";

/* ============================================================
   Points d'étape entre l'avant-contrat et l'acte : SMS ou mail à
   l'acquéreur (prêt, date de l'acte), au vendeur (où en est la
   vente) et au notaire. Rien n'est envoyé d'ici : chaque message
   s'ouvre pour relecture. Changements de statut de la vente.
   ============================================================ */

import { getAll, update } from "@/lib/store";
import { eur } from "@/lib/format";
import { dossierDe } from "@/components/biens/dossier";
import { adresseComplete } from "@/components/biens/utils";
import { AGENCE, telActe } from "@/components/documents/charte";
import { emailsDe } from "@/components/notaire/transmission";
import type { Bien, Contact, EtapeAcquereur } from "@/lib/types";
import {
  acquereursDe,
  avecPret,
  avecRetractation,
  dateTexte,
  finPreemption,
  finRetractation,
  nomAvantContrat,
  venteDe,
  type BienVente,
} from "./vente";

const NATURE: Record<Bien["type"], { le: string; f: boolean }> = {
  appartement: { le: "l'appartement", f: false },
  maison: { le: "la maison", f: true },
  terrain: { le: "le terrain", f: false },
  local: { le: "le local", f: false },
  immeuble: { le: "l'immeuble", f: false },
  parking: { le: "la place de parking", f: true },
};

/** « l'appartement du 10 rue Exemple » (l'acquéreur et le vendeur connaissent l'adresse). */
export function nomVente(b: Bien) {
  const n = NATURE[b.type];
  const adresse = b.adresse?.trim();
  if (!adresse) return n.le;
  return /^\d/.test(adresse) ? `${n.le} du ${adresse}` : `${n.le} situé${n.f ? "e" : ""} ${adresse}`;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const bonjour = (c: Contact) => `Bonjour ${c.prenom || [c.civilite, c.nom].filter(Boolean).join(" ")},`;
const informe = (c: Contact) => (c.civilite === "Mme" ? "informée" : c.civilite === "M." ? "informé" : "informé(e)");
const heureActe = (b: Bien) => (venteDe(b).acteHeure ? ` à ${venteDe(b).acteHeure!.replace(":", "h")}` : "");
const SIGNATURE_SMS = "Quentin Delsol, PATRIM";
const SIGNATURE_MAIL = ["Bien à vous,", "Quentin Delsol", "PATRIM Immobilier", telActe(AGENCE.conseillerTel)].filter(Boolean).join("\n");

export interface Message {
  sms: string;
  sujet: string;
  mail: string;
}

const message = (c: Contact, sujet: string, lignes: string[]): Message => ({
  sms: [bonjour(c), ...lignes, SIGNATURE_SMS].join("\n"),
  sujet,
  mail: [bonjour(c), "", lignes.join("\n"), "", SIGNATURE_MAIL].join("\n"),
});

/** Point avec l'acquéreur : son prêt tant que l'accord n'est pas là, sinon la date de l'acte. */
export function messageAcquereur(b: Bien, c: Contact, auj: string): Message {
  const v = venteDe(b);
  const ac = nomAvantContrat(b);
  const le = (d: string) => dateTexte(d, auj);
  const pret = avecPret(b) && !v.accord;
  let lignes: string[];
  if (pret && v.depotAvant && !v.depotFait) {
    lignes =
      v.depotAvant < auj
        ? [`${majuscule(ac)} prévoyait le dépôt de vos demandes de prêt avant le ${le(v.depotAvant)}. Pouvez-vous m'envoyer rapidement le justificatif de dépôt ?`]
        : [`Pour rappel, ${ac} prévoit le dépôt de vos demandes de prêt avant le ${le(v.depotAvant)}. Pouvez-vous m'envoyer le justificatif dès qu'elles sont déposées ?`];
  } else if (pret) {
    lignes =
      v.obtentionAvant && v.obtentionAvant < auj
        ? [`La date prévue dans ${ac} pour l'obtention de votre prêt était le ${le(v.obtentionAvant)}. Où en êtes-vous avec la banque ? Appelez-moi dès que possible pour que nous voyions la suite avec le notaire.`]
        : [
            `Où en est votre demande de prêt pour ${nomVente(b)} ?${v.obtentionAvant ? ` ${majuscule(ac)} prévoit l'accord de la banque avant le ${le(v.obtentionAvant)}.` : ""}`,
            "Dès que vous l'avez, transmettez-le-moi : je fais le lien avec le notaire.",
          ];
  } else if (v.acte && !v.acteSigne && v.acte >= auj) {
    lignes = [`Petit point sur votre achat : la signature de l'acte est prévue le ${dateTexte(v.acte, auj, true)}${heureActe(b)}. Je vous confirme les derniers détails d'ici là.`];
  } else {
    lignes = ["Petit point sur votre achat : le notaire prépare l'acte de vente. Je reviens vers vous dès que la date de signature est fixée."];
  }
  return message(c, `Votre achat : ${nomVente(b)}`, lignes);
}

/** Point avec le vendeur : rétractation, prêt de l'acquéreur, date de l'acte. */
export function messageVendeur(b: Bien, c: Contact, auj: string): Message {
  const v = venteDe(b);
  const le = (d: string) => dateTexte(d, auj);
  const etapes: string[] = [];
  if (avecRetractation(b)) {
    if (!v.notification) etapes.push("délai de rétractation de l'acquéreur : 10 jours à partir de la notification");
    else {
      const fin = finRetractation(v.notification);
      etapes.push(fin < auj ? `délai de rétractation de l'acquéreur : terminé depuis le ${le(fin)}` : `délai de rétractation de l'acquéreur : jusqu'au ${dateTexte(fin, auj, true)} inclus`);
    }
  }
  const pret = avecPret(b);
  if (pret) etapes.push(v.accord ? `prêt de l'acquéreur : accord de la banque reçu le ${le(v.accord)}` : v.obtentionAvant ? `prêt de l'acquéreur : accord attendu avant le ${le(v.obtentionAvant)}` : "prêt de l'acquéreur : demande en cours");
  else if (pret === false) etapes.push("financement de l'acquéreur : sans prêt");
  if (v.dia || v.renonciation)
    etapes.push(v.renonciation || finPreemption(v.dia!) < auj ? "droit de préemption de la mairie : purgé" : `droit de préemption de la mairie : réponse au plus tard le ${le(finPreemption(v.dia!))}`);
  etapes.push(v.acte && v.acte >= auj ? `acte de vente : prévu le ${dateTexte(v.acte, auj, true)}${heureActe(b)}` : "acte de vente : date en cours de fixation avec le notaire");
  return message(c, `Vente de votre bien : point d'étape`, [`Un point sur la vente de votre ${nomVente(b).replace(/^(l'|la |le )/, "")} :`, ...etapes.map((x) => `• ${majuscule(x)}`), `Je vous tiens ${informe(c)} de la suite.`]);
}

/** Mail au notaire : ce qu'il reste à confirmer, le prêt, la facture d'honoraires. */
export function messageNotaire(b: Bien, auj: string): { to: string; sujet: string; mail: string } {
  const v = venteDe(b);
  const d = dossierDe(b);
  const le = (x: string) => dateTexte(x, auj);
  const questions = [
    avecRetractation(b) && !v.notification && "la date de notification du délai de rétractation à l'acquéreur",
    !v.renonciation && !(v.dia && finPreemption(v.dia) < auj) && "la purge du droit de préemption",
    !v.acte && "la date et l'heure de signature de l'acte authentique",
  ].filter((x): x is string => !!x);
  const pret = avecPret(b);
  const honoraires = b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined);
  const [rue, ville] = AGENCE.adresse.split(" – ");
  const avantContrat = v.signature && v.signature <= auj ? `, ${nomAvantContrat(b)} ayant été signé${v.avantContrat === "promesse" ? "e" : ""} le ${le(v.signature)}` : "";
  const lignes = [
    "Maître,",
    `Je me permets de faire le point avec vous sur la vente de ${nomVente(b)}${b.ville ? ` à ${b.ville}` : ""}${avantContrat}.`,
    questions.length === 1
      ? `Pourriez-vous me confirmer ${questions[0]} ?`
      : questions.length
        ? `Pourriez-vous me confirmer :\n${questions.map((q) => `- ${q} ;`).join("\n").replace(/ ;$/, " ?")}`
        : v.acte && !v.acteSigne
          ? `Pourriez-vous me confirmer que tout est prêt pour la signature de l'acte prévue le ${dateTexte(v.acte, auj, true)}${heureActe(b)} ?`
          : "",
    pret ? (v.accord ? `L'acquéreur a obtenu l'accord de sa banque le ${le(v.accord)}.` : v.obtentionAvant ? `Pour mémoire, l'acquéreur doit obtenir son prêt avant le ${le(v.obtentionAvant)}.` : "") : "",
    !v.faits?.facture && honoraires
      ? `Je vous adresserai notre facture d'honoraires (${eur(honoraires)}, à la charge ${b.honorairesCharge === "vendeur" ? "du vendeur" : "de l'acquéreur"}) avant la signature.`
      : "",
    "Je reste à votre disposition.",
    ["Bien cordialement,", "", AGENCE.conseiller.replace(/(\S+)$/, (n) => n.toUpperCase()), "Patrim", rue, ville, telActe(AGENCE.tel), telActe(AGENCE.conseillerTel)].filter(Boolean).join("\n"),
  ];
  // Même objet que la transmission du dossier : « VENTE VENDEUR / ACQUÉREUR – adresse – … ».
  const contacts = getAll("contacts");
  const noms = (ids: string[]) => [...new Set(ids.map((id) => contacts.find((c) => c.id === id)?.nom?.trim().toUpperCase()).filter(Boolean))].join(" - ");
  const parties = [noms(b.vendeurIds ?? []), noms(acquereursDe(b))].filter(Boolean).join(" / ");
  return {
    to: emailsDe(d?.notaire).join(", "),
    sujet: ["VENTE" + (parties ? ` ${parties}` : ""), adresseComplete(b) || nomVente(b), "Point sur le dossier"].join(" – "),
    mail: lignes.filter(Boolean).join("\n\n"),
  };
}

export type Canal = "sms" | "whatsapp" | "mail" | "appel";

/** Garde la date du point (sur le bien) et l'inscrit une fois par jour dans l'historique du contact. */
export function noterPoint(bienId: string, contactId: string, canal: Canal, texte: string) {
  const b = getAll("biens").find((x) => x.id === bienId) as BienVente | undefined;
  if (!b) return;
  const now = new Date().toISOString();
  const v = venteDe(b);
  update("biens", bienId, { vente: { ...v, points: { ...(v.points ?? {}), [contactId]: now } } } as Partial<Bien>);
  const c = getAll("contacts").find((x) => x.id === contactId);
  if (!c || c.historique?.some((h) => h.texte === texte && h.date.slice(0, 10) === now.slice(0, 10))) return;
  update("contacts", contactId, {
    historique: [{ date: now, type: canal === "mail" ? "mail" : canal === "appel" ? "appel" : "sms", texte }, ...(c.historique ?? [])],
    dernierContact: now,
  });
}

const RANG: Record<EtapeAcquereur, number> = { nouveau: 0, qualifie: 1, visite: 2, offre: 3, compromis: 4, gagne: 5, perdu: -1 };

/** Fait avancer les acquéreurs dans le pipeline (jamais en arrière, jamais un acquéreur perdu). */
function avancerAcquereurs(ids: string[], etape: "compromis" | "gagne") {
  for (const id of ids) {
    const c = getAll("contacts").find((x) => x.id === id);
    if (c && (c.etape == null || (RANG[c.etape] >= 0 && RANG[c.etape] < RANG[etape]))) update("contacts", id, { etape });
  }
}

/** Avant-contrat signé : le bien passe en « Compromis », ses acquéreurs aussi. */
export function passerEnCompromis(b: Bien) {
  update("biens", b.id, { statut: "compromis" });
  avancerAcquereurs(acquereursDe(b), "compromis");
}

/** Acte signé : le bien passe en « Vendu », ses acquéreurs en « Acté ». */
export function marquerVendu(b: Bien) {
  update("biens", b.id, { statut: "vendu" });
  avancerAcquereurs(acquereursDe(b), "gagne");
}
