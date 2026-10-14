"use client";

/* Moteur de dessin du Studio (visuels et vidéo) : polices, images,
   fond de marque, logo, textes, pastilles DPE. Tout est dessiné sur <canvas>. */

export const C = {
  bordeaux: "#6c191e",
  bordeauxDark: "#4f1115",
  bordeauxLight: "#8e2a30",
  anthracite: "#4a4f55",
  coral: "#ef402a",
  ink: "#0d1420",
  cream: "#f6f1e7",
  white: "#ffffff",
};
export const SERIF = '"Playfair Display", Georgia, "Times New Roman", serif';
export const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif';

export const DPE_COLORS: Record<string, string> = { A: "#009c6d", B: "#52b153", C: "#78bd76", D: "#f4e70f", E: "#f0b50f", F: "#eb8235", G: "#d7221f" };

type Ctx = CanvasRenderingContext2D;

/* ---------- Polices ---------- */
let fontsP: Promise<void> | null = null;
export function ensureFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return Promise.resolve();
  fontsP ??= Promise.race([
    Promise.all(
      ['500 40px "Playfair Display"', '600 40px "Playfair Display"', '700 40px "Playfair Display"', "400 40px Inter", "500 40px Inter", "600 40px Inter", "700 40px Inter"].map((f) =>
        document.fonts.load(f).catch(() => [])
      )
    ).then(() => document.fonts.ready),
    new Promise((r) => setTimeout(r, 5000)),
  ]).then(() => undefined);
  return fontsP;
}

/* ---------- Images ---------- */
const cache = new Map<string, Promise<HTMLImageElement | null>>();
/** Charge une image utilisable sur canvas. null si elle est indisponible ou bloquée (CORS) : on dessinera alors un fond de marque. */
export function loadImage(src?: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  let p = cache.get(src);
  if (!p) {
    p = new Promise((res) => {
      const img = new Image();
      const local = src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/");
      if (!local) img.crossOrigin = "anonymous";
      img.decoding = "async";
      const t = setTimeout(() => res(null), 15000);
      img.onload = () => {
        clearTimeout(t);
        res(img.naturalWidth ? img : null);
      };
      img.onerror = () => {
        clearTimeout(t);
        res(null);
      };
      img.src = src;
    });
    cache.set(src, p);
    p.then((r) => {
      if (!r) cache.delete(src);
    });
  }
  return p;
}

let brandAssets: Promise<{ emblem: HTMLImageElement | null; arcades: HTMLImageElement | null }> | null = null;
export function loadBrand() {
  brandAssets ??= Promise.all([loadImage("/emblem.png"), loadImage("/arcades.png")]).then(([emblem, arcades]) => ({ emblem, arcades }));
  return brandAssets;
}

/* ---------- Géométrie ---------- */
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Dessine l'image en "cover" dans le rectangle, avec zoom et panoramique (-1..1). */
export function drawCover(ctx: Ctx, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, zoom = 1, panX = 0, panY = 0) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s;
  const dh = ih * s;
  const dx = x - (dw - w) * (0.5 + panX * 0.5);
  const dy = y - (dh - h) * (0.5 + panY * 0.5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

export function vGradient(ctx: Ctx, y0: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

export function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ---------- Fond de marque (sans photo) ---------- */
const tintCache = new Map<string, HTMLCanvasElement>();
function tinted(img: HTMLImageElement, color: string) {
  const key = img.src + color;
  let c = tintCache.get(key);
  if (!c) {
    c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext("2d")!;
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
  }
  return c;
}

export type Palette = "bordeaux" | "encre" | "creme";
export const PALETTES: Record<Palette, { bg: string; bg2: string; fg: string; sub: string; accent: string; line: string }> = {
  bordeaux: { bg: C.bordeaux, bg2: C.bordeauxDark, fg: C.cream, sub: "rgba(246,241,231,.72)", accent: C.coral, line: "#f6f1e7" },
  encre: { bg: "#141d2c", bg2: C.ink, fg: C.cream, sub: "rgba(246,241,231,.68)", accent: C.coral, line: "#f6f1e7" },
  creme: { bg: C.cream, bg2: "#ece4d4", fg: C.ink, sub: "rgba(13,20,32,.62)", accent: C.bordeaux, line: C.bordeaux },
};

export function brandBackground(ctx: Ctx, w: number, h: number, palette: Palette, arcades: HTMLImageElement | null, opts: { arcadesAlpha?: number; arcadesY?: number } = {}) {
  const p = PALETTES[palette];
  ctx.fillStyle = vGradient(ctx, 0, h, [
    [0, p.bg],
    [1, p.bg2],
  ]);
  ctx.fillRect(0, 0, w, h);
  // halo doux
  const r = ctx.createRadialGradient(w * 0.8, h * 0.15, 10, w * 0.8, h * 0.15, w * 0.9);
  r.addColorStop(0, palette === "creme" ? "rgba(255,255,255,.7)" : "rgba(255,255,255,.08)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
  if (arcades) {
    const t = tinted(arcades, p.line);
    const aw = w * 1.15;
    const ah = (aw * arcades.naturalHeight) / arcades.naturalWidth;
    ctx.save();
    ctx.globalAlpha = opts.arcadesAlpha ?? (palette === "creme" ? 0.1 : 0.09);
    ctx.drawImage(t, -w * 0.075, opts.arcadesY ?? h - ah, aw, ah);
    ctx.restore();
  }
}

/* ---------- Texte ---------- */
export function font(ctx: Ctx, family: "serif" | "sans", size: number, weight = 500) {
  ctx.font = `${weight} ${Math.round(size)}px ${family === "serif" ? SERIF : SANS}`;
}

export function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const t = line ? line + " " + w : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Choisit la plus grande taille de police pour tenir en maxLines lignes. */
export function fit(ctx: Ctx, text: string, family: "serif" | "sans", weight: number, maxSize: number, minSize: number, maxW: number, maxLines: number) {
  let size = maxSize;
  let lines: string[] = [];
  while (size >= minSize) {
    font(ctx, family, size, weight);
    lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) break;
    size -= 2;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  return { size, lines };
}

/** Texte espacé (petites capitales de marque), compatible tous navigateurs. */
export function spaced(ctx: Ctx, text: string, x: number, y: number, spacing: number, align: "left" | "center" | "right" = "left") {
  const chars = [...text];
  const total = chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
  return total;
}
export function spacedWidth(ctx: Ctx, text: string, spacing: number) {
  const chars = [...text];
  return chars.reduce((s, c) => s + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
}

/* ---------- Logo PATRIM ---------- */
/** Emblème + mot PATRIM (+ filet rouge). h = hauteur de l'emblème. */
export function drawLogo(ctx: Ctx, emblem: HTMLImageElement | null, x: number, y: number, h: number, color: string, align: "left" | "center" = "left", tagline = true) {
  font(ctx, "sans", h * 0.5, 700);
  const tw = spacedWidth(ctx, "PATRIM", h * 0.12);
  const gap = h * 0.32;
  const total = h + gap + tw;
  const x0 = align === "center" ? x - total / 2 : x;
  if (emblem) {
    ctx.save();
    roundRect(ctx, x0, y, h, h, h * 0.12);
    ctx.clip();
    ctx.drawImage(emblem, x0, y, h, h);
    ctx.restore();
  } else {
    ctx.fillStyle = C.bordeaux;
    roundRect(ctx, x0, y, h, h, h * 0.12);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  spaced(ctx, "PATRIM", x0 + h + gap, y + h * (tagline ? 0.56 : 0.68), h * 0.12);
  if (tagline) {
    ctx.fillStyle = C.coral;
    ctx.fillRect(x0 + h + gap, y + h * 0.67, tw, Math.max(2, h * 0.035));
    font(ctx, "sans", h * 0.16, 600);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.75;
    spaced(ctx, "TRANSACTION · TOULOUSE", x0 + h + gap, y + h * 0.92, h * 0.025);
    ctx.globalAlpha = 1;
  }
  return total;
}

/* ---------- Pastille DPE ---------- */
export function drawDpe(ctx: Ctx, cls: string | undefined, x: number, y: number, s: number, labelColor: string) {
  if (!cls) return 0;
  font(ctx, "sans", s * 0.42, 600);
  ctx.fillStyle = labelColor;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const label = "DPE";
  const lw = ctx.measureText(label).width;
  ctx.fillText(label, x, y + s / 2);
  const bx = x + lw + s * 0.25;
  ctx.fillStyle = DPE_COLORS[cls] ?? "#999";
  roundRect(ctx, bx, y, s, s, s * 0.22);
  ctx.fill();
  font(ctx, "sans", s * 0.58, 700);
  ctx.fillStyle = cls === "D" || cls === "E" ? "#2b2b2b" : "#fff";
  ctx.textAlign = "center";
  ctx.fillText(cls, bx + s / 2, y + s / 2 + s * 0.03);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  return lw + s * 0.25 + s;
}

export function dpeWidth(ctx: Ctx, s: number) {
  font(ctx, "sans", s * 0.42, 600);
  return ctx.measureText("DPE").width + s * 0.25 + s;
}

/* ---------- Animation ---------- */
export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function canvasToBlob(c: HTMLCanvasElement, type = "image/png", q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Image impossible à créer."))), type, q));
}
