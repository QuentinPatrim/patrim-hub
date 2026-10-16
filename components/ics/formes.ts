/* Aperçu de dépannage d'un PDF fait d'images : les formes de lettres qu'on y trouve, chacune une seule fois et dans
   le désordre, et quelques mesures de mise en page (des nombres). Rien n'y permet de relire un nom ou un numéro :
   seules les formes de la taille d'une lettre, vues au moins trois fois, sont gardées. Module pur, sur l'appareil. */

import { quarts, type Trame } from "./images";

export interface Forme {
  l: number;
  h: number;
  /** Bas de la forme par rapport à la ligne de base de sa ligne (positif : en dessous, comme un jambage). */
  bas: number;
  /** Points d'encre, ligne par ligne (1 = encre). */
  points: Uint8Array;
  /** Nombre de fois où la forme a été vue sur la page. */
  n: number;
}

export interface Apercu {
  formes: Forme[];
  /** Mesures de mise en page pour le code d'aide (jamais de texte). */
  resume: string;
}

interface Encre {
  l: number;
  h: number;
  e: Uint8Array;
}

/** Longs traits (cadres, quadrillage, soulignés) effacés : aucune lettre n'est aussi longue. */
function sansTraits(en: Encre, long: number) {
  const { l, h, e } = en;
  const effacer: number[] = [];
  for (let y = 0; y < h; y++) {
    let debut = -1;
    for (let x = 0; x <= l; x++) {
      const v = x < l ? e[y * l + x] : 0;
      if (v && debut < 0) debut = x;
      else if (!v && debut >= 0) {
        if (x - debut >= long) for (let k = debut; k < x; k++) effacer.push(y * l + k);
        debut = -1;
      }
    }
  }
  const depuis = new Int32Array(l).fill(-1);
  for (let y = 0; y <= h; y++)
    for (let x = 0; x < l; x++) {
      const v = y < h ? e[y * l + x] : 0;
      const d = depuis[x];
      if (v && d < 0) depuis[x] = y;
      else if (!v && d >= 0) {
        if (y - d >= long) for (let k = d; k < y; k++) effacer.push(k * l + x);
        depuis[x] = -1;
      }
    }
  for (const i of effacer) e[i] = 0;
}

interface Morceau {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Points du morceau : ordre[debut … fin[. */
  debut: number;
  fin: number;
}

/** Morceaux d'un seul tenant (points voisins, diagonales comprises). */
function morceaux(en: Encre): { liste: Morceau[]; ordre: Int32Array } {
  const { l, h, e } = en;
  let total = 0;
  for (let i = 0; i < l * h; i++) total += e[i];
  const ordre = new Int32Array(total);
  const vu = new Uint8Array(l * h);
  const liste: Morceau[] = [];
  let w = 0;
  for (let i = 0; i < l * h; i++) {
    if (!e[i] || vu[i]) continue;
    const debut = w;
    ordre[w++] = i;
    vu[i] = 1;
    let x0 = l;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let r = debut; r < w; r++) {
      const j = ordre[r];
      const y = (j / l) | 0;
      const x = j - y * l;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = y > 0 ? -1 : 0; dy <= (y < h - 1 ? 1 : 0); dy++)
        for (let dx = x > 0 ? -1 : 0; dx <= (x < l - 1 ? 1 : 0); dx++) {
          const k = j + dy * l + dx;
          if (e[k] && !vu[k]) {
            vu[k] = 1;
            ordre[w++] = k;
          }
        }
    }
    liste.push({ x0, y0, x1, y1, debut, fin: w });
  }
  return { liste, ordre };
}

const mediane = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
};
const centile = (v: number[], p: number) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

/** Sens des lignes de texte : la lettre la plus proche d'une lettre est presque toujours sa voisine dans le mot,
 *  donc sur la même ligne. Vrai si les lignes sont verticales sur l'image. */
function lignesVerticales(liste: Morceau[]): boolean {
  const tailles = liste.map((m) => Math.max(m.x1 - m.x0, m.y1 - m.y0) + 1).filter((v) => v >= 4 && v <= 120);
  const T = mediane(tailles);
  if (T < 4) return false;
  const pris = liste.filter((m) => {
    const t = Math.max(m.x1 - m.x0, m.y1 - m.y0) + 1;
    return t >= 0.5 * T && t <= 3 * T;
  });
  const G = 3 * T;
  const cases = new Map<number, Morceau[]>();
  const cle = (cx: number, cy: number) => cx * 65536 + cy;
  const centre = (m: Morceau) => [(m.x0 + m.x1) / 2, (m.y0 + m.y1) / 2];
  for (const m of pris) {
    const [x, y] = centre(m);
    const k = cle(Math.floor(x / G), Math.floor(y / G));
    const c = cases.get(k);
    if (c) c.push(m);
    else cases.set(k, [m]);
  }
  let horizontaux = 0;
  let verticaux = 0;
  for (const m of pris) {
    const [x, y] = centre(m);
    const cx = Math.floor(x / G);
    const cy = Math.floor(y / G);
    let d2 = Infinity;
    let dx = 0;
    let dy = 0;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const o of cases.get(cle(cx + a, cy + b)) ?? []) {
          if (o === m) continue;
          const [ox, oy] = centre(o);
          const d = (ox - x) ** 2 + (oy - y) ** 2;
          if (d < d2) {
            d2 = d;
            dx = Math.abs(ox - x);
            dy = Math.abs(oy - y);
          }
        }
    if (d2 === Infinity) continue;
    if (dx > dy) horizontaux++;
    else if (dy > dx) verticaux++;
  }
  return verticaux > 1.2 * horizontaux;
}

interface Lettre {
  ms: Morceau[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  base: number;
}

interface Page {
  l: number;
  ordre: Int32Array;
  H: number;
  bases: number[];
  lettres: Lettre[];
  pasX: number[];
  /** Part des lettres alignées sur le bas (ligne de base) et sur le haut de leur ligne : à l'endroit, le bas l'emporte. */
  alignesBas: number;
  alignesHaut: number;
}

/** Lignes et lettres d'une page dont les lignes sont horizontales. */
function lettresDePage(en: Encre): Page | null {
  const { liste, ordre } = morceaux(en);
  const { l } = en;
  // Taille d'une lettre : hauteur médiane des morceaux qui ne sont pas des points ou des virgules.
  const H = mediane(liste.map((m) => m.y1 - m.y0 + 1).filter((v) => v >= 4 && v <= 120));
  if (H < 4) return null;
  const tous = liste.filter((m) => m.y1 - m.y0 + 1 <= 4 * H && m.x1 - m.x0 + 1 <= 6 * H);
  // Lignes de base : là où s'arrête le bas de beaucoup de morceaux de la taille d'une lettre.
  const bas = new Map<number, number>();
  for (const m of tous) if (m.y1 - m.y0 + 1 >= 0.6 * H) bas.set(m.y1 + 1, (bas.get(m.y1 + 1) ?? 0) + 1);
  const pics = [...bas.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const bases: number[] = [];
  for (const [y] of pics) if (!bases.some((b) => Math.abs(b - y) < 0.6 * H)) bases.push(y);
  bases.sort((a, b) => a - b);
  if (!bases.length) return null;
  // Lettres entières (pas les points ni les accents) : à la ligne de base la plus proche de leur bas,
  // un jambage pouvant descendre un peu dessous.
  const parBase = new Map<number, Morceau[]>();
  const ligneDe = new Map<Morceau, number>();
  const ranger = (m: Morceau, b: number) => {
    const ms = parBase.get(b);
    if (ms) ms.push(m);
    else parBase.set(b, [m]);
    ligneDe.set(m, b);
  };
  const plusProche = (m: Morceau) => {
    let meilleure = -1;
    let ecart = Infinity;
    for (const b of bases) {
      const d = m.y1 + 1 <= b ? b - (m.y1 + 1) : 1.5 * (m.y1 + 1 - b);
      if (d < ecart) {
        ecart = d;
        meilleure = b;
      }
    }
    return ecart <= 1.6 * H ? meilleure : -1;
  };
  const grands = tous.filter((m) => m.y1 - m.y0 + 1 >= 0.6 * H);
  const petits = tous.filter((m) => m.y1 - m.y0 + 1 < 0.6 * H);
  for (const m of grands) {
    const b = plusProche(m);
    if (b >= 0) ranger(m, b);
  }
  // Points et accents : avec la lettre juste au-dessous (ou au-dessus pour une cédille), sinon à la ligne la plus proche.
  for (const m of petits) {
    let lie: Morceau | null = null;
    let ecart = Infinity;
    for (const k of grands) {
      if (!ligneDe.has(k)) continue;
      const recouvre = Math.min(k.x1, m.x1) - Math.max(k.x0, m.x0) + 1;
      if (recouvre < 0.5 * (m.x1 - m.x0 + 1)) continue;
      const dessus = k.y0 - m.y1 - 1;
      const dessous = m.y0 - k.y1 - 1;
      const d = dessus >= 0 && dessus <= 0.8 * H ? dessus : dessous >= 0 && dessous <= 0.5 * H ? dessous : Infinity;
      if (d < ecart) {
        ecart = d;
        lie = k;
      }
    }
    const b = lie ? (ligneDe.get(lie) as number) : plusProche(m);
    if (b >= 0) ranger(m, b);
  }
  // Lettres : morceaux d'une même ligne l'un au-dessus de l'autre (point du i, accents) réunis.
  const lettres: Lettre[] = [];
  const pasX: number[] = [];
  let alignesBas = 0;
  let alignesHaut = 0;
  let comptees = 0;
  for (const [b, ms] of parBase) {
    ms.sort((a, c) => a.x0 - c.x0);
    const ligne: Lettre[] = [];
    for (const m of ms) {
      const g = ligne.find((k) => {
        const recouvre = Math.min(k.x1, m.x1) - Math.max(k.x0, m.x0) + 1;
        const etroit = Math.min(k.x1 - k.x0, m.x1 - m.x0) + 1;
        const separes = m.y1 < k.y0 || m.y0 > k.y1;
        return separes && recouvre >= 0.5 * etroit;
      });
      if (g) {
        g.ms.push(m);
        g.x0 = Math.min(g.x0, m.x0);
        g.x1 = Math.max(g.x1, m.x1);
        g.y0 = Math.min(g.y0, m.y0);
        g.y1 = Math.max(g.y1, m.y1);
      } else ligne.push({ ms: [m], x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1, base: b });
    }
    ligne.sort((a, c) => a.x0 - c.x0);
    for (let k = 1; k < ligne.length; k++) {
      const d = ligne[k].x0 - ligne[k - 1].x0;
      if (d > 0 && d <= 2.5 * H) pasX.push(d);
    }
    // Alignement : bas et haut les plus fréquents de la ligne, parmi les lettres de taille normale.
    const normales = ligne.filter((g) => g.y1 - g.y0 + 1 >= 0.6 * H);
    if (normales.length >= 4) {
      const mode = (v: number[]) => {
        const c = new Map<number, number>();
        for (const x of v) c.set(x, (c.get(x) ?? 0) + 1);
        return [...c.entries()].sort((a, z) => z[1] - a[1])[0][0];
      };
      const mb = mode(normales.map((g) => g.y1));
      const mh = mode(normales.map((g) => g.y0));
      alignesBas += normales.filter((g) => Math.abs(g.y1 - mb) <= 1).length;
      alignesHaut += normales.filter((g) => Math.abs(g.y0 - mh) <= 1).length;
      comptees += normales.length;
    }
    lettres.push(...ligne);
  }
  return { l, ordre, H, bases, lettres, pasX, alignesBas: comptees ? alignesBas / comptees : 0, alignesHaut: comptees ? alignesHaut / comptees : 0 };
}

/** Formes de lettres de quelques pages, réunies (une forme vue sur plusieurs pages compte autant de fois).
 *  `encre` donne les points d'encre d'une image (même méthode que la lecture). */
export class Collecte {
  private parCle = new Map<string, Forme>();
  private mesures = "";
  private haut = 0;

  constructor(private readonly encre: (t: Trame) => Encre) {}

  ajouter(t: Trame) {
    let en = this.encre(t);
    sansTraits(en, 64);
    const tourner = (q: number) => {
      const r = quarts({ l: en.l, h: en.h, lum: en.e }, q);
      en = { l: r.l, h: r.h, e: r.lum };
    };
    let quart = 0;
    if (lignesVerticales(morceaux(en).liste)) {
      tourner(1);
      quart = 1;
    }
    let page = lettresDePage(en);
    // À l'envers : les lettres s'alignent alors mieux par le haut que par le bas.
    if (page && page.alignesHaut > page.alignesBas + 0.1) {
      tourner(2);
      quart += 2;
      page = lettresDePage(en) ?? page;
    }
    if (!page) return;
    const { l, ordre, H, bases, lettres, pasX } = page;
    // Formes identiques regroupées.
    const avant = this.parCle.size;
    for (const g of lettres) {
      const lg = g.x1 - g.x0 + 1;
      const hg = g.y1 - g.y0 + 1;
      if (lg > 200 || hg > 200) continue;
      const points = new Uint8Array(lg * hg);
      for (const m of g.ms)
        for (let r = m.debut; r < m.fin; r++) {
          const j = ordre[r];
          const y = (j / l) | 0;
          const x = j - y * l;
          points[(y - g.y0) * lg + (x - g.x0)] = 1;
        }
      const decal = g.y1 + 1 - g.base;
      let cle = `${lg},${hg},${decal}:`;
      for (let i = 0; i < points.length; i += 16) {
        let v = 0;
        for (let k = 0; k < 16 && i + k < points.length; k++) v = (v << 1) | points[i + k];
        cle += v.toString(36) + ".";
      }
      const deja = this.parCle.get(cle);
      if (deja) deja.n++;
      else this.parCle.set(cle, { l: lg, h: hg, bas: decal, points, n: 1 });
    }
    if (this.mesures) return;
    // Mesures de la première page : sens, lignes, taille et épaisseur des lettres, pas.
    this.haut = centile(
      lettres.map((g) => g.y1 - g.y0 + 1),
      0.9,
    );
    const traits: number[] = [];
    for (let y = 0; y < en.h && traits.length < 20000; y += 3) {
      let n = 0;
      for (let x = 0; x <= l; x++) {
        const v = x < l ? en.e[y * l + x] : 0;
        if (v) n++;
        else if (n) {
          traits.push(n);
          n = 0;
        }
      }
    }
    // Pas des lettres : le plus fréquent, et la part des lettres qui le respectent (chasse fixe : presque toutes).
    const comptes = new Map<number, number>();
    for (const d of pasX) comptes.set(d, (comptes.get(d) ?? 0) + 1);
    const [pas] = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
    const suivent = pasX.filter((d) => Math.abs(d - pas) <= 1).length;
    const interlignes = bases.slice(1).map((b, k) => b - bases[k]).filter((d) => d < 4 * H);
    this.mesures = [
      `imp ${quart * 90}°`,
      `${bases.length} l.`,
      `interligne ${mediane(interlignes)}`,
      `h ${H}/${this.haut}`,
      `trait ${mediane(traits)}`,
      `pas ${pas} (${pasX.length ? Math.round((100 * suivent) / pasX.length) : 0} %)`,
      `${this.parCle.size - avant} formes/${lettres.length}`,
    ].join(" ");
  }

  /** Formes vues au moins trois fois, de la taille d'une lettre, les plus fréquentes d'abord puis rangées par taille. */
  apercu(): Apercu | null {
    if (!this.mesures) return null;
    const h = this.haut;
    const formes = [...this.parCle.values()]
      .filter((f) => f.n >= 3 && f.l <= 1.8 * h && f.h <= 1.8 * h && f.l * f.h >= 4)
      .sort((a, b) => b.n - a.n)
      .slice(0, 200)
      .sort((a, b) => b.h - a.h || b.l - a.l || a.bas - b.bas);
    return { formes, resume: this.mesures };
  }
}
