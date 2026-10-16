/* Décodeur CCITT (fax groupe 3 et groupe 4), pour les images noir et blanc des PDF (filtre CCITTFaxDecode).
   Sortie : une ligne d'octets par ligne de l'image, 1 bit par pixel ; le noir vaut 0, sauf si BlackIs1. */

export interface ParamsCcitt {
  k: number;
  colonnes: number;
  lignes: number;
  alignement: boolean;
  noirVaut1: boolean;
}

// Codes des longueurs de plage (recommandation T.4) : « bits:longueur », séparés par des espaces.
const BLANCS =
  "00110101:0 000111:1 0111:2 1000:3 1011:4 1100:5 1110:6 1111:7 10011:8 10100:9 00111:10 01000:11 001000:12 000011:13 110100:14 110101:15 " +
  "101010:16 101011:17 0100111:18 0001100:19 0001000:20 0010111:21 0000011:22 0000100:23 0101000:24 0101011:25 0010011:26 0100100:27 0011000:28 " +
  "00000010:29 00000011:30 00011010:31 00011011:32 00010010:33 00010011:34 00010100:35 00010101:36 00010110:37 00010111:38 00101000:39 00101001:40 " +
  "00101010:41 00101011:42 00101100:43 00101101:44 00000100:45 00000101:46 00001010:47 00001011:48 01010010:49 01010011:50 01010100:51 01010101:52 " +
  "00100100:53 00100101:54 01011000:55 01011001:56 01011010:57 01011011:58 01001010:59 01001011:60 00110010:61 00110011:62 00110100:63 " +
  "11011:64 10010:128 010111:192 0110111:256 00110110:320 00110111:384 01100100:448 01100101:512 01101000:576 01100111:640 011001100:704 " +
  "011001101:768 011010010:832 011010011:896 011010100:960 011010101:1024 011010110:1088 011010111:1152 011011000:1216 011011001:1280 " +
  "011011010:1344 011011011:1408 010011000:1472 010011001:1536 010011010:1600 011000:1664 010011011:1728";
const NOIRS =
  "0000110111:0 010:1 11:2 10:3 011:4 0011:5 0010:6 00011:7 000101:8 000100:9 0000100:10 0000101:11 0000111:12 00000100:13 00000111:14 " +
  "000011000:15 0000010111:16 0000011000:17 0000001000:18 00001100111:19 00001101000:20 00001101100:21 00000110111:22 00000101000:23 " +
  "00000010111:24 00000011000:25 000011001010:26 000011001011:27 000011001100:28 000011001101:29 000001101000:30 000001101001:31 " +
  "000001101010:32 000001101011:33 000011010010:34 000011010011:35 000011010100:36 000011010101:37 000011010110:38 000011010111:39 " +
  "000001101100:40 000001101101:41 000011011010:42 000011011011:43 000001010100:44 000001010101:45 000001010110:46 000001010111:47 " +
  "000001100100:48 000001100101:49 000001010010:50 000001010011:51 000000100100:52 000000110111:53 000000111000:54 000000100111:55 " +
  "000000101000:56 000001011000:57 000001011001:58 000000101011:59 000000101100:60 000001011010:61 000001100110:62 000001100111:63 " +
  "0000001111:64 000011001000:128 000011001001:192 000001011011:256 000000110011:320 000000110100:384 000000110101:448 0000001101100:512 " +
  "0000001101101:576 0000001001010:640 0000001001011:704 0000001001100:768 0000001001101:832 0000001110010:896 0000001110011:960 " +
  "0000001110100:1024 0000001110101:1088 0000001110110:1152 0000001110111:1216 0000001010010:1280 0000001010011:1344 0000001010100:1408 " +
  "0000001010101:1472 0000001011010:1536 0000001011011:1600 0000001100100:1664 0000001100101:1728";
// Longues plages, communes aux deux couleurs.
const LONGS =
  "00000001000:1792 00000001100:1856 00000001101:1920 000000010010:1984 000000010011:2048 000000010100:2112 000000010101:2176 " +
  "000000010110:2240 000000010111:2304 000000011100:2368 000000011101:2432 000000011110:2496 000000011111:2560";

/** Table de décodage : clé = longueur du code × 65536 + valeur du code. */
function table(...listes: string[]): Map<number, number> {
  const t = new Map<number, number>();
  for (const l of listes)
    for (const e of l.split(" ")) {
      const [bits, n] = e.split(":");
      t.set(bits.length * 65536 + parseInt(bits, 2), Number(n));
    }
  return t;
}

let tables: { blancs: Map<number, number>; noirs: Map<number, number> } | null = null;

class Bits {
  private p = 0;
  constructor(private readonly o: Uint8Array) {}
  get fin() {
    return this.p >= this.o.length * 8;
  }
  bit(): number {
    const i = this.p >> 3;
    if (i >= this.o.length) {
      this.p++;
      return 0;
    }
    const b = (this.o[i] >> (7 - (this.p & 7))) & 1;
    this.p++;
    return b;
  }
  voir(n: number): number {
    let v = 0;
    for (let k = 0; k < n; k++) {
      const q = this.p + k;
      const i = q >> 3;
      v = (v << 1) | (i < this.o.length ? (this.o[i] >> (7 - (q & 7))) & 1 : 0);
    }
    return v;
  }
  sauter(n: number) {
    this.p += n;
  }
  aligner() {
    this.p = (this.p + 7) & ~7;
  }
  /** Fin de ligne (onze zéros ou plus, puis un 1), avec ses bits de remplissage. */
  finDeLigne(): boolean {
    if (this.voir(11) !== 0) return false;
    const debut = this.p;
    while (!this.fin && this.voir(1) === 0) this.p++;
    if (this.fin) {
      this.p = debut;
      return false;
    }
    this.p++;
    return true;
  }
}

class Illisible extends Error {}

/** Une longueur de plage (codes de complément puis code de fin). */
function plage(b: Bits, t: Map<number, number>): number {
  let total = 0;
  for (;;) {
    let code = 0;
    let n = -1;
    for (let l = 1; l <= 13; l++) {
      code = (code << 1) | b.bit();
      const v = t.get(l * 65536 + code);
      if (v !== undefined) {
        n = v;
        break;
      }
    }
    if (n < 0) throw new Illisible();
    total += n;
    if (n < 64) return total;
  }
}

/** Mode d'une ligne codée en deux dimensions. */
const PASSE = 10;
const HORIZONTAL = 11;
const FIN = 12;
function mode(b: Bits): number {
  if (b.bit()) return 0; // V0
  if (b.bit()) return b.bit() ? 1 : -1; // VR1 / VL1
  if (b.bit()) return HORIZONTAL;
  if (b.bit()) return PASSE;
  if (b.bit()) return b.bit() ? 2 : -2; // VR2 / VL2
  if (b.bit()) return b.bit() ? 3 : -3; // VR3 / VL3
  // 0000000… : extension (non prise en charge) ou fin de ligne / de bloc
  return FIN;
}

export function ccitt(o: Uint8Array, p: ParamsCcitt): Uint8Array {
  tables ??= { blancs: table(BLANCS, LONGS), noirs: table(NOIRS, LONGS) };
  const { blancs, noirs } = tables;
  const n = Math.max(1, Math.min(p.colonnes, 65536));
  const pas = (n + 7) >> 3;
  const lignes: Uint8Array[] = [];
  const b = new Bits(o);
  // Changements de couleur de la ligne de référence (blanc → noir aux indices pairs), suivis de deux bornes.
  let ref: number[] = [n, n];
  const max = p.lignes > 0 ? p.lignes : 1 << 20;

  const ecrire = (chg: number[]) => {
    const l = new Uint8Array(pas);
    // Bits à 1 = blanc (noir = 0), sauf si BlackIs1.
    let pos = 0;
    let noir = false;
    const remplir = (de: number, a: number, v: boolean) => {
      for (let x = de; x < a; x++) if (v) l[x >> 3] |= 0x80 >> (x & 7);
    };
    for (const c of chg) {
      const a = Math.min(Math.max(c, pos), n);
      remplir(pos, a, noir === p.noirVaut1);
      pos = a;
      noir = !noir;
    }
    remplir(pos, n, noir === p.noirVaut1);
    // Remplissage en fin d'octet : même couleur que le dernier pixel, sans conséquence.
    lignes.push(l);
  };

  const ligne1D = (): number[] => {
    const chg: number[] = [];
    let a0 = 0;
    let noir = false;
    while (a0 < n) {
      a0 += plage(b, noir ? noirs : blancs);
      chg.push(Math.min(a0, n));
      noir = !noir;
      if (chg.length > 2 * n + 2) throw new Illisible();
    }
    return chg;
  };

  const ligne2D = (): number[] | null => {
    const chg: number[] = [];
    let a0 = -1;
    let noir = false;
    let j = 0;
    while (a0 < n) {
      // b1 : premier changement de la ligne de référence à droite de a0, vers la couleur opposée.
      while (j < ref.length - 1 && ref[j] <= a0) j++;
      const i = (j & 1) === (noir ? 1 : 0) ? j : j + 1;
      const b1 = ref[Math.min(i, ref.length - 1)];
      const b2 = ref[Math.min(i + 1, ref.length - 1)];
      const m = mode(b);
      if (m === FIN) {
        if (chg.length || a0 > 0) throw new Illisible();
        return null;
      }
      if (m === PASSE) {
        a0 = b2;
      } else if (m === HORIZONTAL) {
        const debut = Math.max(a0, 0);
        const a1 = debut + plage(b, noir ? noirs : blancs);
        const a2 = a1 + plage(b, noir ? blancs : noirs);
        chg.push(Math.min(a1, n), Math.min(a2, n));
        a0 = a2;
      } else {
        const a1 = Math.max(b1 + m, Math.max(a0, 0));
        chg.push(Math.min(a1, n));
        a0 = a1;
        noir = !noir;
        if (a1 >= n) break;
      }
      if (chg.length > 2 * n + 2) throw new Illisible();
    }
    return chg;
  };

  try {
    while (lignes.length < max && !b.fin) {
      let deuxD = p.k < 0;
      if (p.k < 0) {
        if (p.alignement) b.aligner();
        // Fin de bloc (deux fins de ligne) : image terminée.
        if (b.voir(12) === 1) break;
      } else {
        const eol = b.finDeLigne();
        if (b.fin) break;
        // Codage 2D du groupe 3 : un bit après chaque fin de ligne dit si la ligne suit en 1D (1) ou en 2D (0).
        const marque = p.k > 0 ? b.bit() : 1;
        // Fins de ligne à la suite : fin de l'image.
        if (eol && b.finDeLigne()) break;
        if (p.alignement && !eol) b.aligner();
        deuxD = marque === 0;
      }
      const chg = deuxD ? ligne2D() : ligne1D();
      if (!chg) break;
      ecrire(chg);
      ref = [...chg, n, n];
    }
  } catch (e) {
    if (!(e instanceof Illisible)) throw e;
  }
  const sortie = new Uint8Array(pas * Math.max(lignes.length, p.lignes > 0 ? p.lignes : 0));
  if (!p.noirVaut1) sortie.fill(0xff);
  lignes.forEach((l, k) => sortie.set(l, k * pas));
  return sortie;
}
