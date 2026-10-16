/* Lecture d'un export ICS (ou de n'importe quel tableur) directement sur l'appareil :
   CSV, Excel (.xlsx), tableau HTML enregistré en .xls, Excel 2003 XML.
   Rien n'est envoyé : le fichier est lu en mémoire puis oublié. Module pur (testable hors navigateur). */

export type Tableau = string[][];

/** Erreur à afficher telle quelle à l'utilisateur. */
export class ErreurLecture extends Error {}

const commence = (o: Uint8Array, sig: number[]) => sig.every((b, i) => o[i] === b);

export async function lireTableau(octets: Uint8Array): Promise<Tableau> {
  if (!octets.length) throw new ErreurLecture("Le fichier est vide.");
  if (commence(octets, [0x25, 0x50, 0x44, 0x46])) throw new ErreurLecture("Un PDF ne peut pas être lu ici. Dans ICS, choisissez plutôt un export Excel ou CSV.");
  if (commence(octets, [0xd0, 0xcf, 0x11, 0xe0]))
    throw new ErreurLecture("Ce fichier Excel est dans un ancien format. Ouvrez-le dans Excel, enregistrez-le en « Classeur Excel (.xlsx) » ou en CSV, puis choisissez ce nouveau fichier.");
  if (commence(octets, [0x50, 0x4b, 0x03, 0x04])) return nettoyer(await lireXlsx(octets));
  const texte = decoder(octets);
  if (/urn:schemas-microsoft-com:office:spreadsheet/i.test(texte.slice(0, 3000))) return nettoyer(lireXml2003(texte));
  if (/<table[\s>]/i.test(texte.slice(0, 300000))) return nettoyer(lireHtml(texte));
  return nettoyer(lireCsv(texte));
}

/* ---------- texte ---------- */

function decoder(o: Uint8Array) {
  if (o[0] === 0xff && o[1] === 0xfe) return new TextDecoder("utf-16le").decode(o.subarray(2));
  if (o[0] === 0xfe && o[1] === 0xff) return new TextDecoder("utf-16be").decode(o.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(o).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(o); // CSV « Windows » d'Excel ou des logiciels métier
  }
}

function nettoyer(t: Tableau): Tableau {
  return t.map((l) => l.map((c) => (c ?? "").replace(/\s+/g, " ").trim())).filter((l) => l.some(Boolean));
}

const ENTITES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", laquo: "«", raquo: "»", euro: "€", deg: "°",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", oelig: "œ", OElig: "Œ",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", auml: "ä", ccedil: "ç", icirc: "î", iuml: "ï",
  ocirc: "ô", ouml: "ö", ugrave: "ù", ucirc: "û", uuml: "ü", Eacute: "É", Egrave: "È", Ecirc: "Ê", Agrave: "À", Acirc: "Â",
  Ccedil: "Ç", Icirc: "Î", Ocirc: "Ô", Ugrave: "Ù", Ucirc: "Û",
};
function entites(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (tout, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : tout;
    }
    return ENTITES[e] ?? tout;
  });
}

/* ---------- CSV ---------- */

function compter(ligne: string, sep: string) {
  let n = 0;
  let guillemets = false;
  for (const ch of ligne) {
    if (ch === '"') guillemets = !guillemets;
    else if (ch === sep && !guillemets) n++;
  }
  return n;
}

function separateur(texte: string) {
  const lignes = texte.split(/\r\n|\n|\r/).filter((l) => l.trim()).slice(0, 30);
  let meilleur = ";";
  let record = -1;
  for (const sep of [";", "\t", ",", "|"]) {
    const n = lignes.map((l) => compter(l, sep));
    const avec = n.filter((x) => x > 0);
    if (!avec.length) continue;
    // présent sur le plus de lignes possible, avec un nombre de colonnes régulier
    const freq = new Map<number, number>();
    for (const x of avec) freq.set(x, (freq.get(x) ?? 0) + 1);
    const regulier = Math.max(...freq.values());
    const score = avec.length * 100 + regulier * 10 + Math.min(...avec);
    if (score > record) {
      record = score;
      meilleur = sep;
    }
  }
  return meilleur;
}

export function lireCsv(texte: string): Tableau {
  const sep = separateur(texte);
  const lignes: Tableau = [];
  let ligne: string[] = [];
  let cellule = "";
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (guillemets) {
      if (ch === '"') {
        if (texte[i + 1] === '"') {
          cellule += '"';
          i++;
        } else guillemets = false;
      } else cellule += ch;
    } else if (ch === '"' && !cellule.trim()) {
      guillemets = true;
      cellule = "";
    } else if (ch === sep) {
      ligne.push(cellule);
      cellule = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(cellule);
      lignes.push(ligne);
      ligne = [];
      cellule = "";
    } else cellule += ch;
  }
  if (cellule || ligne.length) {
    ligne.push(cellule);
    lignes.push(ligne);
  }
  // Excel protège parfois les numéros ainsi : ="0612345678"
  return lignes.map((l) => l.map((c) => c.replace(/^="(.*)"$/, "$1")));
}

/* ---------- HTML (export « Excel » de beaucoup de logiciels web) ---------- */

export function lireHtml(texte: string): Tableau {
  const tables = [...texte.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const table = tables.sort((a, b) => b.length - a.length)[0] ?? texte;
  const lignes: Tableau = [];
  for (const morceau of table.split(/<tr\b[^>]*>/i).slice(1)) {
    const tr = morceau.split(/<\/tr>/i)[0];
    const cellules = tr.split(/<t[dh]\b[^>]*>/i).slice(1);
    lignes.push(cellules.map((c) => entites(c.split(/<\/t[dh]>/i)[0].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " "))));
  }
  return lignes;
}

/* ---------- Excel 2003 XML (SpreadsheetML) ---------- */

export function lireXml2003(texte: string): Tableau {
  const feuille = /<(?:ss:)?Worksheet\b[\s\S]*?<\/(?:ss:)?Worksheet>/i.exec(texte)?.[0] ?? texte;
  const lignes: Tableau = [];
  for (const r of feuille.matchAll(/<(?:ss:)?Row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:ss:)?Row>)/gi)) {
    const ligne: string[] = [];
    let i = 0;
    for (const c of (r[1] ?? "").matchAll(/<(?:ss:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:ss:)?Cell>)/gi)) {
      const index = /\bss:Index="(\d+)"/i.exec(c[1])?.[1];
      if (index) i = Number(index) - 1;
      const data = /<(?:ss:)?Data\b[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/i.exec(c[2] ?? "")?.[1] ?? "";
      ligne[i] = entites(data.replace(/<[^>]+>/g, ""));
      i++;
    }
    lignes.push(Array.from(ligne, (x) => x ?? ""));
  }
  return lignes;
}

/* ---------- Excel .xlsx (archive zip de fichiers XML) ---------- */

interface Entree {
  methode: number;
  offset: number;
  taille: number;
}

function lireZip(o: Uint8Array) {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  let fin = -1;
  for (let i = o.length - 22; i >= Math.max(0, o.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErreurLecture("Le fichier Excel semble abîmé. Exportez-le de nouveau depuis ICS.");
  const nombre = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const entrees = new Map<string, Entree>();
  for (let k = 0; k < nombre && v.getUint32(p, true) === 0x02014b50; k++) {
    const methode = v.getUint16(p + 10, true);
    const taille = v.getUint32(p + 20, true);
    const lNom = v.getUint16(p + 28, true);
    const lExtra = v.getUint16(p + 30, true);
    const lComm = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nom = new TextDecoder().decode(o.subarray(p + 46, p + 46 + lNom));
    const offset = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    entrees.set(nom.replace(/^\/+/, ""), { methode, offset, taille });
    p += 46 + lNom + lExtra + lComm;
  }
  return entrees;
}

async function extraire(o: Uint8Array, e: Entree) {
  const brut = o.subarray(e.offset, e.offset + e.taille);
  if (e.methode === 0) return brut;
  if (e.methode !== 8) throw new ErreurLecture("Ce fichier Excel utilise une compression inconnue. Enregistrez-le en CSV.");
  const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

const colonne = (ref: string) => {
  const lettres = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const l of lettres) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
};

export async function lireXlsx(o: Uint8Array): Promise<Tableau> {
  const zip = lireZip(o);
  const lire = async (nom: string) => {
    const e = zip.get(nom);
    return e ? new TextDecoder().decode(await extraire(o, e)) : undefined;
  };
  const classeur = await lire("xl/workbook.xml");
  if (classeur === undefined) throw new ErreurLecture("Ce fichier compressé n'est pas un classeur Excel.");

  // Première feuille du classeur
  let chemin = "xl/worksheets/sheet1.xml";
  const rid = /<sheet\b[^>]*?\br:id="([^"]+)"/.exec(classeur)?.[1];
  const liens = (await lire("xl/_rels/workbook.xml.rels")) ?? "";
  for (const m of liens.matchAll(/<Relationship\b[^>]*>/g)) {
    if (rid && new RegExp(`\\bId="${rid}"`).test(m[0])) {
      const cible = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
      if (cible) chemin = cible.startsWith("/") ? cible.slice(1) : `xl/${cible}`;
    }
  }
  const feuille = (await lire(chemin)) ?? (await lire("xl/worksheets/sheet1.xml"));
  if (!feuille) throw new ErreurLecture("Aucune feuille trouvée dans ce classeur.");

  const partages: string[] = [];
  const sst = (await lire("xl/sharedStrings.xml")) ?? "";
  for (const si of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const sans = si[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    partages.push(entites([...sans.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }

  const lignes: Tableau = [];
  for (const r of feuille.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const ligne: string[] = [];
    let i = 0;
    for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Z]+\d+)"/i.exec(c[1])?.[1];
      if (ref) i = colonne(ref);
      const type = /\bt="(\w+)"/.exec(c[1])?.[1];
      const corps = c[2] ?? "";
      const v = /<v>([\s\S]*?)<\/v>/.exec(corps)?.[1];
      let valeur = "";
      if (type === "s") valeur = partages[Number(v)] ?? "";
      else if (type === "inlineStr") valeur = entites([...corps.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
      else if (v !== undefined) valeur = entites(v);
      ligne[i] = valeur;
      i++;
    }
    lignes.push(Array.from(ligne, (x) => x ?? ""));
  }
  return lignes;
}
