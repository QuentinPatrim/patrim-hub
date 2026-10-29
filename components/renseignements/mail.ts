"use client";

/* Mail d'envoi de la fiche de renseignements, sur la trame de l'agence :
   lien de la fiche en ligne, RIB en pièce jointe, état des lieux, les trois
   versements, électricité (PDL) et notice d'entrée. Rempli avec le logement
   du dossier ; ce qui manque reste surligné en jaune pour être complété.
   Deux versions : HTML (gras, couleurs, à coller dans Gmail) et texte brut
   (lien « Mail » du téléphone). Rien n'est envoyé tout seul. */

import { eurosCts } from "@/components/location/loi";
import { salutation, type LogementPublic, type Reponses, type RoleDossier } from "./dossier";

export interface InfosEntree {
  /** État des lieux d'entrée : date AAAA-MM-JJ et heure HH:MM. */
  edlDate?: string;
  edlHeure?: string;
  /** Point de livraison électricité (14 chiffres). */
  pdl?: string;
}

const cle = (bienId: string) => `patrim-hub:entree:${bienId}`;
export function lireEntree(bienId: string): InfosEntree {
  try {
    return JSON.parse(localStorage.getItem(cle(bienId)) || "{}") as InfosEntree;
  } catch {
    return {};
  }
}
export function ecrireEntree(bienId: string, x: InfosEntree) {
  try {
    localStorage.setItem(cle(bienId), JSON.stringify(x));
  } catch {}
}

const BRAND = "#6c191e";
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** « mardi 4 novembre 2026 » (« 1er » pour le premier du mois). */
function jourLong(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  const j = d.getDate();
  return `${JOURS[d.getDay()]} ${j === 1 ? "1er" : j} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}
const heureTexte = (h: string) => {
  const [hh, mm] = h.split(":");
  return `${Number(hh)}h${mm && mm !== "00" ? mm : ""}`;
};

/** Loyer charges comprises du premier mois, au prorata si l'entrée n'est pas le 1er. */
function premierLoyer(l: LogementPublic, entree?: string) {
  if (!entree || !l.loyer) return undefined;
  const [a, m, j] = entree.split("-").map(Number);
  const jours = new Date(a, m, 0).getDate();
  const montant = Math.round((((l.loyer + (l.charges ?? 0)) * (jours - j + 1)) / jours) * 100) / 100;
  return { montant, mois: MOIS[m - 1], depuis: j === 1 ? `1er ${MOIS[m - 1]}` : `${j} ${MOIS[m - 1]}` };
}

/* Morceaux du mail : texte brut, gras, à compléter (surligné), lien. */
type Bout = string | { b: string } | { trou: string } | { lien: string };
type Ligne = Bout[] | { puce: Bout[]; niveau: 1 | 2 } | "";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const enTexte = (b: Bout) => (typeof b === "string" ? b : "b" in b ? b.b : "trou" in b ? `[${b.trou}]` : b.lien);
const enHtml = (b: Bout) =>
  typeof b === "string"
    ? esc(b)
    : "b" in b
      ? `<b style="color:${BRAND}">${esc(b.b)}</b>`
      : "trou" in b
        ? `<span style="background:#fff3a3">[${esc(b.trou)}]</span>`
        : `<a href="${esc(b.lien)}" style="color:${BRAND};font-weight:bold">Remplir ma fiche de renseignements</a>`;

export function mailFiche(o: {
  /** Destinataire : « Bonjour Madame NOM, ». */
  dest: Pick<Reponses, "civilite" | "prenom" | "nom">;
  role: RoleDossier;
  logement: LogementPublic;
  url: string;
  /** Garant : prénom de la personne dont il se porte caution. */
  deQui?: string;
  /** Garants déjà ajoutés au dossier (prénoms), pour le locataire principal. */
  garants?: string[];
  /** Documents demandés à cette personne (cochés par le conseiller). */
  pieces?: string[];
  /** La fiche part avec ce que l'agence sait déjà. */
  prerempli?: boolean;
  infos: InfosEntree;
  signature: string;
}) {
  const { logement: l, infos } = o;
  const bonjour: Ligne = [salutation(o.dest)];
  const dejaRempli: Ligne[] = o.prerempli ? [["J'y ai déjà indiqué les informations dont je dispose : il vous suffira de les vérifier et de compléter le reste."]] : [];
  const pieces: Ligne[] = o.pieces?.length
    ? ["", ["Merci de me transmettre également par retour de mail les documents suivants :"], ...o.pieces.map((x): Ligne => ({ puce: [x], niveau: 1 }))]
    : [];
  const fin: Ligne[] = ["", ["Je reste à votre disposition pour toute information complémentaire."], ["Belle journée."], ["Cordialement,"], [o.signature]];
  const lien: Ligne = [{ lien: o.url }];

  let lignes: Ligne[];
  if (o.role === "garant") {
    lignes = [
      bonjour,
      "",
      [
        `Vous vous portez garant${o.deQui ? ` de ${o.deQui}` : ""} pour la location du logement `,
        { b: l.titre },
        ". Vous trouverez ci-dessous le lien pour compléter votre fiche de renseignements en ligne, depuis votre téléphone ou votre ordinateur :",
      ],
      lien,
      ...dejaRempli,
      ["Ce lien vous est personnel, merci de ne pas le transférer."],
      ...pieces,
      "",
      ["Je vous invite à la compléter dans les plus brefs délais. À réception du dossier complet, je serai en mesure de vous adresser l'acte de cautionnement par voie électronique pour signature."],
      ...fin,
    ];
  } else {
    const pm = premierLoyer(l, infos.edlDate || l.entree);
    const edl: Bout[] = infos.edlDate ? [{ b: `${jourLong(infos.edlDate)}${infos.edlHeure ? ` à ${heureTexte(infos.edlHeure)}` : ""}` }] : [{ trou: "date et heure" }];
    if (infos.edlDate && !infos.edlHeure) edl.push(" à ", { trou: "heure" });
    const montant = (n?: number): Bout => (n ? { b: eurosCts(n) } : { trou: "montant" });
    const garant: Ligne[] =
      o.role === "locataire"
        ? o.garants?.length
          ? [[o.garants.length > 1 ? `Vos garants (${o.garants.join(", ")}) recevront chacun leur propre lien pour compléter leur fiche.` : `Votre garant (${o.garants[0]}) recevra son propre lien pour compléter sa fiche.`]]
          : [["Si vous avez un garant (ou un colocataire), vous pourrez l'ajouter à la fin de votre fiche : il recevra son propre lien."]]
        : [];
    lignes = [
      bonjour,
      "",
      ["Vous trouverez ci-dessous le lien pour compléter votre fiche de renseignements en ligne, depuis votre téléphone ou votre ordinateur, ainsi que le RIB ci-joint sur lequel effectuer les différents virements :"],
      lien,
      ...dejaRempli,
      ...garant,
      ...pieces,
      "",
      ["Je vous invite à nous retourner ces éléments dans les plus brefs délais. À réception de votre dossier complet, je serai en mesure de vous adresser le bail de location par voie électronique pour signature."],
      "",
      [
        "À l'occasion de l'état des lieux d'entrée qui aura lieu le ",
        ...edl,
        ", il sera ",
        { b: "impératif" },
        " de nous fournir les éléments suivants par mail sans quoi la remise des clés pourrait être compromise :",
      ],
      { puce: ["L'attestation d'assurance habitation"], niveau: 1 },
      { puce: ["Les justificatifs des trois versements suivants à effectuer après la signature du bail et avant l'état des lieux :"], niveau: 1 },
      { puce: ["Dépôt de garantie : ", montant(l.depot)], niveau: 2 },
      { puce: ["Honoraires de location : ", montant(l.honoraires)], niveau: 2 },
      {
        puce: pm ? [`Loyer du mois de ${pm.mois} (à compter du ${pm.depuis}) : `, montant(pm.montant)] : ["Loyer du mois de ", { trou: "mois" }, " (à compter du ", { trou: "date" }, ") : ", montant()],
        niveau: 2,
      },
      "",
      ["Pensez également à souscrire au contrat auprès de votre fournisseur d'électricité."],
      ["Afin de faciliter la démarche, voici le Point De Livraison : ", infos.pdl ? { b: infos.pdl } : { trou: "PDL" }],
      ["Vous trouverez également la notice d'entrée, accompagnée de quelques informations utiles."],
      ...fin,
    ];
  }

  const texte = lignes
    .map((x) => (x === "" ? "" : Array.isArray(x) ? x.map(enTexte).join("") : `${x.niveau === 1 ? "- " : "    * "}${x.puce.map(enTexte).join("")}`))
    .join("\n");

  // HTML : paragraphes, listes à deux niveaux (comme dans le mail d'origine).
  const html: string[] = [];
  let liste1 = false;
  let liste2 = false;
  const fermer2 = () => liste2 && (html.push("</ul></li>"), (liste2 = false));
  const fermer1 = () => (fermer2(), liste1 && (html.push("</ul>"), (liste1 = false)));
  for (const x of lignes) {
    if (x === "") {
      fermer1();
      html.push("<br>");
    } else if (Array.isArray(x)) {
      fermer1();
      html.push(`<div>${x.map(enHtml).join("")}</div>`);
    } else if (x.niveau === 1) {
      fermer2();
      if (!liste1) (html.push('<ul style="margin:4px 0;padding-left:24px;list-style:disc">'), (liste1 = true));
      html.push(`<li>${x.puce.map(enHtml).join("")}`);
      html.push("</li>");
    } else {
      if (!liste2) {
        html.pop(); // rouvre le dernier élément de premier niveau pour y imbriquer la sous-liste
        html.push('<ul style="margin:4px 0;padding-left:24px;list-style:circle">');
        liste2 = true;
      }
      html.push(`<li>${x.puce.map(enHtml).join("")}</li>`);
    }
  }
  fermer1();

  return {
    sujet: o.role === "garant" ? `Fiche de renseignements garant – ${l.titre}` : `Votre dossier de location – ${l.titre}`,
    texte,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1d1d1f">${html.join("")}</div>`,
    manque: lignes.flatMap((x) => (x === "" ? [] : Array.isArray(x) ? x : x.puce)).filter((b): b is { trou: string } => typeof b === "object" && "trou" in b).map((b) => b.trou),
  };
}

/** Copie le mail mis en forme (collé dans Gmail : gras, couleurs et lien gardés), avec le texte brut en secours. */
export async function copierMail(html: string, texte: string) {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([texte], { type: "text/plain" }) })]);
  } else {
    await navigator.clipboard.writeText(texte);
  }
}
