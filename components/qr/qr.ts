/* QR code sans dépendance (octets, correction « M », versions 1 à 20), d'après la norme
   ISO/IEC 18004. Assez pour un lien court vers la page d'un bien. Module pur. */

const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
const BLOCS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];

function modulesBruts(v: number) {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const a = Math.floor(v / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (v >= 7) n -= 36;
  }
  return n;
}
const motsDonnees = (v: number) => Math.floor(modulesBruts(v) / 8) - ECC_M[v] * BLOCS_M[v];

function mul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function diviseur(degre: number) {
  const r = new Array<number>(degre).fill(0);
  r[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < degre; j++) {
      r[j] = mul(r[j], racine);
      if (j + 1 < degre) r[j] ^= r[j + 1];
    }
    racine = mul(racine, 0x02);
  }
  return r;
}

function reste(donnees: number[], div: number[]) {
  const r = new Array<number>(div.length).fill(0);
  for (const b of donnees) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => (r[i] ^= mul(c, f)));
  }
  return r;
}

const MASQUES: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Matrice du QR code (true = module noir), ou erreur si le texte est trop long. */
export function qrMatrice(texte: string): boolean[][] {
  const octets = [...new TextEncoder().encode(texte)];
  let v = 1;
  for (; v <= 20; v++) if (4 + (v < 10 ? 8 : 16) + octets.length * 8 <= motsDonnees(v) * 8) break;
  if (v > 20) throw new Error("Texte trop long pour un QR code");

  // Bits de données
  const bits: number[] = [];
  const ajout = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  ajout(4, 4);
  ajout(octets.length, v < 10 ? 8 : 16);
  octets.forEach((o) => ajout(o, 8));
  const capacite = motsDonnees(v) * 8;
  ajout(0, Math.min(4, capacite - bits.length));
  ajout(0, (8 - (bits.length % 8)) % 8);
  for (let p = 0xec; bits.length < capacite; p ^= 0xec ^ 0x11) ajout(p, 8);
  const mots: number[] = [];
  for (let i = 0; i < bits.length; i += 8) mots.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // Correction d'erreurs et entrelacement
  const nbBlocs = BLOCS_M[v];
  const lgEcc = ECC_M[v];
  const bruts = Math.floor(modulesBruts(v) / 8);
  const courts = nbBlocs - (bruts % nbBlocs);
  const lgCourt = Math.floor(bruts / nbBlocs);
  const div = diviseur(lgEcc);
  const blocs: number[][] = [];
  for (let i = 0, k = 0; i < nbBlocs; i++) {
    const d = mots.slice(k, k + lgCourt - lgEcc + (i < courts ? 0 : 1));
    k += d.length;
    const e = reste(d, div);
    if (i < courts) d.push(0);
    blocs.push(d.concat(e));
  }
  const flux: number[] = [];
  for (let i = 0; i < blocs[0].length; i++)
    blocs.forEach((b, j) => {
      if (i !== lgCourt - lgEcc || j >= courts) flux.push(b[i]);
    });

  // Motifs fixes
  const n = v * 4 + 17;
  const m: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fixe: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const poser = (x: number, y: number, noir: boolean) => {
    m[y][x] = noir;
    fixe[y][x] = true;
  };
  for (let i = 0; i < n; i++) {
    poser(6, i, i % 2 === 0);
    poser(i, 6, i % 2 === 0);
  }
  const reperes = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < n && y >= 0 && y < n) poser(x, y, d !== 2 && d !== 4);
      }
  };
  reperes(3, 3);
  reperes(n - 4, 3);
  reperes(3, n - 4);
  if (v > 1) {
    const nb = Math.floor(v / 7) + 2;
    const pas = Math.ceil((v * 4 + 4) / (nb * 2 - 2)) * 2;
    const pos = [6];
    for (let p = n - 7; pos.length < nb; p -= pas) pos.splice(1, 0, p);
    pos.forEach((a, i) =>
      pos.forEach((b, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === nb - 1) || (i === nb - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poser(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }),
    );
  }
  const format = (masque: number) => {
    const d = (0 << 3) | masque; // niveau M = 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) poser(8, i, bit(i));
    poser(8, 7, bit(6));
    poser(8, 8, bit(7));
    poser(7, 8, bit(8));
    for (let i = 9; i < 15; i++) poser(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) poser(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) poser(8, n - 15 + i, bit(i));
    poser(8, n - 8, true);
  };
  format(0);
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) {
      const noir = ((b >>> i) & 1) === 1;
      const a = n - 11 + (i % 3);
      const c = Math.floor(i / 3);
      poser(a, c, noir);
      poser(c, a, noir);
    }
  }

  // Placement des données en zigzag
  let i = 0;
  for (let droite = n - 1; droite >= 1; droite -= 2) {
    if (droite === 6) droite = 5;
    for (let k = 0; k < n; k++)
      for (let j = 0; j < 2; j++) {
        const x = droite - j;
        const y = ((droite + 1) & 2) === 0 ? n - 1 - k : k;
        if (!fixe[y][x] && i < flux.length * 8) {
          m[y][x] = ((flux[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
  }

  // Masque le plus lisible (pénalités simplifiées : suites, carrés 2×2, équilibre)
  const appliquer = (k: number) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixe[y][x] && MASQUES[k](x, y)) m[y][x] = !m[y][x];
  };
  let meilleur = 0;
  let mini = Infinity;
  for (let k = 0; k < 8; k++) {
    appliquer(k);
    format(k);
    const p = penalite(m);
    if (p < mini) {
      mini = p;
      meilleur = k;
    }
    appliquer(k);
  }
  appliquer(meilleur);
  format(meilleur);
  return m;
}

function penalite(m: boolean[][]) {
  const n = m.length;
  let p = 0;
  let noirs = 0;
  for (let y = 0; y < n; y++) {
    let suiteL = 1;
    let suiteC = 1;
    for (let x = 0; x < n; x++) {
      if (m[y][x]) noirs++;
      if (x > 0) {
        if (m[y][x] === m[y][x - 1]) suiteL++;
        else suiteL = 1;
        if (suiteL === 5) p += 3;
        else if (suiteL > 5) p++;
        if (m[x][y] === m[x - 1][y]) suiteC++;
        else suiteC = 1;
        if (suiteC === 5) p += 3;
        else if (suiteC > 5) p++;
      }
      if (x > 0 && y > 0 && m[y][x] === m[y - 1][x] && m[y][x] === m[y][x - 1] && m[y][x] === m[y - 1][x - 1]) p += 3;
    }
  }
  p += Math.floor(Math.abs((noirs * 20) / (n * n) - 10)) * 10;
  return p;
}

/** QR code en SVG (avec la marge blanche réglementaire de 4 modules). */
export function qrSvg(texte: string, couleur = "#000"): string {
  const m = qrMatrice(texte);
  const n = m.length;
  let d = "";
  m.forEach((ligne, y) => ligne.forEach((noir, x) => noir && (d += `M${x + 4} ${y + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 8} ${n + 8}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="${couleur}"/></svg>`;
}
