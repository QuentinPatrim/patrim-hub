/* Images des pages d'un PDF, ramenées en niveaux de gris et remises dans le sens où elles s'affichent.
   Tout se passe sur l'appareil : rien n'est envoyé. */

import { ccitt, type ParamsCcitt } from "./ccitt";

export type Espace =
  | { type: "gris" }
  | { type: "rvb" }
  | { type: "cmjn" }
  | { type: "lab" }
  /** Encre d'une couleur d'accompagnement : 1 = pleine encre (foncé). */
  | { type: "teinte"; n: number }
  | { type: "indexe"; base: Espace; max: number; table: Uint8Array };

export type Codec = "" | "DCT" | "CCITT" | "JBIG2" | "JPX" | "?";

export interface ImageBrute {
  largeur: number;
  hauteur: number;
  bpc: number;
  espace: Espace;
  decode: number[] | null;
  /** Masque (ImageMask) : les points à 0 sont peints. */
  masque: boolean;
  octets: Uint8Array;
  codec: Codec;
  ccitt?: ParamsCcitt;
  /** Placement sur la page (carré unité de l'image → page) et rotation de la page (degrés). */
  ctm: number[];
  rotation: number;
}

/** Image en niveaux de gris : 0 = noir, 255 = blanc. */
export interface Trame {
  l: number;
  h: number;
  lum: Uint8Array;
}

export class ImageNonLue extends Error {}

const composantes = (e: Espace): number =>
  e.type === "gris" ? 1 : e.type === "rvb" || e.type === "lab" ? 3 : e.type === "cmjn" ? 4 : e.type === "teinte" ? e.n : 1;

/** Résumé de la forme d'une image pour le code d'aide (dimensions, couleurs, compression ; jamais son contenu). */
export function formeImage(im: ImageBrute): string {
  const e = im.masque ? "masque" : im.espace.type === "indexe" ? `palette ${im.espace.max + 1}` : im.espace.type;
  return `${im.largeur}×${im.hauteur} ${e} ${im.bpc}b${im.codec ? " " + im.codec : ""}`;
}

/** Luminance (0-255) de chaque valeur possible d'un échantillon, composante par composante déjà ramenée entre 0 et 1. */
function luminance(e: Espace, v: number[]): number {
  switch (e.type) {
    case "gris":
      return 255 * v[0];
    case "rvb":
      return 255 * (0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]);
    case "cmjn": {
      const k = 1 - v[3];
      return 255 * (0.299 * (1 - v[0]) * k + 0.587 * (1 - v[1]) * k + 0.114 * (1 - v[2]) * k);
    }
    case "lab":
      return (255 * v[0]) / 100;
    case "teinte":
      return 255 * (1 - Math.max(...v));
    case "indexe": {
      const n = composantes(e.base);
      const i = Math.max(0, Math.min(e.max, Math.round(v[0])));
      const c = Array.from({ length: n }, (_, k) => (e.table[i * n + k] ?? 0) / 255);
      if (e.base.type === "lab") c[0] *= 100;
      return luminance(e.base, c);
    }
  }
}

const borne = (x: number) => (x < 0 ? 0 : x > 255 ? 255 : Math.round(x));

/** Échantillons bruts (1 à 16 bits) → niveaux de gris. */
function brutEnTrame(im: ImageBrute, o: Uint8Array): Trame {
  const { largeur: l, hauteur: h } = im;
  const bpc = im.masque ? 1 : [1, 2, 4, 8, 16].includes(im.bpc) ? im.bpc : 8;
  const n = im.masque ? 1 : composantes(im.espace);
  const pas = Math.ceil((l * n * bpc) / 8);
  const lum = new Uint8Array(l * h);
  const maxi = 2 ** bpc - 1;
  const indexe = im.espace.type === "indexe";
  const d = im.decode && im.decode.length >= 2 * n ? im.decode : null;
  // Valeur d'une composante entre 0 et 1 (ou l'indice de palette).
  const valeur = (s: number, c: number) => {
    if (indexe) return d ? d[0] + (s * (d[1] - d[0])) / maxi : s;
    const a = d ? d[2 * c] : 0;
    const b = d ? d[2 * c + 1] : 1;
    return a + (s * (b - a)) / maxi;
  };
  if (im.masque) {
    const peint = d && d[0] === 1 ? 1 : 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < l; x++) {
        const b = ((o[y * pas + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        lum[y * l + x] = b === peint ? 0 : 255;
      }
    return { l, h, lum };
  }
  // Cas courants (copie d'écran en couleurs ou en gris sur 8 bits) : calcul direct, plus rapide.
  if (bpc === 8 && !d && (im.espace.type === "rvb" || im.espace.type === "gris")) {
    if (im.espace.type === "gris") for (let y = 0; y < h; y++) lum.set(o.subarray(y * pas, y * pas + l), y * l);
    else
      for (let y = 0; y < h; y++)
        for (let x = 0, p = y * pas; x < l; x++, p += 3) lum[y * l + x] = (77 * (o[p] ?? 0) + 150 * (o[p + 1] ?? 0) + 29 * (o[p + 2] ?? 0) + 128) >> 8;
    return { l, h, lum };
  }
  const lire =
    bpc === 8
      ? (p: number) => o[p] ?? 0
      : bpc === 16
        ? (p: number) => o[p * 2] ?? 0
        : (p: number) => {
            const bit = p * bpc;
            return ((o[bit >> 3] ?? 0) >> (8 - bpc - (bit & 7))) & maxi;
          };
  const echelle = bpc === 16 ? 255 : maxi;
  if (n === 1) {
    // Une composante : table de luminance par valeur d'échantillon.
    const t = new Uint8Array(echelle + 1);
    for (let s = 0; s <= echelle; s++) t[s] = borne(luminance(im.espace, [valeur(bpc === 16 ? (s * maxi) / 255 : s, 0)]));
    for (let y = 0; y < h; y++) {
      const ligne = (y * pas * 8) / bpc;
      for (let x = 0; x < l; x++) lum[y * l + x] = t[lire(ligne + x)];
    }
    return { l, h, lum };
  }
  const v = new Array<number>(n);
  const memo = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    const ligne = (y * pas * 8) / bpc;
    for (let x = 0; x < l; x++) {
      let cle = 0;
      for (let c = 0; c < n; c++) {
        const s = lire(ligne + x * n + c);
        cle = cle * (echelle + 1) + s;
        v[c] = s;
      }
      let y8 = memo.get(cle);
      if (y8 === undefined) {
        y8 = borne(luminance(im.espace, v.map((s, c) => valeur(bpc === 16 ? (s * maxi) / 255 : s, c))));
        if (memo.size < 1 << 16) memo.set(cle, y8);
      }
      lum[y * l + x] = y8;
    }
  }
  return { l, h, lum };
}

/** JPEG : décodé par le navigateur, sur l'appareil. */
async function jpeg(im: ImageBrute): Promise<Trame> {
  if (typeof createImageBitmap !== "function") throw new ImageNonLue("DCT");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(new Blob([im.octets], { type: "image/jpeg" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  } catch {
    throw new ImageNonLue("DCT");
  }
  const { width: l, height: h } = bmp;
  let rgba: Uint8ClampedArray;
  if (typeof OffscreenCanvas !== "undefined") {
    const ctx = new OffscreenCanvas(l, h).getContext("2d");
    if (!ctx) throw new ImageNonLue("DCT");
    ctx.drawImage(bmp, 0, 0);
    rgba = ctx.getImageData(0, 0, l, h).data;
  } else {
    const c = document.createElement("canvas");
    c.width = l;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new ImageNonLue("DCT");
    ctx.drawImage(bmp, 0, 0);
    rgba = ctx.getImageData(0, 0, l, h).data;
  }
  bmp.close();
  const lum = new Uint8Array(l * h);
  for (let i = 0; i < l * h; i++) lum[i] = borne(0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2]);
  // Décodage inversé (/Decode [1 0]) : rare, mais respecté.
  if (im.decode && im.decode[0] > im.decode[1]) for (let i = 0; i < lum.length; i++) lum[i] = 255 - lum[i];
  return { l, h, lum };
}

/** Image → niveaux de gris, dans l'ordre de ses échantillons. */
export async function enTrame(im: ImageBrute): Promise<Trame> {
  if (im.codec === "DCT") return jpeg(im);
  if (im.codec === "CCITT" && im.ccitt) {
    const o = ccitt(im.octets, { ...im.ccitt, colonnes: im.ccitt.colonnes || im.largeur, lignes: im.ccitt.lignes || im.hauteur });
    return brutEnTrame({ ...im, bpc: 1, espace: im.masque ? im.espace : { type: "gris" } }, o);
  }
  if (im.codec) throw new ImageNonLue(im.codec);
  return brutEnTrame(im, im.octets);
}

/** Change le sens d'une trame : échange lignes/colonnes, puis retourne chaque axe si demandé. */
function orienter(t: Trame, echange: boolean, inverseX: boolean, inverseY: boolean): Trame {
  const L = echange ? t.h : t.l;
  const H = echange ? t.l : t.h;
  const lum = new Uint8Array(L * H);
  for (let y = 0; y < t.h; y++)
    for (let x = 0; x < t.l; x++) {
      let X = echange ? y : x;
      let Y = echange ? x : y;
      if (inverseX) X = L - 1 - X;
      if (inverseY) Y = H - 1 - Y;
      lum[Y * L + X] = t.lum[y * t.l + x];
    }
  return { l: L, h: H, lum };
}

/** Trame tournée d'un quart de tour dans le sens des aiguilles d'une montre, `k` fois. */
export function quarts(t: Trame, k: number): Trame {
  const q = ((k % 4) + 4) % 4;
  if (q === 0) return t;
  if (q === 2) return orienter(t, false, true, true);
  return q === 1 ? orienter(t, true, true, false) : orienter(t, true, false, true);
}

/** Trame remise dans le sens où la page l'affiche (placement sur la page et rotation de la page). */
export function redresser(t: Trame, ctm: number[], rotation: number): Trame {
  const [a, b, c, d] = ctm;
  // Directions des colonnes et des lignes de l'image, à l'écran (y vers le bas).
  let u: [number, number] = [a, -b];
  let v: [number, number] = [-c, d];
  const q = ((Math.round(rotation / 90) % 4) + 4) % 4;
  for (let k = 0; k < q; k++) {
    u = [-u[1], u[0]];
    v = [-v[1], v[0]];
  }
  if (Math.abs(u[0]) >= Math.abs(u[1])) return u[0] > 0 && v[1] > 0 ? t : orienter(t, false, u[0] < 0, v[1] < 0);
  return orienter(t, true, v[0] < 0, u[1] < 0);
}
