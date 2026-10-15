/* ============================================================
   Charte des documents PATRIM (fiche bien, offre d'achat).
   Couleurs fixes, sans thème sombre, pour un rendu identique
   à l'écran, à l'impression et en PDF.
   Uniquement des informations publiques de l'agence.
   ============================================================ */

export const C = {
  brand: "#6c191e",
  brandLight: "#8e2a30",
  coral: "#ef402a",
  ink: "#1b1e23",
  slate: "#4a4f55",
  muted: "#7a7f87",
  line: "#e5e0da",
  cream: "#f8f5f0",
  paper: "#ece8e2",
};

export const AGENCE = {
  nom: "PATRIM",
  societe: "SAS Patrim",
  adresse: "45, allées Jean Jaurès – 31000 Toulouse",
  tel: "05 61 99 08 08",
  web: "www.patrim.fr",
  cartes: "Cartes professionnelles n° 419 & 983",
  rcs: "RCS Toulouse 403 231 145",
  conseiller: "Quentin Delsol",
  conseillerTitre: "Conseiller en vente",
  conseillerTel: "06 52 45 96 54",
  conseillerMail: "quentin.delsol@patrim.fr",
};

export const MENTIONS = `${AGENCE.nom} · ${AGENCE.adresse} · Tél. ${AGENCE.tel} · ${AGENCE.web} · ${AGENCE.cartes} · ${AGENCE.rcs}`;

export const DPE_COLORS: Record<string, string> = { A: "#009c6d", B: "#52b153", C: "#78bd76", D: "#f4e70f", E: "#f0b50f", F: "#eb8235", G: "#d7221f" };
export const GES_COLORS: Record<string, string> = { A: "#a4dbf8", B: "#8cb4d3", C: "#7792b1", D: "#606f8f", E: "#4d5271", F: "#393551", G: "#281b35" };

/* ---------- Nombres en lettres (montants d'une offre) ---------- */

const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
const DIZAINES = ["", "dix", "vingt", "trente", "quarante", "cinquante", "soixante"];

function sous100(n: number): string {
  if (n <= 16) return UNITES[n];
  if (n < 20) return "dix-" + UNITES[n - 10];
  if (n < 70) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return DIZAINES[d] + (u === 0 ? "" : u === 1 ? " et un" : "-" + UNITES[u]);
  }
  if (n < 80) return n === 71 ? "soixante et onze" : "soixante-" + sous100(n - 60);
  if (n === 80) return "quatre-vingts";
  return "quatre-vingt-" + sous100(n - 80);
}

function sous1000(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const cent = c === 0 ? "" : c === 1 ? "cent" : UNITES[c] + (r === 0 ? " cents" : " cent");
  if (!r) return cent;
  return (cent ? cent + " " : "") + sous100(r);
}

/** 115000 → « cent quinze mille ». Entiers positifs jusqu'au milliard. */
export function enLettres(n: number): string {
  n = Math.round(Math.abs(n));
  if (n === 0) return "zéro";
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;
  if (millions) parts.push(millions === 1 ? "un million" : sous1000(millions).replace(/cents$/, "cent") + " millions");
  if (milliers) parts.push(milliers === 1 ? "mille" : sous1000(milliers).replace(/cents$/, "cent").replace(/vingts$/, "vingt") + " mille");
  if (reste) parts.push(sous1000(reste));
  return parts.join(" ");
}

/** 115000 → « cent quinze mille euros (115 000,00 €) » */
export const montantComplet = (n: number) =>
  `${enLettres(n)} euros (${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)`;
