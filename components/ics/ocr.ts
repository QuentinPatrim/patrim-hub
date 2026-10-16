/* Lecture des impressions d'écran d'ICS (pages faites d'images, sans texte), sur l'appareil.
   ICS s'affiche avec les polices bitmap classiques de X11 : chaque lettre y est toujours dessinée avec exactement
   les mêmes points. On retrouve donc les lettres en comparant l'image, colonne par colonne, aux dessins de ces
   polices (polices.ts). Module pur : rien n'est envoyé, rien n'est gardé. */

import { POLICES } from "./polices";
import { POLICES_IMPRIMEES } from "./policesImprimees";
import { Collecte, type Apercu } from "./formes";
import { enTrame, formeImage, ImageNonLue, quarts, redresser, type ImageBrute, type Trame } from "./images";

/** Caractère lu, au format des caractères d'un PDF texte (x, y : position du point de départ ; w : avance ; t : hauteur). */
export interface GlypheLu {
  ch: string;
  x: number;
  y: number;
  w: number;
  t: number;
  sens: number;
}

interface Dessin {
  /** Caractères possibles (plusieurs quand deux lettres ont le même dessin, comme I et l en Helvetica). */
  ch: string;
  avance: number;
  /** Première colonne de points par rapport au point de départ. */
  gauche: number;
  /** Colonnes de points ; bit r = ligne (ligne de base − montée + r). */
  cols: Int32Array;
  points: number;
}

interface Police {
  nom: string;
  montee: number;
  descente: number;
  espace: number;
  imprimee: boolean;
  dessins: Dessin[];
  /** Dessins rangés par leur première colonne (lecture exacte). */
  parPremiere: Map<number, number[]>;
}

let polices: Police[] | null = null;

function chargerPolices(): Police[] {
  if (polices) return polices;
  polices = [...POLICES, ...POLICES_IMPRIMEES].map((p) => {
    const o = Uint8Array.from(atob(p.glyphes), (c) => c.charCodeAt(0));
    const parCle = new Map<string, Dessin>();
    const dessins: Dessin[] = [];
    for (let i = 0; i + 6 <= o.length; ) {
      const code = o[i];
      const avance = o[i + 1];
      const gauche = (o[i + 2] << 24) >> 24;
      const haut = (o[i + 3] << 24) >> 24;
      const l = o[i + 4];
      const h = o[i + 5];
      i += 6;
      const cols = new Int32Array(l);
      let points = 0;
      for (let r = 0; r < h; r++)
        for (let c = 0; c < l; c++) {
          const b = r * l + c;
          if ((o[i + (b >> 3)] >> (7 - (b & 7))) & 1) {
            cols[c] |= 1 << (p.montee + haut + r);
            points++;
          }
        }
      i += (l * h + 7) >> 3;
      const ch = String.fromCharCode(code);
      const cle = `${l}:${cols.join(",")}`;
      const deja = parCle.get(cle);
      if (deja) deja.ch += ch;
      else {
        const d = { ch, avance, gauche, cols, points };
        parCle.set(cle, d);
        dessins.push(d);
      }
    }
    const parPremiere = new Map<number, number[]>();
    dessins.forEach((d, k) => parPremiere.set(d.cols[0], [...(parPremiere.get(d.cols[0]) ?? []), k]));
    return { nom: p.nom, montee: p.montee, descente: p.descente, espace: p.espace, imprimee: !!p.imprimee, dessins, parPremiere };
  });
  return polices;
}

const pop = (v: number) => {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
};

/* ---------- image → points d'encre ---------- */

interface Encre {
  l: number;
  h: number;
  e: Uint8Array;
}

/** Plus grande valeur dans un carré de 7 points autour de chaque point (deux passes : lignes puis colonnes). */
function maxLocal(lum: Uint8Array, l: number, h: number): Uint8Array {
  // Fenêtre de 7 = deux fenêtres de 4 qui se chevauchent, chacune = deux fenêtres de 2.
  const tmp = new Uint8Array(l * h);
  const p = new Uint8Array(l + 9);
  const m2 = new Uint8Array(l + 8);
  const m4 = new Uint8Array(l + 6);
  for (let y = 0; y < h; y++) {
    const o = y * l;
    p.fill(0);
    p.set(lum.subarray(o, o + l), 3);
    for (let i = 0; i < l + 8; i++) m2[i] = p[i] > p[i + 1] ? p[i] : p[i + 1];
    for (let i = 0; i < l + 6; i++) m4[i] = m2[i] > m2[i + 2] ? m2[i] : m2[i + 2];
    for (let x = 0; x < l; x++) tmp[o + x] = m4[x] > m4[x + 3] ? m4[x] : m4[x + 3];
  }
  // Même chose sur les colonnes, ligne entière par ligne entière (lecture de la mémoire dans l'ordre),
  // avec trois lignes vides avant et six après.
  const P = new Uint8Array(l * (h + 9));
  P.set(tmp, 3 * l);
  const n2 = l * (h + 8);
  const M2 = new Uint8Array(n2);
  for (let i = 0; i < n2; i++) M2[i] = P[i] > P[i + l] ? P[i] : P[i + l];
  const n4 = l * (h + 6);
  const M4 = new Uint8Array(n4);
  const l2 = 2 * l;
  for (let i = 0; i < n4; i++) M4[i] = M2[i] > M2[i + l2] ? M2[i] : M2[i + l2];
  const res = new Uint8Array(l * h);
  const l3 = 3 * l;
  for (let i = 0; i < l * h; i++) res[i] = M4[i] > M4[i + l3] ? M4[i] : M4[i + l3];
  return res;
}

/** Seuil d'encre selon la clarté du fond : un point est de l'encre s'il est plus foncé que ce seuil. */
const SEUILS = Uint8Array.from({ length: 256 }, (_, m) => Math.max(0, Math.ceil(m - Math.max(48, 0.4 * m))));

/** Points d'encre : nettement plus foncés que le fond autour d'eux (le plus clair dans un carré de 7 points). */
function encre(t: Trame): Encre {
  const { l, h, lum } = t;
  const clair = maxLocal(lum, l, h);
  const e = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) e[i] = lum[i] < SEUILS[clair[i]] ? 1 : 0;
  return { l, h, e };
}

/** Lignes écrites en clair sur fond sombre (ligne sélectionnée d'une liste) : bandes peu hautes de lignes surtout
    foncées, rendues en négatif. La couleur sombre qui couvre une grande partie de l'image (le bureau) ne compte pas. */
function bandesSombres(t: Trame): { y0: number; trame: Trame }[] {
  const { l, h, lum } = t;
  const hist = new Uint32Array(256);
  for (let i = 0; i < l * h; i++) if (lum[i] < 100) hist[lum[i]]++;
  let fond = -1;
  let record = 0.15 * l * h;
  for (let v = 0; v < 100; v++)
    if (hist[v] > record) {
      record = hist[v];
      fond = v;
    }
  const sombre = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < l; x++) {
      const v = lum[y * l + x];
      if (v < 100 && (fond < 0 || Math.abs(v - fond) > 2)) n++;
    }
    sombre[y] = 4 * n > l ? 1 : 0;
  }
  const res: { y0: number; trame: Trame }[] = [];
  for (let y = 0; y < h; ) {
    if (!sombre[y]) {
      y++;
      continue;
    }
    let fin = y;
    while (fin < h && sombre[fin]) fin++;
    if (fin - y >= 6 && fin - y <= 60) {
      const y0 = Math.max(0, y - 1);
      const y1 = Math.min(h, fin + 1);
      const r = new Uint8Array(l * (y1 - y0));
      for (let i = 0; i < r.length; i++) r[i] = 255 - lum[y0 * l + i];
      res.push({ y0, trame: { l, h: y1 - y0, lum: r } });
    }
    y = fin;
  }
  return res;
}

/** Image agrandie par un facteur entier (chaque point d'écran devenu un carré de s × s) : ramenée à 1 point.
    On le voit aux changements de couleur, qui ne tombent alors que toutes les s colonnes (et lignes). */
function reduire(t: Trame): { t: Trame; s: number } {
  const { l, h, lum } = t;
  for (const s of [4, 3, 2]) {
    const cx = new Array<number>(s).fill(0);
    const cy = new Array<number>(s).fill(0);
    let nx = 0;
    let ny = 0;
    for (let y = 1; y < h; y += 5)
      for (let x = 1; x < l; x++) {
        const i = y * l + x;
        if (lum[i] !== lum[i - 1]) {
          cx[x % s]++;
          nx++;
        }
      }
    for (let y = 1; y < h; y++)
      for (let x = 1; x < l; x += 5) {
        const i = y * l + x;
        if (lum[i] !== lum[i - l]) {
          cy[y % s]++;
          ny++;
        }
      }
    const px = cx.indexOf(Math.max(...cx));
    const py = cy.indexOf(Math.max(...cy));
    if (nx < 300 || ny < 300 || cx[px] < 0.98 * nx || cy[py] < 0.98 * ny) continue;
    const L = Math.floor((l - px) / s);
    const H = Math.floor((h - py) / s);
    const r = new Uint8Array(L * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) r[y * L + x] = lum[(y * s + py) * l + x * s + px];
    return { t: { l: L, h: H, lum: r }, s };
  }
  return { t, s: 1 };
}

/** Traits du quadrillage (longs traits horizontaux ou verticaux) et gros dessins (icônes, boutons) effacés.
    Renvoie les lignes de base probables : là où s'arrête le bas de beaucoup de morceaux (lettres sans jambage) d'au
    moins hMin lignes (page imprimée : ni les points des i, ni les accents ne comptent). */
function nettoyer(en: Encre, hMax: number, hMin = 3): number[] {
  const { l, h, e } = en;
  const traits: number[] = [];
  for (let y = 0; y < h; y++) {
    let debut = -1;
    for (let x = 0; x <= l; x++) {
      const v = x < l ? e[y * l + x] : 0;
      if (v && debut < 0) debut = x;
      if (!v && debut >= 0) {
        if (x - debut >= 40) for (let k = debut; k < x; k++) traits.push(y * l + k);
        debut = -1;
      }
    }
  }
  // Traits verticaux : une longueur en cours par colonne, en parcourant l'image ligne par ligne.
  const depuis = new Int32Array(l).fill(-1);
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < l; x++) {
      const v = y < h ? e[y * l + x] : 0;
      const d = depuis[x];
      if (v && d < 0) depuis[x] = y;
      else if (!v && d >= 0) {
        if (y - d >= hMax + 4) for (let k = d; k < y; k++) traits.push(k * l + x);
        depuis[x] = -1;
      }
    }
  for (const i of traits) e[i] = 0;
  // Morceaux d'un seul tenant : plus hauts qu'une lettre, ce n'est pas du texte.
  const vu = new Uint8Array(l * h);
  const pile = new Int32Array(l * h);
  const bas = new Float64Array(h + 1);
  for (let i = 0; i < l * h; i++) {
    if (!e[i] || vu[i]) continue;
    let y0 = h;
    let y1 = -1;
    let n = 0;
    let lu = 0;
    pile[n++] = i;
    vu[i] = 1;
    // Les points du morceau restent dans la pile (lus de « lu » à « n ») pour pouvoir l'effacer.
    while (lu < n) {
      const j = pile[lu++];
      const y = (j / l) | 0;
      const x = j - y * l;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const xa = x > 0 ? -1 : 0;
      const xb = x < l - 1 ? 1 : 0;
      const ya = y > 0 ? -1 : 0;
      const yb = y < h - 1 ? 1 : 0;
      for (let dy = ya; dy <= yb; dy++)
        for (let dx = xa; dx <= xb; dx++) {
          const k = j + dy * l + dx;
          if (e[k] && !vu[k]) {
            vu[k] = 1;
            pile[n++] = k;
          }
        }
    }
    const haut = y1 - y0 + 1;
    if (haut > hMax + 2) for (let k = 0; k < n; k++) e[pile[k]] = 0;
    else if (haut >= hMin) bas[y1 + 1]++;
  }
  const candidats = Array.from(bas.keys())
    .filter((y) => bas[y] >= 2)
    .sort((a, b) => bas[b] - bas[a] || a - b);
  const retenus: number[] = [];
  for (const y of candidats) if (!retenus.some((r) => Math.abs(r - y) <= 4)) retenus.push(y);
  return retenus.sort((a, b) => a - b);
}

/* ---------- une ligne de texte ---------- */

interface Place {
  x: number;
  d: Dessin;
  cout: number;
}

interface LigneLue {
  base: number;
  police: Police;
  places: Place[];
  /** Points d'encre de la bande, points expliqués par des lettres, erreurs. */
  encre: number;
  expliques: number;
  cout: number;
}

const INCONNU = 2;
const PAR_LETTRE = 0.5;

/** Colonnes de la bande d'une ligne (une valeur par colonne, un bit par ligne de points).
    Page imprimée : les points isolés (poussières de la télécopie) ne comptent pas, aucune lettre n'en a. */
function bande(en: Encre, base: number, p: Police): Int32Array {
  const { l, h, e } = en;
  const haut = base - p.montee;
  const n = p.montee + p.descente;
  const cols = new Int32Array(l);
  const voisin = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if ((dx || dy) && xx >= 0 && xx < l && e[yy * l + xx]) return true;
      }
    }
    return false;
  };
  for (let r = 0; r < n; r++) {
    const y = haut + r;
    if (y < 0 || y >= h) continue;
    const ligne = y * l;
    for (let x = 0; x < l; x++) if (e[ligne + x] && (!p.imprimee || voisin(x, y))) cols[x] |= 1 << r;
  }
  return cols;
}

/** Meilleure suite de lettres pour expliquer les points de la bande (programmation dynamique, colonne par colonne).
    Police d'impression : deux lettres voisines peuvent se toucher dans une même colonne (empattements du Courier) ;
    l'état « partagé » d'une colonne veut dire que la lettre précédente finit sur elle et que la suivante y commence. */
function lireLigne(cols: Int32Array, p: Police, strict: boolean): Omit<LigneLue, "base" | "police"> | null {
  let x0 = 0;
  while (x0 < cols.length && !cols[x0]) x0++;
  let x1 = cols.length - 1;
  while (x1 >= x0 && !cols[x1]) x1--;
  if (x1 < x0) return null;
  const n = x1 - x0 + 2;
  // États 0..n-1 : colonnes avant x0 + i expliquées ; n..2n-1 : idem, et la colonne x0 + i est partagée.
  const cout = new Float64Array(2 * n).fill(Infinity);
  const prec = new Int32Array(2 * n).fill(-1);
  const quoi = new Int32Array(2 * n).fill(-1); // -1 : colonne vide ; -2 : encre inconnue ; sinon dessin
  const erreurs = new Float64Array(2 * n);
  cout[0] = 0;
  const imp = p.imprimee;
  const premier = strict ? 0 : imp ? 4 : 2;
  const dessins = p.dessins;
  let encre = 0;
  for (let x = x0; x <= x1; x++) encre += pop(cols[x]);
  const relacher = (de: number, j: number, v: number, q: number, err: number) => {
    if (v < cout[j]) {
      cout[j] = v;
      prec[j] = de;
      quoi[j] = q;
      erreurs[j] = err;
    }
  };
  const col = (x: number) => (x <= x1 ? cols[x] : 0);
  for (let x = x0; x <= x1; x++) {
    const i = x - x0;
    const c = cout[i];
    const cp = imp ? cout[n + i] : Infinity;
    if (c === Infinity && cp === Infinity) continue;
    const m = cols[x];
    if (c !== Infinity) {
      if (!m) {
        relacher(i, i + 1, c, -1, 0);
        continue;
      }
      relacher(i, i + 1, c + pop(m) + INCONNU, -2, 0);
    }
    const candidats = strict ? p.parPremiere.get(m) : undefined;
    if (strict && !candidats) continue;
    const nb = candidats ? candidats.length : dessins.length;
    for (let q = 0; q < nb; q++) {
      const k = candidats ? candidats[q] : q;
      const d = dessins[k];
      const dc = d.cols;
      // Première colonne : toute l'encre compte ; colonne partagée : seuls les points du dessin absents de la page.
      const e0 = pop(m ^ dc[0]);
      const e0p = pop(dc[0] & ~m);
      if ((c === Infinity || e0 > premier) && (cp === Infinity || e0p > premier)) continue;
      const w = dc.length;
      if (x + w - 1 > x1 + 1) continue;
      const limite = strict ? Math.max(1, 0.12 * d.points) : imp ? Math.max(3, 0.45 * d.points) : Math.max(2, 0.34 * d.points);
      let milieu = 0;
      for (let c2 = 1; c2 < w - 1 && milieu <= limite; c2++) milieu += pop(col(x + c2) ^ dc[c2]);
      if (milieu > limite) continue;
      const fin = w > 1 ? pop(col(x + w - 1) ^ dc[w - 1]) : 0;
      const finP = w > 1 ? pop(dc[w - 1] & ~col(x + w - 1)) : 0;
      // Depuis l'état normal, puis depuis l'état partagé.
      for (let partage = 0; partage < 2; partage++) {
        const v = partage ? cp : c;
        const debut = partage ? e0p : e0;
        if (v === Infinity || debut > premier) continue;
        const depart = partage ? n + i : i;
        const err = debut + milieu + fin;
        if (err <= limite) relacher(depart, Math.min(i + w, n - 1), v + err + PAR_LETTRE, k, err);
        // La lettre suivante peut commencer sur la dernière colonne de celle-ci.
        const errP = debut + milieu + finP;
        if (imp && w > 2 && errP <= limite) relacher(depart, n + i + w - 1, v + errP + PAR_LETTRE, k, errP);
      }
    }
  }
  const places: Place[] = [];
  let expliques = 0;
  for (let j = n - 1; j > 0 && prec[j] >= 0; j = prec[j]) {
    const q = quoi[j];
    if (q >= 0) {
      const d = dessins[q];
      places.push({ x: x0 + (prec[j] % n), d, cout: erreurs[j] });
      expliques += d.points - erreurs[j];
    }
  }
  places.reverse();
  return { places, encre, expliques: Math.max(0, expliques), cout: cout[n - 1] };
}

/** Ligne lue avec une police, en essayant aussi la ligne de base un point plus haut ou plus bas. */
function essayer(en: Encre, base: number, p: Police, strict: boolean): LigneLue | null {
  let meilleure: LigneLue | null = null;
  for (const decalage of [0, -1, 1]) {
    const r = lireLigne(bande(en, base + decalage, p), p, strict);
    if (!r) continue;
    const l: LigneLue = { ...r, base: base + decalage, police: p };
    if (!meilleure || note(l) > note(meilleure)) meilleure = l;
    // Police d'impression : ses dessins couvrent déjà les positions à un point près en hauteur.
    if (r.expliques >= 0.98 * r.encre || (p.imprimee && note(l) >= 0.5)) break;
  }
  return meilleure;
}

/** Part de l'encre expliquée par des lettres reconnues, pénalisée par les erreurs. */
const note = (l: LigneLue) => (l.encre ? (l.expliques - l.places.reduce((s, p) => s + p.cout, 0)) / l.encre : 0);

/* ---------- lettres ambiguës, mots, sortie ---------- */

const minuscule = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase();
const majuscule = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
const chiffre = (c: string) => c >= "0" && c <= "9";

/** I ou l, O ou 0… : d'après les autres lettres du mot. */
function lever(places: Place[], p: Police): string[] {
  const res = places.map((pl) => pl.d.ch[0]);
  const depart = (pl: Place) => pl.x - pl.d.gauche;
  let debut = 0;
  for (let k = 0; k <= places.length; k++) {
    const coupe = k === places.length || (k > debut && depart(places[k]) - (depart(places[k - 1]) + places[k - 1].d.avance) > p.espace / 2);
    if (!coupe) continue;
    const mot = places.slice(debut, k);
    const surs = mot.filter((pl) => pl.d.ch.length === 1).map((pl) => pl.d.ch);
    const min = surs.some(minuscule) || surs.some((c) => c === "@" || c === ".");
    const maj = surs.some(majuscule);
    const chi = surs.filter(chiffre).length > surs.length / 2;
    mot.forEach((pl, j) => {
      const c = pl.d.ch;
      if (c.length < 2) return;
      const pick =
        (chi ? [...c].find(chiffre) : undefined) ??
        (min ? [...c].find(minuscule) : undefined) ??
        (maj ? [...c].find(majuscule) : undefined) ??
        [...c].find(minuscule) ??
        c[0];
      res[debut + j] = pick;
    });
    debut = k;
  }
  return res;
}

/* ---------- une image ---------- */

/** Choix des polices sur un échantillon de lignes : celles qui expliquent le mieux l'encre. */
function choisirPolices(en: Encre, bases: number[], toutes: Police[]): { polices: Police[]; strict: boolean; note: number } {
  const echantillon = bases.length > 24 ? bases.filter((_, k) => k % Math.ceil(bases.length / 24) === 0) : bases;
  const victoires = new Map<Police, number>();
  let total = 0;
  let exactes = 0;
  let lettres = 0;
  for (const b of echantillon) {
    let meilleure: LigneLue | null = null;
    for (const p of toutes) {
      const l = essayer(en, b, p, false);
      if (l && (!meilleure || note(l) > note(meilleure))) meilleure = l;
    }
    if (!meilleure || note(meilleure) < 0.6) continue;
    victoires.set(meilleure.police, (victoires.get(meilleure.police) ?? 0) + 1);
    total += note(meilleure);
    for (const pl of meilleure.places) {
      lettres++;
      if (pl.cout === 0) exactes++;
    }
  }
  const n = [...victoires.values()].reduce((a, b) => a + b, 0);
  const choisies = [...victoires.entries()]
    .filter(([, v]) => v >= Math.max(1, 0.15 * n))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p]) => p);
  const strict = lettres > 0 && exactes >= 0.97 * lettres && !choisies.some((p) => p.imprimee);
  return { polices: choisies, strict, note: echantillon.length ? total / echantillon.length : 0 };
}

/** Lignes de texte d'une image, avec les polices retenues. */
function lireEncre(en: Encre, bases: number[], choisies: Police[], strict: boolean): LigneLue[] {
  const lues: LigneLue[] = [];
  for (const b of bases) {
    let meilleure: LigneLue | null = null;
    for (const p of choisies) {
      const l = essayer(en, b, p, strict);
      if (l && (!meilleure || note(l) > note(meilleure))) meilleure = l;
    }
    if (meilleure && meilleure.places.length && note(meilleure) >= 0.5) lues.push(meilleure);
  }
  // Deux lignes qui se chevauchent (accents pris pour une ligne) : on garde celle qui explique le plus d'encre.
  lues.sort((a, b) => b.expliques - a.expliques);
  const gardees: LigneLue[] = [];
  for (const l of lues) {
    const haut = l.base - l.police.montee;
    const bas = l.base + l.police.descente;
    if (gardees.some((g) => haut < g.base + g.police.descente && g.base - g.police.montee < bas)) continue;
    gardees.push(l);
  }
  return gardees.sort((a, b) => a.base - b.base);
}

export interface ResultatOcr {
  pages: GlypheLu[][];
  /** Images qui ont pu être ouvertes (les autres sont dans un format inconnu ici). */
  ouvertes: number;
  /** Résumé pour le code d'aide : forme des images, polices reconnues, sens, nombre de lettres (jamais le texte). */
  resume: string;
  /** Formes de lettres de la première image, pour le dépannage (chacune une fois, dans le désordre). */
  apercu?: Apercu;
}

/** Lit les images de chaque page. `suivi` reçoit l'avancement (page faite, nombre de pages). */
export async function lirePages(pages: ImageBrute[][], suivi?: (fait: number, total: number) => void): Promise<ResultatOcr> {
  const toutes = chargerPolices();
  // Image en noir et blanc (page imprimée, télécopie) : polices d'écran et d'impression ; sinon (capture d'écran en
  // couleur ou en gris) : polices d'écran seulement. Sur une page imprimée aux lignes serrées, deux lettres de deux
  // lignes voisines peuvent se toucher : un morceau y reste du texte jusqu'à deux hauteurs de ligne.
  const ecran = toutes.filter((p) => !p.imprimee);
  const hauteurs = (ps: Police[]) => Math.max(...ps.map((p) => (p.imprimee ? 2 : 1) * (p.montee + p.descente)));
  // Page imprimée : seuls les morceaux d'au moins 6 lignes marquent une ligne de base (pas les points des i, ni les
  // accents, ni les poussières), sinon de fausses lignes s'intercalent entre des lignes très serrées.
  const familles = { ecran: { polices: ecran, hMax: hauteurs(ecran), hMin: 3 }, toutes: { polices: toutes, hMax: hauteurs(toutes), hMin: 6 } };
  const sortie: GlypheLu[][] = [];
  let reglage: { quart: number; polices: Police[]; strict: boolean } | null = null;
  let forme = "";
  let lettres = 0;
  let encreTotale = 0;
  let encreLue = 0;
  let echelles = 1;
  let meilleureNote = 0;
  let nonLues = "";
  let ouvertes = 0;
  let essais = 0;
  // Formes de lettres des premières pages, pour le dépannage.
  const collecte = new Collecte(encre);
  for (let k = 0; k < pages.length; k++) {
    // Aucune police reconnue sur les premières images : inutile de chercher plus loin.
    if (!reglage && essais >= 3) break;
    const glyphes: GlypheLu[] = [];
    let decalage = 0;
    for (const im of pages[k]) {
      if (im.largeur * im.hauteur < 2000) continue;
      if (!forme) forme = formeImage(im);
      const { polices: candidates, hMax, hMin } = im.bpc === 1 || im.masque ? familles.toutes : familles.ecran;
      let trame: Trame;
      try {
        trame = redresser(await enTrame(im), im.ctm, im.rotation);
      } catch (e) {
        if (e instanceof ImageNonLue) {
          nonLues = e.message;
          continue;
        }
        throw e;
      }
      ouvertes++;
      if (k < 4 && !glyphes.length && !decalage) {
        try {
          collecte.ajouter(trame);
        } catch {
          /* sans aperçu */
        }
      }
      // Sens de lecture et polices : cherchés sur la première image qui contient du texte.
      const preparer = (q: number) => {
        const { t, s } = reduire(quarts(trame, q));
        const en = encre(t);
        const bases = nettoyer(en, hMax, hMin);
        return { en, s, t, bases };
      };
      if (!reglage) {
        if (essais++ >= 3) break;
        let meilleur: { quart: number; polices: Police[]; strict: boolean; note: number } | null = null;
        // Le sens mesuré pour l'aperçu des formes d'abord (une page imprimée en paysage est souvent tournée).
        const sens = collecte.sens;
        const ordre = sens === null ? [0, 1, 3, 2] : [sens, (sens + 2) % 4, (sens + 1) % 4, (sens + 3) % 4];
        for (const q of ordre) {
          const { en, bases } = preparer(q);
          const choix = choisirPolices(en, bases, candidates);
          meilleureNote = Math.max(meilleureNote, choix.note);
          if (choix.polices.length && (!meilleur || choix.note > meilleur.note)) meilleur = { quart: q, ...choix };
          // Police d'impression : ses dessins approchés ne sont jamais tout à fait ceux de la page ; dans un mauvais
          // sens, elle n'explique presque rien.
          if (meilleur && (meilleur.note > 0.75 || (meilleur.note >= 0.4 && meilleur.polices.some((p) => p.imprimee)))) break;
        }
        if (!meilleur) continue;
        reglage = meilleur;
      }
      const { en, s, t, bases } = preparer(reglage.quart);
      echelles = s;
      const lu = lireEncre(en, bases, reglage.polices, reglage.strict);
      // Ligne sélectionnée (en clair sur fond sombre) : relue en négatif.
      for (const { y0, trame: bandeInversee } of bandesSombres(t)) {
        const en2 = encre(bandeInversee);
        const bases2 = nettoyer(en2, hMax, hMin);
        for (const l of lireEncre(en2, bases2, reglage.polices, reglage.strict)) {
          l.base += y0;
          if (!lu.some((g) => l.base - l.police.montee < g.base + g.police.descente && g.base - g.police.montee < l.base + l.police.descente)) lu.push(l);
        }
        lu.sort((a, b) => a.base - b.base);
      }
      for (const l of lu) {
        const chars = lever(l.places, l.police);
        l.places.forEach((pl, j) => {
          glyphes.push({ ch: chars[j], x: pl.x - pl.d.gauche, y: -(decalage + l.base), w: pl.d.avance, t: l.police.montee + l.police.descente, sens: 0 });
        });
        lettres += l.places.length;
        encreTotale += l.encre;
        encreLue += l.expliques;
      }
      decalage += en.h + 100;
    }
    sortie.push(glyphes);
    suivi?.(k + 1, pages.length);
    // Laisse respirer l'écran entre deux pages.
    await new Promise((r) => setTimeout(r, 0));
  }
  let ap: Apercu | null = null;
  try {
    ap = collecte.apercu();
  } catch {
    /* sans aperçu */
  }
  const pourcent = encreTotale ? Math.round((100 * encreLue) / encreTotale) : 0;
  const resume = [
    forme,
    nonLues ? `non lu ${nonLues}` : "",
    reglage
      ? `ocr ${reglage.polices.map((p) => p.nom).join("+")} ${reglage.quart * 90}° ×${echelles} ${lettres} c. ${pourcent} %${reglage.strict ? "" : " approx."}`
      : `ocr aucune police (${Math.round(100 * meilleureNote)} %)`,
    ap?.resume ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { pages: sortie, ouvertes, resume, apercu: ap ?? undefined };
}
