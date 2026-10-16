import type { Tableau } from "./lecture";

/* Lecture d'un PDF directement sur l'appareil, pour la liste « Téléphones et Mails » imprimée depuis ICS
   (imprimante « PDF VIEWER »). On relève chaque caractère avec sa position sur la page, puis on reconstitue
   les lignes et les colonnes du tableau imprimé. Rien n'est envoyé : module pur, sans réseau ni stockage
   (testable hors navigateur). */

/** Erreur à afficher telle quelle à l'utilisateur. */
export class PdfIllisible extends Error {}

const PROTEGE = "Ce PDF est protégé par un mot de passe : il ne peut pas être lu ici. Imprimez de nouveau la liste depuis ICS, sans protection.";

/* ---------- octets ---------- */

function latin1(o: Uint8Array, a = 0, b = o.length) {
  let s = "";
  for (let i = a; i < b; i += 8192) s += String.fromCharCode(...o.subarray(i, Math.min(b, i + 8192)));
  return s;
}

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let k = 0;
  for (const p of parts) {
    out.set(p, k);
    k += p.length;
  }
  return out;
}

const entier = (b: Uint8Array) => b.reduce((n, x) => n * 256 + x, 0);
const egaux = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
const hexa = (c: number) => (c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 55 : c >= 0x61 && c <= 0x66 ? c - 87 : -1);

/* ---------- décompression (Flate, LZW, ASCII85, ASCIIHex, RunLength) ---------- */

interface Huffman {
  compte: Uint16Array;
  symboles: Uint16Array;
}

function huffman(longueurs: ArrayLike<number>, n: number): Huffman {
  const compte = new Uint16Array(16);
  for (let s = 0; s < n; s++) compte[longueurs[s]]++;
  const offs = new Uint16Array(16);
  for (let l = 1; l < 15; l++) offs[l + 1] = offs[l] + compte[l];
  const symboles = new Uint16Array(n);
  for (let s = 0; s < n; s++) if (longueurs[s]) symboles[offs[longueurs[s]]++] = s;
  return { compte, symboles };
}

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const ORDRE = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
let FIXES: [Huffman, Huffman] | undefined;

/** Décompression « deflate » (avec ou sans en-tête zlib). Des données abîmées donnent ce qui a pu être lu. */
function inflate(d: Uint8Array): Uint8Array {
  const zlib = d.length > 2 && (d[0] & 0x0f) === 8 && d[0] >> 4 <= 7 && ((d[0] << 8) | d[1]) % 31 === 0;
  if (zlib) {
    const r = inflateDepuis(d, 2);
    if (r.fini || r.donnees.length) return r.donnees;
  }
  return inflateDepuis(d, 0).donnees;
}

function inflateDepuis(d: Uint8Array, debut: number): { donnees: Uint8Array; fini: boolean } {
  let pos = debut;
  let tampon = 0;
  let nb = 0;
  let sortie = new Uint8Array(Math.max(4096, d.length * 4));
  let n = 0;
  const FIN = new Error("fin");
  const bits = (k: number) => {
    while (nb < k) {
      if (pos >= d.length) throw FIN;
      tampon |= d[pos++] << nb;
      nb += 8;
    }
    const v = tampon & ((1 << k) - 1);
    tampon >>>= k;
    nb -= k;
    return v;
  };
  const place = (k: number) => {
    if (n + k <= sortie.length) return;
    const t = new Uint8Array(Math.max(sortie.length * 2, n + k));
    t.set(sortie.subarray(0, n));
    sortie = t;
  };
  let fini = false;
  const decoder = (h: Huffman) => {
    let code = 0;
    let premier = 0;
    let index = 0;
    for (let l = 1; l <= 15; l++) {
      code |= bits(1);
      const c = h.compte[l];
      if (code - c < premier) return h.symboles[index + (code - premier)];
      index += c;
      premier = (premier + c) << 1;
      code <<= 1;
    }
    throw FIN;
  };
  try {
    for (let dernier = 0; !dernier; ) {
      dernier = bits(1);
      const type = bits(2);
      if (type === 0) {
        tampon = 0;
        nb = 0;
        if (pos + 4 > d.length) throw FIN;
        const len = d[pos] | (d[pos + 1] << 8);
        pos += 4;
        const k = Math.min(len, d.length - pos);
        place(k);
        sortie.set(d.subarray(pos, pos + k), n);
        n += k;
        pos += k;
        if (k < len) throw FIN;
        continue;
      }
      if (type === 3) throw FIN;
      let lit: Huffman;
      let dist: Huffman;
      if (type === 1) {
        if (!FIXES) {
          const l = new Uint8Array(288);
          l.fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280, 288);
          FIXES = [huffman(l, 288), huffman(new Uint8Array(30).fill(5), 30)];
        }
        [lit, dist] = FIXES;
      } else {
        const nlit = bits(5) + 257;
        const ndist = bits(5) + 1;
        const ncode = bits(4) + 4;
        const lc = new Uint8Array(19);
        for (let k = 0; k < ncode; k++) lc[ORDRE[k]] = bits(3);
        const hc = huffman(lc, 19);
        const longueurs = new Uint8Array(nlit + ndist);
        for (let k = 0; k < nlit + ndist; ) {
          const s = decoder(hc);
          if (s < 16) {
            longueurs[k++] = s;
            continue;
          }
          let rep: number;
          let val = 0;
          if (s === 16) {
            if (!k) throw FIN;
            val = longueurs[k - 1];
            rep = 3 + bits(2);
          } else rep = s === 17 ? 3 + bits(3) : 11 + bits(7);
          if (k + rep > nlit + ndist) throw FIN;
          while (rep--) longueurs[k++] = val;
        }
        lit = huffman(longueurs.subarray(0, nlit), nlit);
        dist = huffman(longueurs.subarray(nlit), ndist);
      }
      for (;;) {
        let s = decoder(lit);
        if (s < 256) {
          place(1);
          sortie[n++] = s;
          continue;
        }
        if (s === 256) break;
        s -= 257;
        if (s >= 29) throw FIN;
        const len = LBASE[s] + bits(LEXT[s]);
        const ds = decoder(dist);
        if (ds >= 30) throw FIN;
        const ecart = DBASE[ds] + bits(DEXT[ds]);
        if (ecart > n) throw FIN;
        place(len);
        for (let k = 0; k < len; k++, n++) sortie[n] = sortie[n - ecart];
      }
    }
    fini = true;
  } catch {
    /* données tronquées ou abîmées : on garde ce qui a été lu */
  }
  return { donnees: sortie.slice(0, n), fini };
}

function lzw(d: Uint8Array, avance: number): Uint8Array {
  const out: number[] = [];
  let table: number[][] = [];
  const vider = () => {
    table = Array.from({ length: 258 }, (_, i) => (i < 256 ? [i] : []));
  };
  vider();
  let largeur = 9;
  let prec: number[] | null = null;
  let pos = 0;
  let tampon = 0;
  let nb = 0;
  for (;;) {
    while (nb < largeur) {
      if (pos >= d.length) return Uint8Array.from(out);
      tampon = ((tampon << 8) | d[pos++]) & 0xffffff;
      nb += 8;
    }
    const code = (tampon >>> (nb - largeur)) & ((1 << largeur) - 1);
    nb -= largeur;
    if (code === 256) {
      vider();
      largeur = 9;
      prec = null;
      continue;
    }
    if (code === 257) break;
    let entree: number[];
    if (code < table.length) entree = table[code];
    else if (prec) entree = [...prec, prec[0]];
    else break;
    for (const x of entree) out.push(x);
    if (prec && table.length < 4096) table.push([...prec, entree[0]]);
    prec = entree;
    const t = table.length + avance;
    largeur = t >= 2048 ? 12 : t >= 1024 ? 11 : t >= 512 ? 10 : 9;
  }
  return Uint8Array.from(out);
}

function asciiHex(d: Uint8Array): Uint8Array {
  const out: number[] = [];
  let demi = -1;
  for (const c of d) {
    if (c === 0x3e) break;
    const v = hexa(c);
    if (v < 0) continue;
    if (demi < 0) demi = v;
    else {
      out.push(demi * 16 + v);
      demi = -1;
    }
  }
  if (demi >= 0) out.push(demi * 16);
  return Uint8Array.from(out);
}

function ascii85(d: Uint8Array): Uint8Array {
  const out: number[] = [];
  let groupe: number[] = [];
  const ecrire = (g: number[], k: number) => {
    let v = 0;
    for (const x of g) v = v * 85 + x;
    out.push(...[(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255].slice(0, k));
  };
  for (let i = d[0] === 0x3c && d[1] === 0x7e ? 2 : 0; i < d.length; i++) {
    const c = d[i];
    if (c === 0x7e) break;
    if (c === 0x7a && !groupe.length) out.push(0, 0, 0, 0);
    else if (c >= 0x21 && c <= 0x75) {
      groupe.push(c - 33);
      if (groupe.length === 5) {
        ecrire(groupe, 4);
        groupe = [];
      }
    }
  }
  if (groupe.length > 1) {
    const k = groupe.length - 1;
    while (groupe.length < 5) groupe.push(84);
    ecrire(groupe, k);
  }
  return Uint8Array.from(out);
}

function runLength(d: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < d.length; ) {
    const l = d[i++];
    if (l === 128) break;
    if (l < 128) for (let k = 0; k <= l && i < d.length; k++) out.push(d[i++]);
    else {
      const b = d[i++];
      for (let k = 0; k < 257 - l; k++) out.push(b);
    }
  }
  return Uint8Array.from(out);
}

/** Prédicteurs PNG et TIFF (surtout utilisés par les index compressés). */
function predicteur(d: Uint8Array, pred: number, couleurs: number, bpc: number, colonnes: number): Uint8Array {
  if (pred < 2) return d;
  const bpp = Math.max(1, Math.ceil((couleurs * bpc) / 8));
  const ligne = Math.ceil((colonnes * couleurs * bpc) / 8);
  if (!ligne) return d;
  if (pred === 2) {
    if (bpc !== 8) return d;
    const out = Uint8Array.from(d);
    for (let r = 0; r < out.length; r += ligne) for (let i = r + bpp; i < Math.min(r + ligne, out.length); i++) out[i] = (out[i] + out[i - bpp]) & 255;
    return out;
  }
  const lignes = Math.ceil(d.length / (ligne + 1));
  const out = new Uint8Array(lignes * ligne);
  let prec = new Uint8Array(ligne);
  for (let r = 0; r < lignes; r++) {
    const filtre = d[r * (ligne + 1)];
    const src = d.subarray(r * (ligne + 1) + 1, (r + 1) * (ligne + 1));
    const cur = out.subarray(r * ligne, (r + 1) * ligne);
    for (let i = 0; i < ligne; i++) {
      const x = i < src.length ? src[i] : 0;
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prec[i];
      const c = i >= bpp ? prec[i - bpp] : 0;
      let v = x;
      if (filtre === 1) v = x + a;
      else if (filtre === 2) v = x + b;
      else if (filtre === 3) v = x + ((a + b) >> 1);
      else if (filtre === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
    prec = cur;
  }
  return out;
}

/* ---------- chiffrement (PDF protégé sans mot de passe d'ouverture) ---------- */

function md5(d: Uint8Array): Uint8Array {
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
  const total = (((d.length + 8) >> 6) + 1) * 64;
  const m = new Uint8Array(total);
  m.set(d);
  m[d.length] = 0x80;
  const v = new DataView(m.buffer);
  v.setUint32(total - 8, (d.length * 8) >>> 0, true);
  v.setUint32(total - 4, Math.floor(d.length / 0x20000000), true);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89 | 0;
  let h2 = 0x98badcfe | 0;
  let h3 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    let a = h0;
    let b = h1;
    let c = h2;
    let e = h3;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & e);
        g = i;
      } else if (i < 32) {
        f = (e & b) | (~e & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ e;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~e);
        g = (7 * i) % 16;
      }
      const x = (a + f + K[i] + v.getInt32(off + g * 4, true)) | 0;
      const s = S[(i >> 4) * 4 + (i % 4)];
      a = e;
      e = c;
      c = b;
      b = (b + ((x << s) | (x >>> (32 - s)))) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + e) | 0;
  }
  const out = new Uint8Array(16);
  const w = new DataView(out.buffer);
  [h0, h1, h2, h3].forEach((x, k) => w.setInt32(k * 4, x, true));
  return out;
}

function rc4(cle: Uint8Array, d: Uint8Array): Uint8Array {
  const s = Uint8Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + cle[i % cle.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = new Uint8Array(d.length);
  for (let k = 0, i = 0, j = 0; k < d.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = d[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

function subtil() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new PdfIllisible("Ce PDF est protégé : ouvrez cette page depuis l'adresse sécurisée de l'appli (https) pour le lire.");
  return s;
}

async function aesDechiffrer(cle: Uint8Array, d: Uint8Array): Promise<Uint8Array> {
  if (d.length < 32 || d.length % 16) return new Uint8Array(0);
  const k = await subtil().importKey("raw", cle, "AES-CBC", false, ["decrypt"]);
  try {
    return new Uint8Array(await subtil().decrypt({ name: "AES-CBC", iv: d.subarray(0, 16) }, k, d.subarray(16)));
  } catch {
    return new Uint8Array(0);
  }
}

/** AES-CBC sans bourrage : on ajoute un bloc qui se déchiffre en bourrage valide. */
async function aesBrut(cle: Uint8Array, iv: Uint8Array, d: Uint8Array): Promise<Uint8Array> {
  const k = await subtil().importKey("raw", cle, "AES-CBC", false, ["encrypt", "decrypt"]);
  const extra = new Uint8Array(await subtil().encrypt({ name: "AES-CBC", iv: d.subarray(d.length - 16) }, k, new Uint8Array(16).fill(16))).subarray(0, 16);
  return new Uint8Array(await subtil().decrypt({ name: "AES-CBC", iv }, k, concat(d, extra)));
}

const sha = async (algo: string, d: Uint8Array) => new Uint8Array(await subtil().digest(algo, d));

/** Empreinte des PDF protégés en AES-256 (révision 6). */
async function empreinte2B(mdp: Uint8Array, sel: Uint8Array): Promise<Uint8Array> {
  let k = await sha("SHA-256", concat(mdp, sel));
  for (let i = 0; ; i++) {
    const k1 = concat(mdp, k);
    const bloc = new Uint8Array(k1.length * 64);
    for (let r = 0; r < 64; r++) bloc.set(k1, r * k1.length);
    const cle = await subtil().importKey("raw", k.subarray(0, 16), "AES-CBC", false, ["encrypt"]);
    const e = new Uint8Array(await subtil().encrypt({ name: "AES-CBC", iv: k.subarray(16, 32) }, cle, bloc)).subarray(0, bloc.length);
    let somme = 0;
    for (let b = 0; b < 16; b++) somme += e[b];
    k = await sha(["SHA-256", "SHA-384", "SHA-512"][somme % 3], e);
    if (i >= 63 && e[e.length - 1] <= i - 31) break;
  }
  return k.subarray(0, 32);
}

const BOURRAGE = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

interface Chiffre {
  cle: Uint8Array;
  aes: boolean;
  aes256: boolean;
}

async function dechiffrer(c: Chiffre, f: Flux): Promise<Uint8Array> {
  if (c.aes256) return aesDechiffrer(c.cle, f.brut);
  const objet = Uint8Array.from([f.n & 255, (f.n >> 8) & 255, (f.n >> 16) & 255, f.g & 255, (f.g >> 8) & 255]);
  const cle = md5(concat(c.cle, objet, c.aes ? Uint8Array.from([0x73, 0x41, 0x6c, 0x54]) : new Uint8Array(0))).subarray(0, Math.min(c.cle.length + 5, 16));
  return c.aes ? aesDechiffrer(cle, f.brut) : rc4(cle, f.brut);
}

/* ---------- objets PDF ---------- */

class Nom {
  constructor(readonly v: string) {}
}
class Ref {
  constructor(readonly n: number) {}
}
class Mot {
  constructor(readonly v: string) {}
}
class Flux {
  constructor(
    readonly dict: Dict,
    public brut: Uint8Array,
    readonly n: number,
    readonly g: number,
  ) {}
}
type Dict = Map<string, Val>;
type Val = null | boolean | number | Uint8Array | Nom | Ref | Mot | Flux | Dict | Val[];

const BLANC = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) BLANC[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of "()<>[]{}/%") DELIM[c.charCodeAt(0)] = 1;
const FIN_TABLEAU = new Mot("]");
const FIN_DICT = new Mot(">>");

/** Lecture des valeurs PDF (objets, contenus de page, tables de caractères). */
class Lecteur {
  constructor(
    readonly o: Uint8Array,
    public i = 0,
    readonly refs = true,
  ) {}

  blancs() {
    const o = this.o;
    while (this.i < o.length) {
      const c = o[this.i];
      if (BLANC[c]) this.i++;
      else if (c === 0x25) while (this.i < o.length && o[this.i] !== 10 && o[this.i] !== 13) this.i++;
      else break;
    }
  }

  valeur(prof = 0): Val | undefined {
    const o = this.o;
    for (;;) {
      this.blancs();
      if (this.i >= o.length) return undefined;
      const c = o[this.i];
      if (c === 0x2f) return this.nom();
      if (c === 0x28) return this.chaine();
      if (c === 0x3c) {
        if (o[this.i + 1] !== 0x3c) return this.hexa();
        this.i += 2;
        return this.dict(prof);
      }
      if (c === 0x3e) {
        this.i += o[this.i + 1] === 0x3e ? 2 : 1;
        return FIN_DICT;
      }
      if (c === 0x5b) {
        this.i++;
        return this.tableau(prof);
      }
      if (c === 0x5d) {
        this.i++;
        return FIN_TABLEAU;
      }
      if ((c >= 0x30 && c <= 0x39) || c === 0x2b || c === 0x2d || c === 0x2e) return this.nombre();
      const debut = this.i;
      while (this.i < o.length && !BLANC[o[this.i]] && !DELIM[o[this.i]]) this.i++;
      if (this.i === debut) {
        this.i++; // { } ) isolés
        continue;
      }
      const m = latin1(o, debut, this.i);
      return m === "true" ? true : m === "false" ? false : m === "null" ? null : new Mot(m);
    }
  }

  private nombre(): number | Ref {
    const o = this.o;
    const debut = this.i++;
    while (this.i < o.length && ((o[this.i] >= 0x30 && o[this.i] <= 0x39) || o[this.i] === 0x2e)) this.i++;
    const s = latin1(o, debut, this.i);
    const v = Number(s);
    if (this.refs && /^\d+$/.test(s)) {
      const m = /^[\0\t\n\f\r ]+\d+[\0\t\n\f\r ]+R(?![^\0\t\n\f\r ()<>[\]{}/%])/.exec(latin1(o, this.i, Math.min(o.length, this.i + 24)));
      if (m) {
        this.i += m[0].length;
        return new Ref(v);
      }
    }
    return Number.isFinite(v) ? v : 0;
  }

  private nom(): Nom {
    const o = this.o;
    const debut = ++this.i;
    while (this.i < o.length && !BLANC[o[this.i]] && !DELIM[o[this.i]]) this.i++;
    const s = latin1(o, debut, this.i);
    return new Nom(s.indexOf("#") < 0 ? s : s.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))));
  }

  private chaine(): Uint8Array {
    const o = this.o;
    const out: number[] = [];
    let prof = 1;
    this.i++;
    while (this.i < o.length) {
      const c = o[this.i++];
      if (c === 0x5c) {
        const d = o[this.i++];
        if (d === 0x6e) out.push(10);
        else if (d === 0x72) out.push(13);
        else if (d === 0x74) out.push(9);
        else if (d === 0x62) out.push(8);
        else if (d === 0x66) out.push(12);
        else if (d === 0x0d) {
          if (o[this.i] === 0x0a) this.i++;
        } else if (d === 0x0a) continue;
        else if (d >= 0x30 && d <= 0x37) {
          let v = d - 0x30;
          for (let k = 0; k < 2 && o[this.i] >= 0x30 && o[this.i] <= 0x37; k++) v = v * 8 + (o[this.i++] - 0x30);
          out.push(v & 255);
        } else if (d !== undefined) out.push(d);
      } else if (c === 0x28) {
        prof++;
        out.push(c);
      } else if (c === 0x29) {
        if (--prof === 0) break;
        out.push(c);
      } else out.push(c);
    }
    return Uint8Array.from(out);
  }

  private hexa(): Uint8Array {
    const o = this.o;
    const out: number[] = [];
    let demi = -1;
    this.i++;
    while (this.i < o.length) {
      const c = o[this.i++];
      if (c === 0x3e) break;
      const v = hexa(c);
      if (v < 0) continue;
      if (demi < 0) demi = v;
      else {
        out.push(demi * 16 + v);
        demi = -1;
      }
    }
    if (demi >= 0) out.push(demi * 16);
    return Uint8Array.from(out);
  }

  private tableau(prof: number): Val[] {
    const t: Val[] = [];
    if (prof > 40) return t;
    for (;;) {
      const v = this.valeur(prof + 1);
      if (v === undefined || v === FIN_TABLEAU) return t;
      if (v !== FIN_DICT) t.push(v);
    }
  }

  private dict(prof: number): Dict {
    const d: Dict = new Map();
    if (prof > 40) return d;
    for (;;) {
      const k = this.valeur(prof + 1);
      if (k === undefined || k === FIN_DICT) return d;
      if (!(k instanceof Nom)) continue;
      const v = this.valeur(prof + 1);
      if (v === undefined || v === FIN_DICT) return d;
      if (v !== FIN_TABLEAU) d.set(k.v, v);
    }
  }

  /** Image incluse dans un contenu de page (BI … ID données EI) : sautée. */
  sauterImage() {
    for (let v = this.valeur(); v !== undefined; v = this.valeur()) if (v instanceof Mot && v.v === "ID") break;
    const o = this.o;
    for (let k = this.i + 1; k + 1 < o.length; k++)
      if (o[k] === 0x45 && o[k + 1] === 0x49 && BLANC[o[k - 1]] && (k + 2 >= o.length || BLANC[o[k + 2]])) {
        this.i = k + 2;
        return;
      }
    this.i = o.length;
  }
}

/* ---------- caractères ---------- */

const GLYPHES = new Map<string, string>(
  Object.entries({
    space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%", ampersand: "&", quotesingle: "'", quoteright: "’",
    parenleft: "(", parenright: ")", asterisk: "*", plus: "+", comma: ",", hyphen: "-", minus: "-", period: ".", slash: "/",
    zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">", question: "?", at: "@", bracketleft: "[", backslash: "\\",
    bracketright: "]", asciicircum: "^", underscore: "_", grave: "`", quoteleft: "‘", braceleft: "{", bar: "|", braceright: "}",
    asciitilde: "~", exclamdown: "¡", cent: "¢", sterling: "£", currency: "¤", yen: "¥", brokenbar: "¦", section: "§",
    dieresis: "¨", copyright: "©", ordfeminine: "ª", guillemotleft: "«", guillemetleft: "«", logicalnot: "¬", registered: "®",
    macron: "¯", degree: "°", plusminus: "±", twosuperior: "²", threesuperior: "³", acute: "´", mu: "µ", paragraph: "¶",
    periodcentered: "·", middot: "·", cedilla: "¸", onesuperior: "¹", ordmasculine: "º", guillemotright: "»", guillemetright: "»",
    onequarter: "¼", onehalf: "½", threequarters: "¾", questiondown: "¿", multiply: "×", divide: "÷", germandbls: "ß",
    AE: "Æ", ae: "æ", OE: "Œ", oe: "œ", Oslash: "Ø", oslash: "ø", Eth: "Ð", eth: "ð", Thorn: "Þ", thorn: "þ", dotlessi: "ı",
    Lslash: "Ł", lslash: "ł", endash: "–", emdash: "—", quotedblleft: "“", quotedblright: "”", quotesinglbase: "‚",
    quotedblbase: "„", guilsinglleft: "‹", guilsinglright: "›", bullet: "•", ellipsis: "…", Euro: "€", euro: "€",
    dagger: "†", daggerdbl: "‡", perthousand: "‰", trademark: "™", fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl",
    florin: "ƒ", circumflex: "ˆ", tilde: "˜", ring: "˚", caron: "ˇ", breve: "˘", dotaccent: "˙", hungarumlaut: "˝",
    ogonek: "˛", fraction: "/", nbspace: " ", nonbreakingspace: " ", sfthyphen: "-", softhyphen: "-", numero: "№",
  }),
);
const ACCENTS: Record<string, string> = {
  acute: "́", grave: "̀", circumflex: "̂", dieresis: "̈", tilde: "̃", cedilla: "̧", ring: "̊",
  caron: "̌", macron: "̄", breve: "̆", ogonek: "̨", dotaccent: "̇", hungarumlaut: "̋", commaaccent: "̦",
};

/** Texte d'un nom de glyphe (« eacute » → « é », « uni00E9 » → « é »). */
function texteDeGlyphe(nom: string): string | undefined {
  const direct = GLYPHES.get(nom);
  if (direct !== undefined) return direct;
  if (/^[A-Za-z]$/.test(nom)) return nom;
  let m = /^uni((?:[0-9A-Fa-f]{4})+)$/.exec(nom);
  if (m) return (m[1].match(/.{4}/g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16))).join("");
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(nom);
  if (m) return parseInt(m[1], 16) <= 0x10ffff ? String.fromCodePoint(parseInt(m[1], 16)) : undefined;
  m = /^([A-Za-z]|dotlessi)(acute|grave|circumflex|dieresis|tilde|cedilla|ring|caron|macron|breve|ogonek|dotaccent|hungarumlaut|commaaccent)$/.exec(nom);
  if (m) return ((m[1] === "dotlessi" ? "i" : m[1]) + ACCENTS[m[2]]).normalize("NFC");
  const point = nom.indexOf(".");
  if (point > 0) return texteDeGlyphe(nom.slice(0, point));
  if (nom.includes("_")) {
    const p = nom.split("_").map(texteDeGlyphe);
    return p.every((x) => x !== undefined) ? p.join("") : undefined;
  }
  return undefined;
}

const OCTETS = Uint8Array.from({ length: 256 }, (_, i) => i);
const LATIN1 = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i));
const WIN = Array.from(new TextDecoder("windows-1252").decode(OCTETS));
WIN[0xa0] = " ";
WIN[0xad] = "-";
const MAC = (() => {
  try {
    return Array.from(new TextDecoder("macintosh").decode(OCTETS));
  } catch {
    return LATIN1;
  }
})();
const STANDARD = LATIN1.map((c, i) => (i < 0x20 || i > 0x7e ? "" : i === 0x27 ? "’" : i === 0x60 ? "‘" : c));
(
  "a1 exclamdown a2 cent a3 sterling a4 fraction a5 yen a6 florin a7 section a8 currency a9 quotesingle aa quotedblleft ab guillemotleft " +
  "ac guilsinglleft ad guilsinglright ae fi af fl b1 endash b2 dagger b3 daggerdbl b4 periodcentered b6 paragraph b7 bullet b8 quotesinglbase " +
  "b9 quotedblbase ba quotedblright bb guillemotright bc ellipsis bd perthousand bf questiondown c1 grave c2 acute c3 circumflex c4 tilde " +
  "c5 macron c6 breve c7 dotaccent c8 dieresis ca ring cb cedilla cd hungarumlaut ce ogonek cf caron d0 emdash e1 AE e3 ordfeminine " +
  "e8 Lslash e9 Oslash ea OE eb ordmasculine f1 ae f5 dotlessi f8 lslash f9 oslash fa oe fb germandbls"
)
  .split(" ")
  .forEach((x, k, t) => {
    if (k % 2 === 0) STANDARD[parseInt(x, 16)] = texteDeGlyphe(t[k + 1]) ?? "";
  });

/* Largeurs des polices standard non incluses dans le PDF (caractères 32 à 126, en millièmes). */
const nombres = (s: string) => s.split(",").map(Number);
const HELVETICA = nombres(
  "278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584",
);
const TIMES = nombres(
  "250,333,408,500,500,833,778,180,333,333,500,564,250,333,250,278,500,500,500,500,500,500,500,500,500,500,278,278,564,564,564,444,921,722,667,667,722,611,556,722,722,333,389,722,611,889,722,722,556,722,667,556,611,722,722,944,722,722,611,333,278,333,469,500,333,444,500,444,500,444,333,500,500,278,278,500,278,778,500,500,500,500,333,389,278,500,500,722,500,500,444,480,200,480,541",
);

function largeurStandard(police: string): (ch: string) => number {
  if (/courier|mono|consol|console/i.test(police)) return () => 600;
  const table = /times|roman|serif|georgia|garamond/i.test(police) && !/sans/i.test(police) ? TIMES : HELVETICA;
  return (ch) => {
    const c = ch.normalize("NFD").charCodeAt(0);
    return c >= 32 && c <= 126 ? table[c - 32] : 556;
  };
}

/* ---------- tables de correspondance (CMap) ---------- */

interface CMap {
  espaces: [number, number, number][]; // longueur en octets, début, fin
  uni: Map<number, string>;
  plagesUni: [number, number, Uint8Array | string[]][];
  cid: Map<number, number>;
  plagesCid: [number, number, number][];
}

function utf16(b: Uint8Array) {
  if (b.length === 1) return String.fromCharCode(b[0]);
  let s = "";
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  return s;
}

function lireCMap(d: Uint8Array): CMap {
  const c: CMap = { espaces: [], uni: new Map(), plagesUni: [], cid: new Map(), plagesCid: [] };
  const L = new Lecteur(d, 0, false);
  let pile: Val[] = [];
  for (let v = L.valeur(); v !== undefined; v = L.valeur()) {
    if (!(v instanceof Mot)) {
      pile.push(v);
      continue;
    }
    const o = (k: number) => {
      const x = pile[k];
      return x instanceof Uint8Array ? x : null;
    };
    if (v.v === "endcodespacerange")
      for (let k = 0; k + 1 < pile.length; k += 2) {
        const a = o(k);
        const b = o(k + 1);
        if (a && b && a.length) c.espaces.push([a.length, entier(a), entier(b)]);
      }
    else if (v.v === "endbfchar")
      for (let k = 0; k + 1 < pile.length; k += 2) {
        const a = o(k);
        const b = pile[k + 1];
        if (a) c.uni.set(entier(a), b instanceof Uint8Array ? utf16(b) : b instanceof Nom ? texteDeGlyphe(b.v) ?? "" : "");
      }
    else if (v.v === "endbfrange")
      for (let k = 0; k + 2 < pile.length; k += 3) {
        const a = o(k);
        const b = o(k + 1);
        const x = pile[k + 2];
        if (!a || !b) continue;
        if (x instanceof Uint8Array) c.plagesUni.push([entier(a), entier(b), x]);
        else if (Array.isArray(x)) c.plagesUni.push([entier(a), entier(b), x.map((y) => (y instanceof Uint8Array ? utf16(y) : ""))]);
      }
    else if (v.v === "endcidchar")
      for (let k = 0; k + 1 < pile.length; k += 2) {
        const a = o(k);
        const b = pile[k + 1];
        if (a && typeof b === "number") c.cid.set(entier(a), b);
      }
    else if (v.v === "endcidrange")
      for (let k = 0; k + 2 < pile.length; k += 3) {
        const a = o(k);
        const b = o(k + 1);
        const x = pile[k + 2];
        if (a && b && typeof x === "number") c.plagesCid.push([entier(a), entier(b), x]);
      }
    pile = [];
  }
  return c;
}

function texteCMap(c: CMap | null, code: number): string | undefined {
  if (!c) return undefined;
  const s = c.uni.get(code);
  if (s !== undefined) return s;
  for (const [a, b, x] of c.plagesUni) {
    if (code < a || code > b) continue;
    if (Array.isArray(x)) return x[code - a] ?? "";
    const debut = utf16(x);
    return debut ? debut.slice(0, -1) + String.fromCharCode(debut.charCodeAt(debut.length - 1) + (code - a)) : "";
  }
  return undefined;
}

function cidCMap(c: CMap, code: number): number | undefined {
  const v = c.cid.get(code);
  if (v !== undefined) return v;
  for (const [a, b, x] of c.plagesCid) if (code >= a && code <= b) return x + code - a;
  return undefined;
}

interface Code {
  code: number;
  /** Code sur un seul octet : l'espacement des mots (Tw) ne s'applique qu'à lui. */
  un: boolean;
}

function decouper(s: Uint8Array, espaces: [number, number, number][]): Code[] {
  const res: Code[] = [];
  const court = Math.min(...espaces.map((e) => e[0]));
  for (let i = 0; i < s.length; ) {
    let l = 0;
    for (let n = 1; n <= 4 && !l && i + n <= s.length; n++) {
      const v = entier(s.subarray(i, i + n));
      if (espaces.some(([m, a, b]) => m === n && v >= a && v <= b)) l = n;
    }
    if (!l) l = Math.min(court, s.length - i);
    res.push({ code: entier(s.subarray(i, i + l)), un: l === 1 });
    i += l;
  }
  return res;
}

/* ---------- polices TrueType incluses (quand le PDF ne donne pas le texte des caractères) ---------- */

interface TrueType {
  unicode: Map<number, number> | null;
  symbole: Map<number, number> | null;
  mac: Map<number, number> | null;
}

function sousTable(v: DataView, p: number): Map<number, number> | null {
  const format = v.getUint16(p);
  const m = new Map<number, number>();
  if (format === 0) for (let c = 0; c < 256; c++) m.set(c, v.getUint8(p + 6 + c));
  else if (format === 4) {
    const seg2 = v.getUint16(p + 6);
    const fins = p + 14;
    const debuts = fins + seg2 + 2;
    const deltas = debuts + seg2;
    const offs = deltas + seg2;
    for (let s = 0; s < seg2 / 2; s++) {
      const fin = v.getUint16(fins + s * 2);
      const debut = v.getUint16(debuts + s * 2);
      const delta = v.getInt16(deltas + s * 2);
      const ro = v.getUint16(offs + s * 2);
      for (let c = debut; c <= fin && c < 0xffff; c++) {
        let g = (c + delta) & 0xffff;
        if (ro) {
          const a = offs + s * 2 + ro + (c - debut) * 2;
          if (a + 2 > v.byteLength) continue;
          g = v.getUint16(a);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) m.set(c, g);
      }
    }
  } else if (format === 6) {
    const premier = v.getUint16(p + 6);
    const n = v.getUint16(p + 8);
    for (let k = 0; k < n; k++) m.set(premier + k, v.getUint16(p + 10 + k * 2));
  } else if (format === 12) {
    const n = v.getUint32(p + 12);
    for (let k = 0; k < n; k++) {
      const q = p + 16 + k * 12;
      const a = v.getUint32(q);
      const b = v.getUint32(q + 4);
      const g = v.getUint32(q + 8);
      for (let c = a; c <= b && c - a < 0x10000; c++) m.set(c, g + c - a);
    }
  } else return null;
  return m;
}

function lireTrueType(o: Uint8Array): TrueType | null {
  try {
    const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
    const base = latin1(o, 0, 4) === "ttcf" ? v.getUint32(12) : 0;
    const n = v.getUint16(base + 4);
    let cmap = -1;
    for (let k = 0; k < n; k++) {
      const p = base + 12 + k * 16;
      if (latin1(o, p, p + 4) === "cmap") cmap = v.getUint32(p + 8);
    }
    if (cmap < 0) return null;
    const res: TrueType = { unicode: null, symbole: null, mac: null };
    const nt = v.getUint16(cmap + 2);
    for (let k = 0; k < nt; k++) {
      const pid = v.getUint16(cmap + 4 + k * 8);
      const eid = v.getUint16(cmap + 6 + k * 8);
      let t: Map<number, number> | null = null;
      try {
        t = sousTable(v, cmap + v.getUint32(cmap + 8 + k * 8));
      } catch {
        /* table abîmée */
      }
      if (!t) continue;
      if (pid === 0 || (pid === 3 && (eid === 1 || eid === 10))) res.unicode = res.unicode ?? t;
      else if (pid === 3 && eid === 0) res.symbole = t;
      else if (pid === 1 && eid === 0) res.mac = t;
    }
    return res;
  } catch {
    return null;
  }
}

/* ---------- polices ---------- */

interface Police {
  codes(s: Uint8Array): Code[];
  texte(code: number): string;
  /** Avance du caractère, pour une taille de police de 1. */
  largeur(code: number): number;
  /** Hauteur des caractères par rapport à la taille de police (polices Type 3 seulement). */
  hauteur?: number;
}

const UN_OCTET = (s: Uint8Array): Code[] => Array.from(s, (code) => ({ code, un: true }));
const PAR_DEFAUT: Police = { codes: UN_OCTET, texte: (c) => WIN[c] ?? "", largeur: () => 0.5 };

/* ---------- mise en page : lignes et colonnes ---------- */

interface Etat {
  ctm: number[];
  police: Police | null;
  tf: number;
  tc: number;
  tw: number;
  th: number;
  tl: number;
  ts: number;
}

interface Glyphe {
  ch: string;
  x: number;
  y: number;
  /** Largeur du caractère et taille de la police, en points. */
  w: number;
  t: number;
  /** Sens d'écriture par quart de tour (0 = horizontal) ; -1 si oblique. */
  sens: number;
}

interface Cellule {
  x: number;
  fin: number;
  texte: string;
}

interface Ligne {
  page: number;
  y: number;
  unite: number;
  cellules: Cellule[];
}

const IDENTITE = [1, 0, 0, 1, 0, 0];
const mul = (a: number[], b: number[]) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];
const tourner = (x: number, y: number, sens: number): [number, number] => (sens === 1 ? [y, -x] : sens === 2 ? [-x, -y] : sens === 3 ? [-y, x] : [x, y]);

/** Lignes d'une page : caractères regroupés par ligne, puis en cellules séparées par de grands espaces. */
function lignesDePage(glyphes: Glyphe[], page: number): Ligne[] {
  const compte = [0, 0, 0, 0];
  for (const g of glyphes) if (g.sens >= 0 && g.ch.trim()) compte[g.sens]++;
  const sens = compte.indexOf(Math.max(...compte));
  const tries = glyphes
    .filter((g) => g.sens === sens)
    .map((g) => {
      const [x, y] = tourner(g.x, g.y, sens);
      return { ...g, x, y };
    })
    .sort((a, b) => b.y - a.y);
  const groupes: Glyphe[][] = [];
  for (const g of tries) {
    const cur = groupes[groupes.length - 1];
    if (cur && cur[0].y - g.y <= 0.45 * Math.max(cur[0].t, g.t)) cur.push(g);
    else groupes.push([g]);
  }
  const lignes: Ligne[] = [];
  for (const groupe of groupes) {
    groupe.sort((a, b) => a.x - b.x);
    const largeurs = groupe
      .filter((g) => g.ch.trim() && g.w > 0)
      .map((g) => g.w / g.ch.length)
      .sort((a, b) => a - b);
    const unite = largeurs.length ? largeurs[largeurs.length >> 1] : 0.5 * groupe[0].t;
    const cellules: Cellule[] = [];
    let cur: Cellule | undefined;
    let espace = false;
    let prec: Glyphe | undefined;
    for (const g of groupe) {
      if (!g.ch.trim()) {
        espace = true;
        continue;
      }
      // Caractère imprimé deux fois, un peu décalé (gras simulé) : gardé une seule fois.
      if (prec && prec.ch === g.ch && Math.abs(prec.x - g.x) < 0.3 * Math.max(prec.w, unite)) continue;
      const ecart = cur ? g.x - cur.fin : 0;
      if (!cur || ecart > 1.5 * unite) {
        cur = { x: g.x, fin: g.x + g.w, texte: g.ch };
        cellules.push(cur);
      } else {
        cur.texte += espace || ecart > 0.2 * unite ? ` ${g.ch}` : g.ch;
        cur.fin = Math.max(cur.fin, g.x + g.w);
      }
      espace = false;
      prec = g;
    }
    if (cellules.length) lignes.push({ page, y: groupe[0].y, unite, cellules: cellules.map((c) => ({ ...c, texte: c.texte.replace(/\s+/g, " ").trim().normalize("NFC") })) });
  }
  return lignes;
}

/** En-têtes et pieds de page répétés (titre, « Page 2/5 », titres de colonnes) : gardés une seule fois, en haut.
    Une ligne avec un numéro ou un e-mail n'est retirée que si elle revient au même endroit (pied de page de l'agence). */
function sansRepetitions(lignes: Ligne[], pages: number): Ligne[] {
  if (pages < 2) return lignes;
  const texte = (l: Ligne) => {
    const t = l.cellules.map((c) => c.texte).join(" | ");
    return /^[\s|–-]*(page|p\.)?\s*\d+\s*((\/|sur|de|of)\s*\d+)?[\s|–-]*$/i.test(t)
      ? "#"
      : t.replace(/\b(page|p\.)\s*\d+(\s*(\/|sur|de|of)\s*\d+)?/gi, "page #").replace(/\b\d{1,2}[:h]\d{2}(:\d{2})?\b/g, "#h");
  };
  const coordonnees = (t: string) => /@|(?:\+\d|\b0\d)(?:[\s.-]?\d{2}){4}/.test(t);
  const pagesDe = new Map<string, Set<number>>();
  const compter = (k: string, page: number) => pagesDe.set(k, (pagesDe.get(k) ?? new Set<number>()).add(page));
  for (const l of lignes) {
    const t = texte(l);
    compter(t, l.page);
    compter(`${Math.round(l.y / 2)}@${t}`, l.page);
  }
  const souvent = (k: string) => {
    const n = pagesDe.get(k)?.size ?? 0;
    return n >= 2 && n >= pages / 2;
  };
  const vues = new Set<string>();
  return lignes.filter((l) => {
    const t = texte(l);
    if (!souvent(`${Math.round(l.y / 2)}@${t}`) && (coordonnees(t) || !souvent(t))) return true;
    if (vues.has(t)) return false;
    vues.add(t);
    return true;
  });
}

/** Colonnes du tableau : les positions où commencent souvent des cellules. */
function enTableau(lignes: Ligne[]): Tableau {
  const unites = lignes.map((l) => l.unite).sort((a, b) => a - b);
  const unite = unites[unites.length >> 1] || 5;
  const tol = 0.6 * unite;
  const departs = lignes.flatMap((l) => l.cellules.map((c) => c.x)).sort((a, b) => a - b);
  const groupes: { x: number; n: number }[] = [];
  for (const x of departs) {
    const g = groupes[groupes.length - 1];
    if (g && x - g.x <= tol) g.n++;
    else groupes.push({ x, n: 1 });
  }
  const seuil = Math.max(2, Math.ceil(0.03 * lignes.length));
  let retenus = groupes.filter((g) => g.n >= seuil);
  if (retenus.length > 30) retenus = [...retenus].sort((a, b) => b.n - a.n).slice(0, 30).sort((a, b) => a.x - b.x);
  const ancres: { x: number; n: number }[] = [];
  for (const g of retenus) {
    const p = ancres[ancres.length - 1];
    if (p && g.x - p.x < 2 * unite) {
      if (g.n > p.n) ancres[ancres.length - 1] = g;
    } else ancres.push(g);
  }
  const xs = ancres.length ? ancres.map((a) => a.x) : [departs[0] ?? 0];
  const colonne = (c: Cellule) => {
    const k = xs.findIndex((x) => Math.abs(x - c.x) <= tol);
    if (k >= 0) return k;
    // Cellule décalée (titre centré, nombre aligné à droite) : la colonne qu'elle recouvre le plus.
    let meilleure = 0;
    let record = -Infinity;
    xs.forEach((x, j) => {
      const debut = j ? x : -Infinity;
      const fin = j + 1 < xs.length ? xs[j + 1] : Infinity;
      const recouvre = Math.min(c.fin, fin) - Math.max(c.x, debut);
      if (recouvre > record) {
        record = recouvre;
        meilleure = j;
      }
    });
    return meilleure;
  };
  return lignes.map((l) => {
    const ligne = xs.map(() => "");
    for (const c of l.cellules) {
      const k = colonne(c);
      ligne[k] = ligne[k] ? `${ligne[k]} ${c.texte}` : c.texte;
    }
    return ligne;
  });
}

/* ---------- document ---------- */

interface Page {
  dict: Dict;
  ressources: Dict | null;
}

class Doc {
  objets = new Map<number, Val>();
  trailer: Dict = new Map();
  /** Caractères dessinés dont le texte n'a pas pu être retrouvé. */
  illisibles = 0;
  /** Repères pour le code d'aide (jamais le texte du document) : caractères lus, images, genres de polices. */
  signes = 0;
  images = 0;
  genres = new Set<string>();
  private decodes = new Map<Flux, Uint8Array>();
  private polices = new Map<Dict, Police>();

  constructor(readonly o: Uint8Array) {}

  r(v: Val | undefined): Val {
    let x: Val = v === undefined ? null : v;
    for (let k = 0; x instanceof Ref && k < 20; k++) x = this.objets.get(x.n) ?? null;
    return x instanceof Ref ? null : x;
  }
  d(v: Val | undefined): Dict | null {
    const x = this.r(v);
    return x instanceof Map ? x : x instanceof Flux ? x.dict : null;
  }
  a(v: Val | undefined): Val[] {
    const x = this.r(v);
    return Array.isArray(x) ? x : [];
  }
  n(v: Val | undefined, defaut: number): number {
    const x = this.r(v);
    return typeof x === "number" && Number.isFinite(x) ? x : defaut;
  }
  nom(v: Val | undefined): string | undefined {
    const x = this.r(v);
    return x instanceof Nom ? x.v : undefined;
  }

  async ouvrir() {
    this.scanner();
    const enc = this.d(this.trailer.get("Encrypt"));
    if (enc) {
      const c = await this.chiffrement(enc);
      if (c) for (const x of this.objets.values()) if (x instanceof Flux && this.nom(x.dict.get("Type")) !== "XRef") x.brut = await dechiffrer(c, x);
    }
    this.objetsCompresses();
  }

  /** Tous les objets du fichier, repérés par « n 0 obj » (plus sûr qu'une table des matières parfois fausse). */
  private scanner() {
    const o = this.o;
    const texte = latin1(o);
    const re = /(\d{1,10})[\0\t\n\f\r ]+(\d{1,5})[\0\t\n\f\r ]+obj(?![A-Za-z0-9])/g;
    for (let m = re.exec(texte); m; m = re.exec(texte)) {
      const num = Number(m[1]);
      const L = new Lecteur(o, m.index + m[0].length, true);
      const v = L.valeur();
      if (v === undefined) break;
      L.blancs();
      re.lastIndex = Math.max(re.lastIndex, L.i);
      if (!texte.startsWith("stream", L.i)) {
        this.objets.set(num, v === FIN_DICT || v === FIN_TABLEAU ? null : v);
        continue;
      }
      let debut = L.i + 6;
      if (o[debut] === 0x0d) debut++;
      if (o[debut] === 0x0a) debut++;
      const dict = v instanceof Map ? v : new Map<string, Val>();
      const l = dict.get("Length");
      let fin = -1;
      let suite = 0;
      if (typeof l === "number" && l >= 0 && debut + l <= o.length) {
        let k = debut + l;
        while (k < o.length && BLANC[o[k]]) k++;
        if (texte.startsWith("endstream", k)) {
          fin = debut + l;
          suite = k + 9;
        }
      }
      if (fin < 0) {
        const e = texte.indexOf("endstream", debut);
        fin = e < 0 ? o.length : e;
        suite = e < 0 ? o.length : e + 9;
        if (fin > debut && o[fin - 1] === 0x0a) fin--;
        if (fin > debut && o[fin - 1] === 0x0d) fin--;
      }
      this.objets.set(num, new Flux(dict, o.subarray(debut, fin), num, Number(m[2])));
      re.lastIndex = Math.max(re.lastIndex, suite);
    }
    const t = texte.lastIndexOf("trailer");
    const classique = t >= 0 ? new Lecteur(o, t + 7, true).valeur() : undefined;
    if (classique instanceof Map && classique.has("Root")) this.trailer = classique;
    else for (const x of this.objets.values()) if (x instanceof Flux && this.nom(x.dict.get("Type")) === "XRef" && x.dict.has("Root")) this.trailer = x.dict;
  }

  /** Objets rangés dans des flux compressés (PDF 1.5 et plus). */
  private objetsCompresses() {
    for (const f of [...this.objets.values()]) {
      if (!(f instanceof Flux) || this.nom(f.dict.get("Type")) !== "ObjStm") continue;
      const d = this.donnees(f);
      const n = this.n(f.dict.get("N"), 0);
      const premier = this.n(f.dict.get("First"), 0);
      const L = new Lecteur(d, 0, false);
      const paires: number[] = [];
      for (let k = 0; k < 2 * n; k++) {
        const v = L.valeur();
        if (typeof v !== "number") break;
        paires.push(v);
      }
      for (let k = 0; k + 1 < paires.length; k += 2) {
        if (this.objets.has(paires[k])) continue;
        const v = new Lecteur(d, premier + paires[k + 1], true).valeur();
        if (v !== undefined && v !== FIN_DICT && v !== FIN_TABLEAU) this.objets.set(paires[k], v);
      }
    }
  }

  private async chiffrement(enc: Dict): Promise<Chiffre | null> {
    if (this.nom(enc.get("Filter")) !== "Standard") throw new PdfIllisible(PROTEGE);
    const octets = (v: Val | undefined) => {
      const x = this.r(v);
      return x instanceof Uint8Array ? x : new Uint8Array(0);
    };
    const v = this.n(enc.get("V"), 0);
    const r = this.n(enc.get("R"), 2);
    const o = octets(enc.get("O"));
    const u = octets(enc.get("U"));
    let aes = false;
    let longueur = this.n(enc.get("Length"), 40) / 8;
    if (v >= 4) {
      const stmf = this.nom(enc.get("StmF")) ?? "Identity";
      if (stmf === "Identity") return null;
      const cfm = this.nom(this.d(this.d(enc.get("CF"))?.get(stmf))?.get("CFM"));
      if (cfm === "None") return null;
      aes = cfm === "AESV2" || cfm === "AESV3";
      longueur = 16;
    }
    const vide = new Uint8Array(0);
    if (v >= 5 || r >= 5) {
      const ue = octets(enc.get("UE"));
      if (u.length < 48 || ue.length < 32) throw new PdfIllisible(PROTEGE);
      const verif = r >= 6 ? await empreinte2B(vide, u.subarray(32, 40)) : await sha("SHA-256", u.subarray(32, 40));
      if (!egaux(verif, u.subarray(0, 32))) throw new PdfIllisible(PROTEGE);
      const inter = r >= 6 ? await empreinte2B(vide, u.subarray(40, 48)) : await sha("SHA-256", u.subarray(40, 48));
      return { cle: await aesBrut(inter, new Uint8Array(16), ue.subarray(0, 32)), aes: true, aes256: true };
    }
    const n = r === 2 ? 5 : Math.min(16, Math.max(5, Math.floor(longueur)));
    const p = this.n(enc.get("P"), 0);
    const id = octets(this.a(this.trailer.get("ID"))[0]);
    const meta = r >= 4 && this.r(enc.get("EncryptMetadata")) === false ? Uint8Array.from([255, 255, 255, 255]) : vide;
    let h = md5(concat(BOURRAGE, o.subarray(0, 32), Uint8Array.from([p & 255, (p >> 8) & 255, (p >> 16) & 255, (p >>> 24) & 255]), id, meta));
    if (r >= 3) for (let k = 0; k < 50; k++) h = md5(h.subarray(0, n));
    const cle = h.slice(0, n);
    // Le PDF s'ouvre-t-il sans mot de passe ?
    let ok: boolean;
    if (r === 2) ok = egaux(rc4(cle, BOURRAGE), u.subarray(0, 32));
    else {
      let x = rc4(cle, md5(concat(BOURRAGE, id)));
      for (let k = 1; k <= 19; k++) x = rc4(cle.map((b) => b ^ k), x);
      ok = egaux(x, u.subarray(0, 16));
    }
    if (!ok) throw new PdfIllisible(PROTEGE);
    return { cle, aes, aes256: false };
  }

  donnees(f: Flux): Uint8Array {
    const memo = this.decodes.get(f);
    if (memo) return memo;
    let d = f.brut;
    const filtres = this.r(f.dict.get("Filter"));
    const params = this.r(f.dict.get("DecodeParms") ?? f.dict.get("DP"));
    (Array.isArray(filtres) ? filtres : [filtres]).forEach((x, k) => {
      const nom = this.nom(x);
      if (!nom) return;
      const p = this.d(Array.isArray(params) ? params[k] : params);
      const pred = (r: Uint8Array) =>
        predicteur(r, this.n(p?.get("Predictor"), 1), this.n(p?.get("Colors"), 1), this.n(p?.get("BitsPerComponent"), 8), this.n(p?.get("Columns"), 1));
      if (nom === "FlateDecode" || nom === "Fl") d = pred(inflate(d));
      else if (nom === "LZWDecode" || nom === "LZW") d = pred(lzw(d, this.n(p?.get("EarlyChange"), 1)));
      else if (nom === "ASCIIHexDecode" || nom === "AHx") d = asciiHex(d);
      else if (nom === "ASCII85Decode" || nom === "A85") d = ascii85(d);
      else if (nom === "RunLengthDecode" || nom === "RL") d = runLength(d);
      else if (nom !== "Crypt") d = new Uint8Array(0); // images : inutiles ici
    });
    this.decodes.set(f, d);
    return d;
  }

  pages(): Page[] {
    const res: Page[] = [];
    const vus = new Set<Dict>();
    const parcourir = (v: Val | undefined, herite: Dict | null, prof: number) => {
      const d = this.d(v);
      if (!d || vus.has(d) || prof > 64) return;
      vus.add(d);
      const ressources = this.d(d.get("Resources")) ?? herite;
      const enfants = this.r(d.get("Kids"));
      if (Array.isArray(enfants) && this.nom(d.get("Type")) !== "Page") for (const k of enfants) parcourir(k, ressources, prof + 1);
      else res.push({ dict: d, ressources });
    };
    let racine = this.d(this.trailer.get("Root"));
    if (!racine?.has("Pages")) racine = [...this.objets.values()].find((x): x is Dict => x instanceof Map && this.nom(x.get("Type")) === "Catalog") ?? null;
    parcourir(racine?.get("Pages"), null, 0);
    if (!res.length)
      for (const [, x] of [...this.objets].sort((a, b) => a[0] - b[0])) {
        if (!(x instanceof Map) || this.nom(x.get("Type")) !== "Page") continue;
        let p: Dict | null = x;
        let ressources: Dict | null = null;
        for (let k = 0; p && !ressources && k < 32; k++) {
          ressources = this.d(p.get("Resources"));
          p = this.d(p.get("Parent"));
        }
        res.push({ dict: x, ressources });
      }
    return res;
  }

  glyphes(p: Page): Glyphe[] {
    const sortie: Glyphe[] = [];
    const c = this.r(p.dict.get("Contents"));
    const flux = (Array.isArray(c) ? c.map((x) => this.r(x)) : [c]).filter((x): x is Flux => x instanceof Flux);
    const contenu = concat(...flux.flatMap((f) => [this.donnees(f), Uint8Array.of(10)]));
    try {
      this.interpreter(contenu, p.ressources, { ctm: IDENTITE, police: null, tf: 0, tc: 0, tw: 0, th: 1, tl: 0, ts: 0 }, sortie, 0, new Set());
    } catch {
      /* page abîmée : on garde ce qui a été lu */
    }
    return sortie;
  }

  /** Exécute un contenu de page et relève chaque caractère dessiné, avec sa position. */
  private interpreter(contenu: Uint8Array, ressources: Dict | null, depart: Etat, sortie: Glyphe[], prof: number, formes: Set<Flux>) {
    const L = new Lecteur(contenu, 0, false);
    const polices = this.d(ressources?.get("Font"));
    const xobjets = this.d(ressources?.get("XObject"));
    let g: Etat = { ...depart };
    const pile: Etat[] = [];
    let tm = IDENTITE;
    let tlm = IDENTITE;
    let ops: Val[] = [];
    const nb = (k: number) => {
      const x = ops[k];
      return typeof x === "number" ? x : 0;
    };
    const aLaLigne = () => {
      tlm = mul([1, 0, 0, 1, 0, -g.tl], tlm);
      tm = tlm;
    };
    const montrer = (s: Val | undefined) => {
      const p = g.police;
      if (!(s instanceof Uint8Array) || !p) return;
      for (const { code, un } of p.codes(s)) {
        const w0 = p.largeur(code);
        const m = mul(tm, g.ctm);
        const t = Math.abs(g.tf) * (p.hauteur ?? 1) * Math.hypot(m[2], m[3]);
        const brut = p.texte(code);
        const ch = brut.replace(/[\u0000-\u001f\u007f-\u009f�]/g, "");
        const x = g.ts * m[2] + m[4];
        const y = g.ts * m[3] + m[5];
        if (ch && t > 0 && Number.isFinite(x + y + t)) {
          const a = Math.atan2(m[1], m[0]) / (Math.PI / 2);
          const q = Math.round(a);
          sortie.push({ ch, x, y, t, w: Math.abs(w0 * g.tf * g.th) * Math.hypot(m[0], m[1]), sens: Math.abs(a - q) < 0.1 ? ((q % 4) + 4) % 4 : -1 });
          this.signes++;
        } else if (!ch && code !== 32 && !/\s/.test(brut)) this.illisibles++;
        tm = mul([1, 0, 0, 1, (w0 * g.tf + g.tc + (un && code === 32 ? g.tw : 0)) * g.th, 0], tm);
      }
    };
    for (let v = L.valeur(); v !== undefined; v = L.valeur()) {
      if (!(v instanceof Mot)) {
        if (ops.length < 32) ops.push(v);
        continue;
      }
      switch (v.v) {
        case "q":
          pile.push({ ...g });
          break;
        case "Q":
          g = pile.pop() ?? g;
          break;
        case "cm":
          g.ctm = mul([nb(0), nb(1), nb(2), nb(3), nb(4), nb(5)], g.ctm);
          break;
        case "BT":
          tm = tlm = IDENTITE;
          break;
        case "Tf": {
          const n = ops[0];
          g.police = this.police(n instanceof Nom ? polices?.get(n.v) : undefined);
          g.tf = nb(1);
          break;
        }
        case "Tc":
          g.tc = nb(0);
          break;
        case "Tw":
          g.tw = nb(0);
          break;
        case "Tz":
          g.th = ops.length ? nb(0) / 100 : 1;
          break;
        case "TL":
          g.tl = nb(0);
          break;
        case "Ts":
          g.ts = nb(0);
          break;
        case "Td":
          tlm = mul([1, 0, 0, 1, nb(0), nb(1)], tlm);
          tm = tlm;
          break;
        case "TD":
          g.tl = -nb(1);
          tlm = mul([1, 0, 0, 1, nb(0), nb(1)], tlm);
          tm = tlm;
          break;
        case "Tm":
          tlm = tm = [nb(0), nb(1), nb(2), nb(3), nb(4), nb(5)];
          break;
        case "T*":
          aLaLigne();
          break;
        case "Tj":
          montrer(ops[0]);
          break;
        case "'":
          aLaLigne();
          montrer(ops[0]);
          break;
        case '"':
          g.tw = nb(0);
          g.tc = nb(1);
          aLaLigne();
          montrer(ops[2]);
          break;
        case "TJ": {
          const t = ops[0];
          if (Array.isArray(t))
            for (const x of t) {
              if (typeof x === "number") tm = mul([1, 0, 0, 1, (-x / 1000) * g.tf * g.th, 0], tm);
              else montrer(x);
            }
          break;
        }
        case "Do": {
          const n = ops[0];
          const f = n instanceof Nom ? this.r(xobjets?.get(n.v)) : null;
          if (f instanceof Flux && this.nom(f.dict.get("Subtype")) === "Image") this.images++;
          if (f instanceof Flux && this.nom(f.dict.get("Subtype")) === "Form" && prof < 8 && !formes.has(f)) {
            const mat = this.a(f.dict.get("Matrix")).map((x) => this.n(x, 0));
            formes.add(f);
            this.interpreter(this.donnees(f), this.d(f.dict.get("Resources")) ?? ressources, { ...g, ctm: mul(mat.length === 6 ? mat : IDENTITE, g.ctm) }, sortie, prof + 1, formes);
            formes.delete(f);
          }
          break;
        }
        case "BI":
          L.sauterImage();
          this.images++;
          break;
      }
      ops = [];
    }
  }

  police(v: Val | undefined): Police {
    const d = this.d(v);
    if (!d) return PAR_DEFAUT;
    let p = this.polices.get(d);
    if (!p) {
      try {
        p = this.nom(d.get("Subtype")) === "Type0" ? this.policeComposite(d) : this.policeSimple(d);
      } catch {
        p = PAR_DEFAUT;
      }
      this.polices.set(d, p);
      try {
        if (this.genres.size < 8) this.genres.add(this.genre(d));
      } catch {
        /* sans repère pour cette police */
      }
    }
    return p;
  }

  /** Genre d'une police en abrégé (« ArialMT:TT2-W+U ») : nom de la police, type, fichier inclus, codage, table de texte. */
  private genre(d: Dict): string {
    const court = (s: string | undefined, n: number) => (s ?? "").replace(/^[A-Z]{6}\+/, "").replace(/[^A-Za-z0-9-]/g, "").slice(0, n);
    const sous = this.nom(d.get("Subtype")) ?? "";
    const desc = sous === "Type0" ? this.d(this.a(d.get("DescendantFonts"))[0]) : null;
    const fd = this.d((desc ?? d).get("FontDescriptor"));
    const f3 = this.d(fd?.get("FontFile3"));
    const fichier = fd?.has("FontFile2") ? "2" : fd?.has("FontFile") ? "1" : f3 ? `3${court(this.nom(f3.get("Subtype")), 13)}` : "";
    const enc = this.r(d.get("Encoding"));
    const codage = (enc instanceof Nom ? enc.v : enc instanceof Flux ? "CMap" : enc instanceof Map ? `${this.nom(enc.get("BaseEncoding")) ?? ""}${enc.has("Differences") ? "Dif" : ""}` : "")
      .replace("Encoding", "")
      .replace("WinAnsi", "W")
      .replace("MacRoman", "M")
      .replace("Standard", "S")
      .replace("Identity-", "I");
    const type = ({ Type1: "T1", TrueType: "TT", Type3: "T3", Type0: "T0" } as Record<string, string>)[sous] ?? court(sous, 6);
    return `${court(this.nom(d.get("BaseFont")), 20)}:${type}${desc ? court(this.nom(desc.get("Subtype")), 13).replace("CIDFontType", "C") : ""}${fichier}${codage ? `-${codage}` : ""}${d.has("ToUnicode") ? "+U" : ""}`;
  }

  /** Logiciel qui a fabriqué le PDF (« Producer »), en abrégé. */
  private logiciel(): string {
    if (this.trailer.has("Encrypt")) return "chiffré";
    const v = this.r(this.d(this.trailer.get("Info"))?.get("Producer"));
    if (!(v instanceof Uint8Array)) return "";
    const s = v[0] === 0xfe && v[1] === 0xff ? utf16(v.subarray(2)) : latin1(v);
    const net = s.replace(/[^\p{L}\p{N} .-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 24);
    return /\d{5}/.test(net) ? "" : net;
  }

  /** Code d'aide : la forme du PDF, sans rien de son texte (ni nom, ni coordonnée). */
  reperes(pages: number, lignes: number): string {
    const version = /%PDF-(\d\.\d)/.exec(latin1(this.o, 0, Math.min(this.o.length, 1024)))?.[1] ?? "?";
    const l = this.logiciel();
    return [`PDF ${version}`, `${pages} p.`, `${lignes} l.`, `${this.signes} s.`, this.illisibles ? `${this.illisibles} ill.` : "", this.images ? `${this.images} im.` : "", ...this.genres, l ? `« ${l} »` : ""].filter(Boolean).join(" ");
  }

  private versUnicode(d: Dict): CMap | null {
    const tu = this.r(d.get("ToUnicode"));
    return tu instanceof Flux ? lireCMap(this.donnees(tu)) : null;
  }

  /** Police TrueType incluse : glyphe → texte, d'après sa propre table de caractères. */
  private trueType(desc: Dict | null): (TrueType & { texte: Map<number, string> }) | null {
    let ff = this.r(desc?.get("FontFile2"));
    if (!(ff instanceof Flux)) {
      const f3 = this.r(desc?.get("FontFile3"));
      if (f3 instanceof Flux && this.nom(f3.dict.get("Subtype")) === "OpenType") ff = f3;
    }
    if (!(ff instanceof Flux)) return null;
    const tt = lireTrueType(this.donnees(ff));
    if (!tt) return null;
    const texte = new Map<number, string>();
    if (tt.unicode) for (const [u, g] of tt.unicode) if (!texte.has(g) && u >= 0x20) texte.set(g, String.fromCodePoint(u));
    return { ...tt, texte };
  }

  private policeSimple(d: Dict): Police {
    const sous = this.nom(d.get("Subtype")) ?? "Type1";
    const base = (this.nom(d.get("BaseFont")) ?? "").replace(/^[A-Z]{6}\+/, "");
    const desc = this.d(d.get("FontDescriptor"));
    const enc = this.r(d.get("Encoding"));
    const encDict = enc instanceof Map ? enc : null;
    const nomEnc = enc instanceof Nom ? enc.v : this.nom(encDict?.get("BaseEncoding"));
    const table: (string | undefined)[] = new Array(256);
    const remplir = (src: string[]) => src.forEach((s, c) => (table[c] = table[c] ?? s));
    if (nomEnc === "WinAnsiEncoding") remplir(WIN);
    else if (nomEnc === "MacRomanEncoding") remplir(MAC);
    else if (nomEnc === "StandardEncoding" || nomEnc === "MacExpertEncoding") remplir(STANDARD);
    else if (sous === "TrueType") {
      // Police symbolique sans encodage : les codes passent par la table de la police.
      const drapeaux = this.n(desc?.get("Flags"), 0);
      const tt = drapeaux & 4 && !(drapeaux & 32) ? this.trueType(desc) : null;
      if (tt)
        for (let c = 0; c < 256; c++) {
          const gl = tt.symbole?.get(c) ?? tt.symbole?.get(0xf000 + c) ?? tt.mac?.get(c);
          const t = gl === undefined ? undefined : tt.texte.get(gl);
          if (t) table[c] = t;
        }
      remplir(WIN);
    } else if (sous === "Type3") remplir(LATIN1);
    else {
      this.encodageType1(desc)?.forEach((t, c) => (table[c] = t));
      remplir(STANDARD);
    }
    let code = 0;
    for (const x of this.a(encDict?.get("Differences"))) {
      const v = this.r(x);
      if (typeof v === "number") code = v;
      else if (v instanceof Nom) table[code++ & 255] = texteDeGlyphe(v.v);
    }
    const uni = this.versUnicode(d);
    const premier = this.n(d.get("FirstChar"), 0);
    const ws = this.a(d.get("Widths"));
    const manque = this.n(desc?.get("MissingWidth"), 0);
    const fm = this.a(d.get("FontMatrix"));
    const echelle = sous === "Type3" ? Math.abs(this.n(fm[0], 0.001)) : 0.001;
    const std = largeurStandard(base);
    const largeurs = Float64Array.from({ length: 256 }, (_, c) => {
      if (!ws.length) return std(table[c] || LATIN1[c]) / 1000;
      const k = c - premier;
      return (k >= 0 && k < ws.length ? this.n(ws[k], manque) : manque) * echelle;
    });
    return {
      codes: UN_OCTET,
      texte: (c) => texteCMap(uni, c) ?? table[c] ?? "",
      largeur: (c) => largeurs[c & 255],
      hauteur: sous === "Type3" ? Math.abs(this.n(fm[3], 0.001)) / 0.001 || 1 : 1,
    };
  }

  /** Codage intégré d'une police Type 1 incluse (« dup 65 /A put »). */
  private encodageType1(desc: Dict | null): Map<number, string> | null {
    const ff = this.r(desc?.get("FontFile"));
    if (!(ff instanceof Flux)) return null;
    const d = this.donnees(ff);
    const texte = latin1(d, 0, Math.min(d.length, this.n(ff.dict.get("Length1"), d.length) || d.length, 200000));
    if (/\/Encoding\s+StandardEncoding\s+def/.test(texte)) return null;
    const m = new Map<number, string>();
    for (const x of texte.matchAll(/dup\s+(\d+)\s*\/([^\s/[\]{}()<>%]+)\s+put/g)) {
      const t = texteDeGlyphe(x[2]);
      if (t !== undefined) m.set(Number(x[1]) & 255, t);
    }
    return m.size ? m : null;
  }

  private policeComposite(d: Dict): Police {
    const enc = this.r(d.get("Encoding"));
    const nomEnc = enc instanceof Nom ? enc.v : "";
    const cmap = enc instanceof Flux ? lireCMap(this.donnees(enc)) : null;
    const espaces: [number, number, number][] = cmap?.espaces.length ? cmap.espaces : [[2, 0, 0xffff]];
    const cid = (code: number) => (cmap ? cidCMap(cmap, code) ?? code : code);
    const desc = this.d(this.a(d.get("DescendantFonts"))[0]);
    const fd = this.d(desc?.get("FontDescriptor"));
    const dw = this.n(desc?.get("DW"), 1000);
    const largeurs = new Map<number, number>();
    const w = this.a(desc?.get("W"));
    for (let k = 0; k + 1 < w.length; ) {
      const premier = this.n(w[k], 0);
      const suite = this.r(w[k + 1]);
      if (Array.isArray(suite)) {
        suite.forEach((x, j) => largeurs.set(premier + j, this.n(x, dw)));
        k += 2;
      } else {
        const dernier = Math.min(this.n(suite, premier), premier + 0xffff);
        const l = this.n(w[k + 2], dw);
        for (let c = premier; c <= dernier; c++) largeurs.set(c, l);
        k += 3;
      }
    }
    const uni = this.versUnicode(d);
    const ucs = /UCS2|UTF16/i.test(nomEnc);
    const versGlyphe = this.r(desc?.get("CIDToGIDMap"));
    const gids = versGlyphe instanceof Flux ? this.donnees(versGlyphe) : null;
    const gid = (c: number) => (gids ? (2 * c + 1 < gids.length ? (gids[2 * c] << 8) | gids[2 * c + 1] : 0) : c);
    let tt: (TrueType & { texte: Map<number, string> }) | null | undefined;
    return {
      codes: (s) => decouper(s, espaces),
      texte: (code) => {
        const u = texteCMap(uni, code);
        if (u !== undefined) return u;
        if (ucs) return String.fromCharCode(code);
        if (tt === undefined) tt = this.trueType(fd);
        return tt?.texte.get(gid(cid(code))) ?? "";
      },
      largeur: (code) => (largeurs.get(cid(code)) ?? dw) / 1000,
    };
  }
}

/** Texte d'un PDF, rangé en tableau (une ligne par ligne imprimée, une case par colonne).
 *  `aide.pdf` reçoit le code d'aide du fichier (sa forme, jamais son texte), même en cas d'échec. */
export async function lirePdf(octets: Uint8Array, aide?: { pdf?: string }): Promise<Tableau> {
  const doc = new Doc(octets);
  const vu = { pages: 0, lignes: 0 };
  try {
    await doc.ouvrir();
    const pages = doc.pages();
    vu.pages = pages.length;
    if (!pages.length) throw new PdfIllisible("Ce PDF semble abîmé : aucune page n'a pu être lue. Imprimez de nouveau la liste depuis ICS.");
    const lignes = pages.flatMap((p, k) => lignesDePage(doc.glyphes(p), k));
    vu.lignes = lignes.length;
    const texte = lignes.flatMap((l) => l.cellules.map((c) => c.texte)).join("").replace(/\s/g, "");
    if (!texte.length && !doc.illisibles) throw new PdfIllisible("Ce PDF ne contient pas de texte à lire : ses pages sont des images. Il ne peut pas être importé tel quel.");
    // Police sans table de caractères : le texte sort en signes sans lettres.
    if ((texte.match(/\p{L}/gu) ?? []).length < 0.25 * texte.length || doc.illisibles > texte.length)
      throw new PdfIllisible("Le texte de ce PDF est écrit dans un codage qui ne peut pas être lu. Il ne peut pas être importé tel quel.");
    return enTableau(sansRepetitions(lignes, pages.length));
  } finally {
    try {
      if (aide) aide.pdf = doc.reperes(vu.pages, vu.lignes);
    } catch {
      /* sans code d'aide */
    }
  }
}
