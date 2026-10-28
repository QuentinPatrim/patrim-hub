"use client";

/* ============================================================
   « À envoyer » : tous les messages prêts du jour, réunis depuis
   les modules qui les préparent déjà (baisse de prix, suivi de la
   vente, après-vente, rapprochements, rapport vendeur) plus les
   relances prévues et les réponses aux leads arrivés de Gmail.
   Rien n'est envoyé d'ici : chaque message s'ouvre pour relecture,
   puis « C'est envoyé » le note là où le module l'attend.
   ============================================================ */

import { addDays, eur, nomComplet, today } from "@/lib/format";
import { ACQUEREUR_ACTIF, BIEN_DISPONIBLE, matchScore } from "@/lib/matching";
import { getAll, update } from "@/lib/store";
import { titrePublic } from "@/lib/titrePublic";
import { nomConseiller } from "@/lib/equipe";
import type { Bien, Contact, Rdv } from "@/lib/types";
import { texteProposition } from "@/components/biens/utils";
import { marquerPropose } from "@/components/biens/AcquereursCompatibles";
import { rapportHebdo } from "@/components/biens/rapportHebdo";
import { aPrevenir, baisseEnCours, type BienBaisse } from "@/components/baisse/baisse";
import { marquerPrevenu, messageBaisse } from "@/components/baisse/messages";
import { acquereursDe, venteDe } from "@/components/vente/vente";
import { apresAFaire, type RoleClient } from "@/components/vente/apres";
import { messageAcquereur, messageMerci, messageNouvelles, messageVendeur, noterApres, noterPoint, type Canal } from "@/components/vente/messages";
import { noterBoite, type EtatBoite } from "./etat";
import { bailSuivi, periodeBail } from "@/components/gestion/echeancier";
import { locationDe } from "@/components/location/bienLocation";
import { loyerGele } from "@/components/location/loi";
import { lienRetour, visitesARetour, type RdvRetour } from "@/components/retour/retour";

export type CategorieEnvoi = "lead" | "relance" | "baisse" | "proposition" | "vente" | "vendeur" | "retour" | "pont" | "apres";

export const CATEGORIE: Record<CategorieEnvoi, { label: string; tone: "danger" | "warn" | "ok" | "brand" | "info" | "neutral" }> = {
  lead: { label: "Nouveau lead", tone: "danger" },
  relance: { label: "Relance", tone: "warn" },
  baisse: { label: "Baisse de prix", tone: "ok" },
  proposition: { label: "Bien à proposer", tone: "ok" },
  vente: { label: "Point de vente", tone: "brand" },
  vendeur: { label: "Compte rendu vendeur", tone: "info" },
  retour: { label: "Retour de visite", tone: "info" },
  pont: { label: "Gestion ↔ vente", tone: "brand" },
  apres: { label: "Après-vente", tone: "neutral" },
};
const ORDRE: CategorieEnvoi[] = ["lead", "vente", "baisse", "relance", "retour", "vendeur", "proposition", "pont", "apres"];

export interface Envoi {
  /** Identifie ce message précis : un nouvel évènement donne une nouvelle clé. */
  cle: string;
  cat: CategorieEnvoi;
  contact: Contact;
  bien?: Bien;
  /** Pourquoi ce message aujourd'hui. */
  raison: string;
  sujet: string;
  mail: string;
  sms?: string;
  /** Le brouillon est déjà dans Gmail (réponse aux leads préparée par le script). */
  dansGmail?: boolean;
  /** Relance : le texte peut être réécrit par l'IA d'après la fiche. */
  reecrire?: boolean;
  score?: number;
  /** Note le message comme envoyé, là où le module d'origine le garde. */
  fait: (canal: Canal, texte: string) => void;
}

export interface Donnees {
  biens: Bien[];
  contacts: Contact[];
  rdvs: Rdv[];
}

const jours = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso.length === 10 ? iso + "T12:00:00" : iso).getTime()) / 86400000) : Infinity);
const bonjour = (c: Contact) => `Bonjour ${c.prenom || [c.civilite, c.nom].filter(Boolean).join(" ")},`;
const signatureMail = () => ["Bien à vous,", nomConseiller(), "PATRIM Immobilier"].join("\n");
const typeHisto = (canal: Canal) => (canal === "mail" ? "mail" : canal === "appel" ? "appel" : "sms") as "mail" | "appel" | "sms";

/** Ajoute une ligne à l'historique du contact (une seule fois par jour pour un même texte). */
function historique(contactId: string, canal: Canal, texte: string, patch: Partial<Contact> = {}) {
  const c = getAll("contacts").find((x) => x.id === contactId);
  if (!c) return;
  const now = new Date().toISOString();
  const deja = c.historique?.some((h) => h.texte === texte && h.date.slice(0, 10) === now.slice(0, 10));
  update("contacts", contactId, { ...(deja ? {} : { historique: [{ date: now, type: typeHisto(canal), texte }, ...(c.historique ?? [])] }), dernierContact: now, ...patch });
}

/** Résumé court de la recherche d'un acquéreur : « un T3 à Saint-Cyprien, jusqu'à 300 000 € ». */
function recherche(c: Contact) {
  const k = c.criteres;
  if (!k) return "";
  const type = k.types?.length === 1 ? { appartement: "un appartement", maison: "une maison", terrain: "un terrain", local: "un local", immeuble: "un immeuble", parking: "un parking" }[k.types[0]] : "un bien";
  const pieces = k.piecesMin && k.types?.[0] === "appartement" ? `un T${k.piecesMin}` : type;
  const lieu = k.quartiers?.length ? ` à ${k.quartiers.slice(0, 2).join(" ou ")}` : "";
  const budget = k.budgetMax ? `, jusqu'à ${eur(k.budgetMax)}` : "";
  return ` (${pieces}${lieu}${budget})`;
}

function messageRelance(c: Contact): { sujet: string; mail: string; sms: string } {
  const acquereur = c.roles?.includes("acquereur");
  const corps = acquereur
    ? [
        `Je reviens vers vous au sujet de votre recherche${recherche(c)}. Où en est votre projet ?`,
        "De nouveaux biens arrivent régulièrement chez PATRIM : si vos critères ont évolué, dites-le-moi, je vous préviendrai en priorité.",
      ]
    : [
        "Je me permets de revenir vers vous au sujet de votre projet immobilier. Avez-vous avancé dans votre réflexion ?",
        "Je reste à votre disposition pour en parler, ou pour faire le point sur la valeur de votre bien.",
      ];
  return {
    sujet: acquereur ? "Votre recherche immobilière" : "Votre projet immobilier",
    mail: [bonjour(c), "", corps.join("\n\n"), "", signatureMail()].join("\n"),
    sms: [bonjour(c), acquereur ? "Je reviens vers vous pour votre recherche : où en est votre projet ? De nouveaux biens arrivent, je peux vous les proposer." : "Je reviens vers vous au sujet de votre projet immobilier : avez-vous avancé ? Je reste disponible pour en parler.", `${nomConseiller()}, PATRIM`].join("\n"),
  };
}

function smsProposition(b: Bien, c: Contact) {
  return [bonjour(c), `Je pense à vous pour ${titrePublic(b)}${b.prix ? ` à ${eur(b.prix)} honoraires inclus` : ""}, qui correspond à votre recherche.`, b.annonceUrl ? `L'annonce : ${b.annonceUrl}` : "", "Souhaitez-vous le visiter ?", `${nomConseiller()}, PATRIM`].filter(Boolean).join("\n");
}

/** Vendredi de la semaine du compte rendu : du vendredi au lundi suivant, sinon aucun. */
function vendrediDuRapport(auj: string) {
  const j = new Date(auj + "T12:00:00Z").getUTCDay(); // 0 dimanche … 5 vendredi
  const recul = { 5: 0, 6: 1, 0: 2, 1: 3 }[j as 5 | 6 | 0 | 1];
  return recul == null ? undefined : addDays(auj, -recul);
}

/** Tous les messages prêts, sans ceux reportés ou écartés. */
export function envoisDuJour(d: Donnees, etat: EtatBoite | null, lienAvis?: string, auj = today()): Envoi[] {
  const out: Envoi[] = [];
  const parId = new Map(d.contacts.map((c) => [c.id, c]));
  const ajouter = (e: Envoi) => {
    if (etat?.ecartes?.[e.cle] || etat?.envoyes?.[e.cle]) return;
    const rep = etat?.reportes?.[e.cle];
    if (rep && rep > auj) return;
    if (!out.some((x) => x.cle === e.cle)) out.push(e);
  };

  // Leads arrivés de Gmail : la réponse attend en brouillon dans Gmail.
  for (const c of d.contacts) {
    if (c.synchro !== "gmail" || jours(c.createdAt) > 3 || (c.etape ?? "nouveau") !== "nouveau" || (c.historique ?? []).some((h) => h.type !== "note")) continue;
    const b = d.biens.find((x) => x.id === c.bienOrigineId);
    ajouter({
      cle: `lead:${c.id}`,
      cat: "lead",
      contact: c,
      bien: b,
      raison: b ? `Demande sur ${b.titre || b.adresse}` : "Nouvelle demande reçue par mail",
      sujet: "",
      mail: "",
      dansGmail: true,
      fait: (canal) => historique(c.id, canal, "Réponse au lead envoyée", { etape: "qualifie" }),
    });
  }

  // Relances prévues
  for (const c of d.contacts) {
    if (!c.dateRelance || c.dateRelance > auj || c.etape === "perdu" || c.etape === "gagne") continue;
    const m = messageRelance(c);
    ajouter({
      cle: `relance:${c.id}:${c.dateRelance}`,
      cat: "relance",
      contact: c,
      raison: c.prochaineAction || (c.dateRelance < auj ? `Relance prévue le ${c.dateRelance.split("-").reverse().join("/")}` : "Relance prévue aujourd'hui"),
      ...m,
      reecrire: true,
      fait: (canal) => historique(c.id, canal, `Relance${c.prochaineAction ? ` : ${c.prochaineAction}` : ""}`, { dateRelance: undefined }),
    });
  }

  // Baisse de prix à annoncer
  for (const b of d.biens) {
    const baisse = baisseEnCours(b as BienBaisse);
    if (!baisse) continue;
    for (const x of aPrevenir(b as BienBaisse, d.contacts, d.rdvs)) {
      const m = messageBaisse(b, x, baisse);
      ajouter({
        cle: `baisse:${b.id}:${x.c.id}:${baisse.a}`,
        cat: "baisse",
        contact: x.c,
        bien: b,
        raison: `${b.titre || b.adresse} passe à ${eur(baisse.a)} (${x.groupe === "visite" ? "a visité le bien" : x.groupe === "propose" ? "bien déjà proposé" : "dans son budget"})`,
        ...m,
        fait: (canal) => marquerPrevenu(b.id, x, canal, baisse),
      });
    }
  }

  // Ventes en cours : un point toutes les deux semaines avec l'acquéreur et le vendeur
  for (const b of d.biens.filter((x) => x.statut === "compromis")) {
    const v = venteDe(b);
    if (v.acteSigne) continue;
    const titre = b.titre || b.adresse;
    const gens: { id: string; role: RoleClient }[] = [...acquereursDe(b).map((id) => ({ id, role: "acquereur" as const })), ...(b.vendeurIds ?? []).map((id) => ({ id, role: "vendeur" as const }))];
    for (const g of gens) {
      const c = parId.get(g.id);
      if (!c) continue;
      const dernier = v.points?.[c.id];
      if (jours(dernier) < 14 || (!dernier && v.signature && jours(v.signature) < 7)) continue;
      const m = g.role === "acquereur" ? messageAcquereur(b, c, auj) : messageVendeur(b, c, auj);
      const texte = g.role === "acquereur" ? `Point sur l'achat : ${titre}` : `Point sur la vente : ${titre}`;
      ajouter({
        cle: `point:${b.id}:${c.id}:${dernier ?? "0"}`,
        cat: "vente",
        contact: c,
        bien: b,
        raison: `${g.role === "acquereur" ? "Acquéreur" : "Vendeur"} de ${titre} : ${dernier ? `dernier point il y a ${jours(dernier)} jours` : "aucun point noté depuis le compromis"}`,
        ...m,
        fait: (canal) => noterPoint(b.id, c.id, canal, texte),
      });
    }
  }

  // Compte rendu de la semaine aux vendeurs (du vendredi au lundi)
  const vendredi = vendrediDuRapport(auj);
  if (vendredi)
    for (const b of d.biens.filter(BIEN_DISPONIBLE)) {
      const vendeurs = (b.vendeurIds ?? []).map((id) => parId.get(id)).filter((c): c is Contact => !!c);
      if (!vendeurs.length) continue;
      const h = rapportHebdo({ bien: b, rdvs: d.rdvs, contacts: d.contacts, vendeurs, finSemaine: vendredi });
      const cle = `hebdo:${b.id}:${vendredi}`;
      ajouter({
        cle,
        cat: "vendeur",
        contact: vendeurs[0],
        bien: b,
        raison: `Compte rendu de la semaine pour ${b.titre || b.adresse} : ${h.visites.length} visite${h.visites.length > 1 ? "s" : ""}, ${h.demandes} demande${h.demandes > 1 ? "s" : ""}`,
        sujet: h.sujet,
        mail: h.texte,
        fait: (canal) => {
          void noterBoite("envoyes", cle, new Date().toISOString());
          vendeurs.forEach((v) => historique(v.id, canal, `Compte rendu de la semaine : ${b.titre}`));
        },
      });
    }

  // Biens compatibles pas encore proposés (les meilleurs, 3 par bien)
  const propositions: Envoi[] = [];
  for (const b of d.biens.filter(BIEN_DISPONIBLE)) {
    const vendeurs = new Set(b.vendeurIds ?? []);
    d.contacts
      .filter((c) => ACQUEREUR_ACTIF(c) && !vendeurs.has(c.id) && !c.biensProposes?.includes(b.id) && (c.email || c.tel))
      .map((c) => ({ c, m: matchScore(c, b) }))
      .filter(({ m }) => m.score >= 70 && !m.bloquants.length)
      .sort((x, y) => y.m.score - x.m.score)
      .slice(0, 3)
      .forEach(({ c, m }) =>
        propositions.push({
          cle: `prop:${b.id}:${c.id}`,
          cat: "proposition",
          contact: c,
          bien: b,
          raison: `${b.titre || b.adresse} correspond à sa recherche (${m.score} %)`,
          sujet: `Un bien pour vous : ${titrePublic(b)}`,
          mail: texteProposition(b, c),
          sms: smsProposition(b, c),
          score: m.score,
          fait: () => marquerPropose(b, getAll("contacts").find((x) => x.id === c.id) ?? c),
        }),
      );
  }
  propositions.sort((x, y) => (y.score ?? 0) - (x.score ?? 0)).slice(0, 15).forEach(ajouter);

  // Retour de visite : lien vers le questionnaire d'une minute, par SMS
  for (const r of visitesARetour(d.rdvs as RdvRetour[])) {
    if (!r.retourId) continue;
    const b = d.biens.find((x) => x.id === r.bienId);
    const titre = b ? titrePublic(b) : "le bien";
    const lien = lienRetour(r.retourId);
    for (const id of r.contactIds ?? []) {
      const c = parId.get(id);
      if (!c?.tel) continue;
      const cle = `retour:${r.id}:${c.id}`;
      ajouter({
        cle,
        cat: "retour",
        contact: c,
        bien: b,
        raison: `Visite de ${b?.titre ?? titre} faite : lui demander son avis`,
        sujet: `Votre avis sur la visite : ${titre}`,
        mail: [bonjour(c), "", `Merci d'avoir visité ${titre}. Pourriez-vous me donner votre avis ? Une minute suffit : ${lien}`, "", "Vos impressions m'aident à vous proposer les biens qui vous correspondent vraiment.", "", signatureMail()].join("\n"),
        sms: [bonjour(c), `Merci pour la visite de ${titre}. Votre avis en une minute : ${lien}`, `${nomConseiller()}, PATRIM`].join("\n"),
        fait: (canal) => {
          void noterBoite("envoyes", cle, new Date().toISOString());
          historique(c.id, canal, `Demande d'avis après la visite : ${titre}`);
        },
      });
    }
  }

  // Pont gestion ↔ vente : bailleurs dont le bail arrive à son terme ou dont le loyer est gelé,
  // acquéreurs investisseurs à qui proposer la mise en location et la gestion.
  const dateFr = (ymd: string) => ymd.split("-").reverse().join("/");
  const pont = (cle: string, c: Contact, b: Bien, raison: string, sujet: string, corps: string[], sms: string) =>
    ajouter({
      cle,
      cat: "pont",
      contact: c,
      bien: b,
      raison,
      sujet,
      mail: [bonjour(c), "", corps.join("\n\n"), "", signatureMail()].join("\n"),
      sms: [bonjour(c), sms, `${nomConseiller()}, PATRIM`].join("\n"),
      fait: (canal) => {
        void noterBoite("envoyes", cle, new Date().toISOString());
        historique(c.id, canal, `${CATEGORIE.pont.label} : ${sujet}`);
      },
    });
  for (const b of d.biens) {
    const loc = locationDe(b);
    if (!loc || !["loue", "preavis"].includes(loc.statut)) continue;
    const proprios = (b.vendeurIds ?? []).map((id) => parId.get(id)).filter((c): c is Contact => !!c && !!(c.email || c.tel));
    if (!proprios.length) continue;
    const x = bailSuivi(b);
    const lieu = [b.quartier, b.ville].filter(Boolean).join(", ") || b.adresse;
    if (x && !(x.type === "meuble" && x.etudiant)) {
      const { fin, limiteConge, preavis } = periodeBail(x, auj);
      const dans = Math.round((new Date(limiteConge).getTime() - new Date(auj).getTime()) / 86400000);
      if (dans >= 45 && dans <= 270)
        for (const c of proprios)
          pont(
            `pont-fin:${b.id}:${fin}:${c.id}`,
            c,
            b,
            `Le bail de ${b.titre} arrive à son terme le ${dateFr(fin)} : congé pour vendre possible jusqu'au ${dateFr(limiteConge)}`,
            "L'échéance de votre bail : le bon moment pour faire le point",
            [
              `Le bail de votre logement${lieu ? ` (${lieu})` : ""} arrive à son terme le ${dateFr(fin)}. Sans démarche de votre part, il se reconduira automatiquement.`,
              `Si vous envisagez de vendre, c'est le moment d'y réfléchir : un logement vendu libre se négocie en général mieux qu'occupé, et le congé pour vente doit être reçu par le locataire au moins ${preavis} mois avant l'échéance, soit avant le ${dateFr(limiteConge)}.`,
              "Je vous propose de faire le point ensemble, avec une estimation gratuite de votre bien, pour que vous puissiez décider en connaissance de cause : garder, relouer ou vendre.",
            ],
            `Le bail de votre logement arrive à son terme le ${dateFr(fin)}. Si vous pensez à vendre, le congé doit partir avant le ${dateFr(limiteConge)}. Voulez-vous que je vous fasse une estimation gratuite ?`,
          );
    }
    if (loyerGele(b.dpe))
      for (const c of proprios)
        pont(
          `pont-dpe:${b.id}:${auj.slice(0, 4)}:${c.id}`,
          c,
          b,
          `${b.titre} est classé ${b.dpe} : loyer gelé${b.dpe === "F" ? ", location interdite en 2028" : ""}`,
          "Votre logement classé " + b.dpe + " : vos options",
          [
            `Votre logement${lieu ? ` (${lieu})` : ""} est classé ${b.dpe} au DPE. Son loyer ne peut plus être augmenté ni révisé${b.dpe === "F" ? ", et il ne pourra plus être loué à partir du 1er janvier 2028" : ", et il ne peut plus faire l'objet d'un nouveau bail"}.`,
            "Deux voies s'offrent à vous : engager des travaux de rénovation énergétique (avec des aides possibles), ou vendre, éventuellement à l'échéance du bail.",
            "Je vous propose d'en parler, avec une estimation gratuite de votre bien en l'état, pour comparer les deux options.",
          ],
          `Votre logement est classé ${b.dpe} : loyer gelé et location bientôt interdite. Je peux vous faire une estimation gratuite pour comparer travaux et vente. Qu'en pensez-vous ?`,
        );
  }
  for (const b of d.biens) {
    const v = venteDe(b);
    const signe = v.acteSigne ?? v.signature;
    if (!signe || signe > auj || jours(signe) > 150) continue;
    for (const id of acquereursDe(b)) {
      const c = parId.get(id);
      if (!c?.criteres?.investissement || !(c.email || c.tel)) continue;
      pont(
        `pont-gestion:${b.id}:${c.id}`,
        c,
        b,
        `Acquéreur investisseur de ${b.titre} : proposer la mise en location et la gestion`,
        "La mise en location de votre futur logement",
        [
          `Votre projet d'investissement avance${v.acteSigne ? " : félicitations pour votre acquisition" : ""} ! Avez-vous déjà pensé à la mise en location ?`,
          "Le service gestion locative de PATRIM peut s'en charger : recherche et sélection du locataire, bail, état des lieux, encaissement des loyers, révision annuelle, et garantie des loyers impayés si vous le souhaitez.",
          "Je peux vous mettre en relation avec notre service gestion et vous donner une estimation du loyer que vous pouvez en attendre.",
        ],
        "Pour votre investissement, notre service gestion peut s'occuper de la mise en location (locataire, bail, loyers). Voulez-vous une estimation du loyer ?",
      );
    }
  }

  // Après l'acte : remerciement, puis nouvelles à la date anniversaire
  for (const b of d.biens) {
    const v = venteDe(b);
    if (!v.acteSigne || v.acteSigne > auj) continue;
    const a = apresAFaire(b, auj);
    const titre = b.titre || b.adresse;
    for (const x of a.merci) {
      const c = parId.get(x.id);
      if (!c) continue;
      ajouter({
        cle: `merci:${b.id}:${c.id}`,
        cat: "apres",
        contact: c,
        bien: b,
        raison: `Remercier ${x.role === "acquereur" ? "l'acquéreur" : "le vendeur"} de ${titre}${lienAvis ? ", avec le lien d'avis" : ""}`,
        ...messageMerci(b, c, x.role, lienAvis),
        fait: (canal) => noterApres(b.id, c.id, "merci", canal, `Remerciement après la vente : ${titre}`),
      });
    }
    if (a.anniversaire)
      for (const x of a.nouvelles) {
        const c = parId.get(x.id);
        if (!c) continue;
        ajouter({
          cle: `nouvelles:${b.id}:${c.id}:${a.anniversaire.date}`,
          cat: "apres",
          contact: c,
          bien: b,
          raison: `La vente de ${titre} a ${a.anniversaire.n} an${a.anniversaire.n > 1 ? "s" : ""}`,
          ...messageNouvelles(b, c, x.role, a.anniversaire.n),
          fait: (canal) => noterApres(b.id, c.id, "nouvelles", canal, `Nouvelles à la date anniversaire : ${titre}`),
        });
      }
  }

  return out.sort((x, y) => ORDRE.indexOf(x.cat) - ORDRE.indexOf(y.cat));
}

export const nomEnvoi = (e: Envoi) => nomComplet(e.contact);
