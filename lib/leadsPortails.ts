/* Lecture des mails de portails que le script Gmail ne sait pas analyser lui-même.
   Le script envoie le texte brut ; c'est ici qu'on reconnaît les formats, pour qu'un nouveau
   format ne demande qu'une mise à jour de l'appli et pas un nouveau copier-coller du script. */

export type LeadLu = {
  type: "bien" | "projet" | "estimation";
  reference?: string;
  prix?: number;
  nom?: string;
  email?: string;
  telephone?: string;
  typeBien?: string;
  pieces?: number;
  surface?: string;
  adresse?: string;
  cp?: string;
  ville?: string;
  message?: string;
  projet?: string;
  evaluation?: string;
};

const DOMAINES_PORTAILS = /@(.*\.)?(bienici|seloger|leboncoin|logic-immo|avendrealouer|figaro|pap)\./i;

const titre = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());

function telephone(t: string) {
  const m = t.match(/T[ée]l[ée]phone\s*:\s*(\+?\d[\d .]{8,}\d)/i) ?? t.match(/(?:^|\s)((?:\+33\s?|0)[1-9](?:[ .]?\d{2}){4})(?=\s|$)/m);
  return m ? m[1].replace(/[ .]/g, "") : undefined;
}

function email(t: string) {
  const tous = [...t.matchAll(/(?:E-?mail\s*:\s*)?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi)].map((m) => m[1]);
  return tous.find((e) => !DOMAINES_PORTAILS.test(e) && !/no.?reply|support@|contact@lead/i.test(e));
}

/** Bien'ici « Une nouvelle demande d'estimation dans votre secteur ! » : un vendeur. */
function estimationBienici(t: string, sujet: string): LeadLu | null {
  if (!/demande d.estimation/i.test(sujet + " " + t)) return null;
  const plat = t.replace(/\s+/g, " ");
  const lead: LeadLu = { type: "estimation", email: email(t), telephone: telephone(t) };
  const nom = plat.match(/coordonn[ée]es du prospect\s*(.+?)\s*T[ée]l[ée]phone/i);
  if (nom) lead.nom = titre(nom[1].trim());
  const projet = plat.match(/Projet\s*:\s*(.+?)(?:\s+Les d[ée]tails|$)/i);
  if (projet) lead.projet = projet[1].trim();
  const bien = plat.match(/d[ée]tails du bien [àa] estimer\s*(\S+)\s+(\d+)\s*pi[èe]ces?\s*,\s*([\d.,]+)\s*m²\s*(.+?)\s+(\d{5})\s+(.+?)(?:\s+\*|\s+[ÉE]valuation|$)/i);
  if (bien) {
    lead.typeBien = bien[1];
    lead.pieces = parseInt(bien[2], 10);
    lead.surface = bien[3].replace(",", ".");
    lead.adresse = bien[4].trim();
    lead.cp = bien[5];
    lead.ville = titre(bien[6].trim());
  }
  const atouts = [...t.matchAll(/\*\s*([^*\n]+)/g)].map((m) => m[1].trim()).filter((x) => x.length < 40);
  const evalu = plat.match(/titre indicatif[^:]*:\s*([\d  ]+€)/i);
  if (evalu) lead.evaluation = evalu[1].replace(/[  ]/g, " ").trim();
  lead.message = [lead.projet && `Projet : ${lead.projet}`, atouts.length ? atouts.join(", ") : "", lead.evaluation && `Évaluation Bien'ici : ${lead.evaluation} (indicatif)`].filter(Boolean).join(" · ");
  return lead.email || lead.telephone ? lead : null;
}

/** Bien'ici « Contact prospect-acquéreur pour votre annonce TAPP… » : un acquéreur sur un de nos biens. */
function acquereurBienici(t: string, sujet: string): LeadLu | null {
  if (!/prospect.acqu[ée]reur/i.test(sujet + " " + t)) return null;
  const plat = t.replace(/\s+/g, " ");
  const lead: LeadLu = { type: "bien", email: email(t), telephone: telephone(t) };
  const nom = plat.match(/Ses coordonn[ée]es\s*(?!ci-dessous)(.+?)\s*T[ée]l[ée]phone/);
  if (nom) lead.nom = titre(nom[1].trim());
  const msg = plat.match(/Son message\s*(.+?)\s*Rappel de l.annonce/i);
  if (msg) lead.message = msg[1].trim().slice(0, 600);
  const ref = (sujet + " " + plat).match(/\b([A-Z]{3,5}\d{4,6})\b/);
  if (ref) lead.reference = ref[1];
  const bien = plat.match(/Rappel de l.annonce.*?(Appartement|Maison|Studio|Terrain|Parking|Local|Immeuble)\s+(?:(\d+)\s*pi[èe]ces?\s*)?(?:([\d.,]+)\s*m²)?\s*(\d{5})\s+([A-ZÀ-Ü' -]+?)\s+([\d  ]+)\s*€/i);
  if (bien) {
    lead.typeBien = bien[1];
    if (bien[2]) lead.pieces = parseInt(bien[2], 10);
    if (bien[3]) lead.surface = bien[3].replace(",", ".");
    lead.cp = bien[4];
    lead.ville = titre(bien[5].trim());
    lead.prix = parseInt(bien[6].replace(/\D/g, ""), 10);
  }
  return lead.email || lead.telephone ? lead : null;
}

/** Tout autre mail de portail qui donne les coordonnées d'un particulier (formulaire de contact). */
function contactGenerique(t: string, sujet: string): LeadLu | null {
  if (!/contact|demande|message|int[ée]ress|visite|renseignement/i.test(sujet)) return null;
  const e = email(t);
  const tel = telephone(t);
  if (!e && !tel) return null;
  const nom = t.match(/^\s*(?:Nom|Nom et pr[ée]nom|De)\s*:\s*(.+)$/im);
  const msg = t.match(/^\s*Message\s*:\s*([\s\S]{1,600}?)(?:\n\s*\n|$)/im);
  return { type: "bien", email: e, telephone: tel, nom: nom ? titre(nom[1].trim()) : undefined, message: msg?.[1].trim() };
}

export function lireMailPortail(brut: string, sujet = ""): LeadLu | null {
  const t = String(brut || "").replace(/\r/g, "").replace(/\[https?:[^\]]*\]/g, " ");
  return estimationBienici(t, sujet) ?? acquereurBienici(t, sujet) ?? contactGenerique(t, sujet);
}
