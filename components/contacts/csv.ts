import type { BienType, Contact, ContactRole, EtapeAcquereur, Source } from "@/lib/types";
import { ETAPE, ROLE, SOURCE, TYPE_BIEN } from "@/lib/format";
import { normalize } from "./helpers";

/* Import / export CSV des contacts, avec détection souple des en-têtes. */

export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1]);
  const sep = counts[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export type CsvField =
  | "nom" | "prenom" | "nomComplet" | "civilite" | "tel" | "email" | "statut" | "role" | "etape" | "chaleur" | "source"
  | "types" | "pieces" | "budgetMin" | "budgetMax" | "surfaceMin" | "quartiers" | "dateContact" | "dateRelance" | "dernierContact"
  | "notes" | "prochaineAction" | "apport";

export const FIELD_LABEL: Record<CsvField, string> = {
  nom: "Nom", prenom: "Prénom", nomComplet: "Nom complet", civilite: "Civilité", tel: "Téléphone", email: "E-mail", statut: "Statut",
  role: "Rôle", etape: "Étape", chaleur: "Chaleur", source: "Source", types: "Type de bien", pieces: "Pièces", budgetMin: "Budget min.",
  budgetMax: "Budget max.", surfaceMin: "Surface min.", quartiers: "Quartiers", dateContact: "Premier contact", dateRelance: "Date de relance",
  dernierContact: "Dernier contact", notes: "Notes", prochaineAction: "Prochaine action", apport: "Apport",
};

const SYN: [CsvField, string[]][] = [
  ["prenom", ["prenom", "first name", "firstname", "first_name", "given name"]],
  ["nomComplet", ["nom complet", "nom et prenom", "nom prenom", "full name", "client", "contact", "name"]],
  ["nom", ["nom", "nom de famille", "last name", "lastname", "last_name", "surname"]],
  ["civilite", ["civilite", "civ", "titre", "genre"]],
  ["tel", ["tel", "telephone", "portable", "mobile", "phone", "gsm", "numero", "tel portable", "telephone mobile"]],
  ["email", ["email", "e-mail", "mail", "courriel", "adresse mail", "adresse email"]],
  ["statut", ["statut", "status", "etat", "temperature"]],
  ["role", ["role", "type contact", "type de contact", "categorie", "profil"]],
  ["etape", ["etape", "pipeline", "stade"]],
  ["chaleur", ["chaleur", "priorite", "interet", "score"]],
  ["source", ["source", "origine", "provenance", "canal", "portail"]],
  ["types", ["type_bien", "type bien", "type de bien", "types", "bien recherche", "typologie", "type"]],
  ["pieces", ["pieces", "nb pieces", "nombre de pieces", "pieces min", "pieces_min", "rooms"]],
  ["budgetMin", ["budget_min", "budget min", "budget minimum", "prix min"]],
  ["budgetMax", ["budget_max", "budget max", "budget maximum", "budget", "prix max", "prix"]],
  ["surfaceMin", ["surface_min", "surface min", "surface", "surface minimum", "m2"]],
  ["quartiers", ["quartiers", "quartier", "secteur", "secteurs", "zone", "zones", "localisation", "ville", "villes"]],
  ["dateContact", ["date_contact", "date contact", "date de contact", "cree le", "date creation", "date de creation", "created"]],
  ["dateRelance", ["date_relance", "date relance", "relance", "a relancer", "prochaine relance", "rappel"]],
  ["dernierContact", ["last_contact", "dernier contact", "dernier_contact", "last contact"]],
  ["notes", ["notes", "note", "commentaire", "commentaires", "remarques", "observations", "message"]],
  ["prochaineAction", ["prochaine action", "prochaine_action", "action", "next step", "a faire"]],
  ["apport", ["apport", "apport personnel"]],
];

const keyOf = (h: string) => normalize(h).replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

export function detectColumns(header: string[]): (CsvField | null)[] {
  const used = new Set<CsvField>();
  const out: (CsvField | null)[] = header.map(() => null);
  // 1) correspondances exactes, 2) correspondances partielles
  for (const exact of [true, false]) {
    header.forEach((h, i) => {
      if (out[i]) return;
      const k = keyOf(h);
      if (!k) return;
      for (const [f, syns] of SYN) {
        if (used.has(f)) continue;
        if (syns.some((s) => (exact ? keyOf(s) === k : k.includes(keyOf(s)) && keyOf(s).length >= 4))) {
          out[i] = f;
          used.add(f);
          return;
        }
      }
    });
  }
  return out;
}

function num(s?: string): number | undefined {
  if (!s) return undefined;
  let t = s.toLowerCase().replace(/\s| | |€|eur|m2|m²/g, "").replace(",", ".");
  let m = 1;
  if (t.endsWith("k")) {
    m = 1000;
    t = t.slice(0, -1);
  }
  const n = parseFloat(t);
  return isNaN(n) ? undefined : Math.round(n * m);
}

/** jj/mm/aaaa, aaaa-mm-jj ou date ISO → AAAA-MM-JJ */
export function parseDate(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return undefined;
}

const ETAPE_SYN: [EtapeAcquereur, string[]][] = [
  ["perdu", ["perdu", "abandon", "inactif", "archive", "clos", "ferme", "plus interesse"]],
  ["gagne", ["gagne", "signe", "acte", "vendu", "achete", "conclu"]],
  ["compromis", ["compromis", "promesse"]],
  ["offre", ["offre", "proposition"]],
  ["visite", ["visite", "rdv"]],
  ["qualifie", ["qualifie", "actif", "en cours", "suivi", "a suivre", "contacte", "recherche"]],
  ["nouveau", ["nouveau", "new", "a contacter", "a traiter", "lead"]],
];

function parseRole(s: string): ContactRole | undefined {
  const t = normalize(s);
  if (!t) return undefined;
  if (t.includes("prospect") && t.includes("vend")) return "prospect_vendeur";
  if (t.includes("vend") || t.includes("proprio") || t.includes("mandant")) return "vendeur";
  if (t.includes("acqu") || t.includes("achet") || t.includes("acheteur")) return "acquereur";
  if (t.includes("locat")) return "locataire";
  if (t.includes("partenaire") || t.includes("notaire") || t.includes("courtier")) return "partenaire";
  return undefined;
}
function parseEtape(s: string): EtapeAcquereur | undefined {
  const t = normalize(s);
  for (const [e, syns] of ETAPE_SYN) if (syns.some((x) => t.includes(x))) return e;
  return undefined;
}
function parseChaleur(s: string): 1 | 2 | 3 | undefined {
  const t = normalize(s);
  if (!t) return undefined;
  if (/chaud|hot|urgent|prioritaire|tres interesse|3/.test(t)) return 3;
  if (/tiede|warm|moyen|2/.test(t)) return 2;
  if (/froid|cold|faible|1/.test(t)) return 1;
  return undefined;
}
function parseSource(s: string): Source | undefined {
  const t = normalize(s).replace(/[^a-z]/g, "");
  if (!t) return undefined;
  if (t.includes("seloger")) return "seloger";
  if (t.includes("leboncoin") || t === "lbc") return "leboncoin";
  if (t.includes("bienici")) return "bienici";
  if (t.includes("site") || t.includes("web") || t.includes("patrim")) return "site";
  if (t.includes("tel") || t.includes("appel")) return "telephone";
  if (t.includes("vitrine") || t.includes("agence") || t.includes("passage")) return "vitrine";
  if (t.includes("recom") || t.includes("bouche") || t.includes("parrain")) return "recommandation";
  if (t.includes("insta")) return "instagram";
  if (t.includes("pige")) return "pige";
  return "autre";
}
function parseTypes(s: string): BienType[] | undefined {
  const t = normalize(s);
  const out: BienType[] = [];
  if (/appart|^t\d|studio|duplex|loft/.test(t) || /\bt\d\b/.test(t)) out.push("appartement");
  if (/maison|villa|pavillon|toulousaine|echoppe/.test(t)) out.push("maison");
  if (/terrain/.test(t)) out.push("terrain");
  if (/local|commerce|bureau/.test(t)) out.push("local");
  if (/immeuble/.test(t)) out.push("immeuble");
  if (/parking|garage|box/.test(t)) out.push("parking");
  return out.length ? out : undefined;
}

export interface ImportResult {
  rows: Partial<Contact>[];
  ignores: number;
  doublons: number;
}

export function rowsToContacts(rows: string[][], cols: (CsvField | null)[], existants: Contact[]): ImportResult {
  const seen = new Set<string>();
  existants.forEach((c) => {
    if (c.tel) seen.add("t" + c.tel.replace(/\D/g, "").slice(-9));
    if (c.email) seen.add("e" + normalize(c.email));
  });
  const out: Partial<Contact>[] = [];
  let ignores = 0;
  let doublons = 0;
  for (const r of rows) {
    const g = (f: CsvField) => {
      const i = cols.indexOf(f);
      return i >= 0 ? (r[i] ?? "").trim() : "";
    };
    let nom = g("nom");
    let prenom = g("prenom");
    const full = g("nomComplet");
    if (!nom && full) nom = full;
    if (nom && !prenom && cols.indexOf("prenom") < 0) {
      // "Claire MARTIN" ou "MARTIN Claire" → prénom / nom
      const parts = nom.split(/\s+/);
      if (parts.length >= 2) {
        const isUpper = (p: string) => p.length > 1 && p === p.toUpperCase() && /[A-ZÀ-Ý]/.test(p);
        const up = parts.filter(isUpper);
        const low = parts.filter((p) => !isUpper(p));
        if (up.length && low.length) {
          nom = up.join(" ");
          prenom = low.join(" ");
        } else {
          prenom = parts[0];
          nom = parts.slice(1).join(" ");
        }
      }
    }
    const tel = g("tel");
    const email = g("email");
    if (!nom && !prenom && !tel && !email) {
      ignores++;
      continue;
    }
    const kt = tel ? "t" + tel.replace(/\D/g, "").slice(-9) : "";
    const ke = email ? "e" + normalize(email) : "";
    if ((kt.length > 5 && seen.has(kt)) || (ke && seen.has(ke))) {
      doublons++;
      continue;
    }
    if (kt.length > 5) seen.add(kt);
    if (ke) seen.add(ke);

    const statut = g("statut");
    const role = parseRole(g("role")) ?? parseRole(statut) ?? "acquereur";
    const etape = role === "acquereur" ? parseEtape(g("etape")) ?? parseEtape(statut) ?? "qualifie" : undefined;
    const chaleur = parseChaleur(g("chaleur")) ?? parseChaleur(statut);
    const civRaw = normalize(g("civilite"));
    const civilite = /^(mme|madame|mlle|f)/.test(civRaw) ? "Mme" : /^(m|mr|monsieur|h)\b/.test(civRaw) ? "M." : "";
    const quartiers = g("quartiers").split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean);
    const piecesTxt = g("pieces");
    const pieces = num(piecesTxt.replace(/^t/i, ""));
    const types = parseTypes(g("types"));
    const criteres = {
      types,
      piecesMin: pieces,
      budgetMin: num(g("budgetMin")),
      budgetMax: num(g("budgetMax")),
      surfaceMin: num(g("surfaceMin")),
      quartiers: quartiers.length ? quartiers : undefined,
    };
    const hasCrit = Object.values(criteres).some((v) => v !== undefined);
    const dc = parseDate(g("dateContact"));
    const lc = parseDate(g("dernierContact"));
    const notes = g("notes");
    const apport = num(g("apport"));
    out.push({
      civilite,
      prenom: prenom || undefined,
      nom: nom || prenom || email || tel,
      tel: tel || undefined,
      email: email || undefined,
      roles: [role],
      etape,
      chaleur,
      source: parseSource(g("source")),
      criteres: hasCrit ? (JSON.parse(JSON.stringify(criteres)) as Contact["criteres"]) : undefined,
      financement: apport ? { apport } : undefined,
      dateRelance: parseDate(g("dateRelance")),
      dernierContact: lc ? lc + "T12:00:00.000Z" : undefined,
      prochaineAction: g("prochaineAction") || undefined,
      notes: [notes, statut && !parseEtape(statut) && !parseChaleur(statut) && !parseRole(statut) ? `Statut d'origine : ${statut}` : ""].filter(Boolean).join("\n") || undefined,
      createdAt: dc ? dc + "T12:00:00.000Z" : undefined,
      historique: [{ date: new Date().toISOString(), type: "note", texte: "Importé depuis un fichier" + (dc ? ` (premier contact le ${dc.split("-").reverse().join("/")})` : "") }],
    });
  }
  return { rows: out, ignores, doublons };
}

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function contactsToCsv(list: Contact[]): string {
  const head = ["Civilité", "Prénom", "Nom", "Téléphone", "E-mail", "Rôle", "Étape", "Chaleur", "Source", "Type de bien", "Pièces min", "Budget min", "Budget max", "Surface min", "Quartiers", "Apport", "Accord banque", "Accord démarchage tél.", "Prochaine action", "Date de relance", "Dernier contact", "Créé le", "Notes"];
  const lines = list.map((c) =>
    [
      c.civilite,
      c.prenom,
      c.nom,
      c.tel,
      c.email,
      (c.roles ?? []).map((r) => ROLE[r]).join(", "),
      c.etape ? ETAPE[c.etape].label : "",
      c.chaleur ? ["", "Froid", "Tiède", "Chaud"][c.chaleur] : "",
      c.source ? SOURCE[c.source] : "",
      (c.criteres?.types ?? []).map((t) => TYPE_BIEN[t]).join(", "),
      c.criteres?.piecesMin,
      c.criteres?.budgetMin,
      c.criteres?.budgetMax,
      c.criteres?.surfaceMin,
      (c.criteres?.quartiers ?? []).join(", "),
      c.financement?.apport,
      c.financement?.accordBanque ? "Oui" : "",
      c.optinTel ? "Oui" : "Non",
      c.prochaineAction,
      c.dateRelance,
      c.dernierContact?.slice(0, 10),
      c.createdAt?.slice(0, 10),
      c.notes,
    ]
      .map(esc)
      .join(";")
  );
  return "﻿" + [head.join(";"), ...lines].join("\r\n");
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
