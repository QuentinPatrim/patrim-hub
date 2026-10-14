"use client";

/* Modèles de visuels PATRIM (post 4:5, story 9:16, carré) dessinés sur canvas. */

import { eur, m2 } from "@/lib/format";
import { titrePublic } from "@/lib/titrePublic";
import type { Bien } from "@/lib/types";
import { AGENCE, lieuPublic } from "./shared";
import { brandBackground, C, dpeWidth, drawCover, drawDpe, drawLogo, fit, font, PALETTES, rgba, roundRect, spaced, vGradient, wrap, type Palette } from "./canvas";

export type Modele = "nouveaute" | "visite" | "baisse" | "sous_offre" | "vendu" | "carrousel";
export type Format = "post" | "story" | "carre";

export const FORMATS: Record<Format, { w: number; h: number; label: string; ratio: string }> = {
  post: { w: 1080, h: 1350, label: "Post", ratio: "4:5" },
  story: { w: 1080, h: 1920, label: "Story", ratio: "9:16" },
  carre: { w: 1080, h: 1080, label: "Carré", ratio: "1:1" },
};

export const MODELES: { value: Modele; label: string; hint: string }[] = [
  { value: "nouveaute", label: "Nouveauté", hint: "Annonce d'un bien qui arrive" },
  { value: "visite", label: "Visite ce week-end", hint: "Portes ouvertes, créneaux" },
  { value: "baisse", label: "Baisse de prix", hint: "Nouveau prix mis en avant" },
  { value: "sous_offre", label: "Sous offre", hint: "Preuve d'activité" },
  { value: "vendu", label: "Vendu", hint: "Sceau PATRIM, appel aux vendeurs" },
  { value: "carrousel", label: "Carrousel", hint: "Plusieurs slides à faire défiler" },
];

export interface Chiffre {
  valeur: string;
  label: string;
}
export interface VisuelData {
  titre: string;
  lieu: string;
  prix: string;
  ancienPrix: string;
  mention: string; // date de visite, phrase libre
  cta: string;
  dpe?: string;
  chiffres: Chiffre[];
  pointsForts: string[];
  ligne: string; // ex. "T3 · 68 m² · Carmes"
}

export function chiffresDuBien(b: Bien): Chiffre[] {
  const out: Chiffre[] = [];
  if (b.surface) out.push({ valeur: m2(b.surface), label: b.type === "appartement" ? "Surface Carrez" : "Surface" });
  if (b.pieces) out.push({ valeur: String(b.pieces), label: b.pieces > 1 ? "Pièces" : "Pièce" });
  if (b.chambres) out.push({ valeur: String(b.chambres), label: b.chambres > 1 ? "Chambres" : "Chambre" });
  if (b.surfaceTerrain) out.push({ valeur: m2(b.surfaceTerrain), label: "Terrain" });
  if (b.etage != null && b.type === "appartement") out.push({ valeur: b.etage === 0 ? "RDC" : `${b.etage}${b.etage === 1 ? "er" : "e"}`, label: b.ascenseur ? "Étage, ascenseur" : "Étage" });
  if (b.anneeConstruction) out.push({ valeur: String(b.anneeConstruction), label: "Construction" });
  return out;
}

export function dataDuBien(b: Bien): VisuelData {
  return {
    titre: titrePublic(b),
    lieu: lieuPublic(b),
    prix: b.prix ? eur(b.prix) : "",
    ancienPrix: "",
    mention: "Samedi · 10h – 13h",
    cta: "Sur rendez-vous · " + AGENCE.tel,
    dpe: b.dpe,
    chiffres: chiffresDuBien(b),
    pointsForts: (b.pointsForts ?? []).slice(0, 5),
    ligne: [b.pieces ? (b.type === "maison" ? `Maison ${b.pieces} pièces` : `T${b.pieces}`) : null, b.surface ? m2(b.surface) : null, b.quartier || b.ville].filter(Boolean).join(" · "),
  };
}

export type SlideKind = { kind: "cover" } | { kind: "chiffres" } | { kind: "points" } | { kind: "photo"; index: number } | { kind: "contact" };

export function carouselSlides(d: VisuelData, photoCount: number): SlideKind[] {
  const s: SlideKind[] = [{ kind: "cover" }, { kind: "chiffres" }];
  if (d.pointsForts.length) s.push({ kind: "points" });
  for (let i = 1; i < Math.min(photoCount, 4); i++) s.push({ kind: "photo", index: i });
  s.push({ kind: "contact" });
  return s;
}

export interface RenderOpts {
  modele: Modele;
  format: Format;
  palette: Palette;
  data: VisuelData;
  photos: (HTMLImageElement | null)[]; // photo principale en premier
  slide?: number;
  emblem: HTMLImageElement | null;
  arcades: HTMLImageElement | null;
}

type Ctx = CanvasRenderingContext2D;

const safe = (f: Format) => (f === "story" ? { top: 200, bottom: 300 } : f === "post" ? { top: 72, bottom: 76 } : { top: 64, bottom: 64 });
const M = 80;

export function renderVisuel(ctx: Ctx, o: RenderOpts) {
  const { w: W, h: H } = FORMATS[o.format];
  ctx.canvas.width = W;
  ctx.canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  switch (o.modele) {
    case "nouveaute":
      return editorial(ctx, o, W, H, "NOUVEAUTÉ");
    case "baisse":
      return editorial(ctx, o, W, H, "NOUVEAU PRIX");
    case "visite":
      return visite(ctx, o, W, H);
    case "sous_offre":
      return sousOffre(ctx, o, W, H);
    case "vendu":
      return vendu(ctx, o, W, H);
    case "carrousel": {
      const slides = carouselSlides(o.data, o.photos.filter(Boolean).length);
      const i = Math.max(0, Math.min(slides.length - 1, o.slide ?? 0));
      return carrousel(ctx, o, W, H, slides[i], i, slides.length);
    }
  }
}

function background(ctx: Ctx, o: RenderOpts, W: number, H: number, photo: HTMLImageElement | null, y = 0, h = H) {
  if (photo) drawCover(ctx, photo, 0, y, W, h);
  else {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, y, W, h);
    ctx.clip();
    brandBackground(ctx, W, y + h, o.palette === "creme" ? "bordeaux" : o.palette, o.arcades, { arcadesY: y + h * 0.35 });
    ctx.restore();
  }
}

function label(ctx: Ctx, text: string, x: number, y: number, color: string, accent = C.coral, size = 26) {
  ctx.fillStyle = accent;
  ctx.fillRect(x, y - size * 0.36, 56, 4);
  font(ctx, "sans", size, 600);
  ctx.fillStyle = color;
  spaced(ctx, text, x + 76, y, size * 0.2);
}

function chiffresRow(ctx: Ctx, items: { valeur: string; label: string }[], x: number, y: number, w: number, color: string, sub: string, sep: string) {
  const list = items.slice(0, 3);
  if (!list.length) return;
  const cw = w / list.length;
  list.forEach((c, i) => {
    const cx = x + i * cw + (i ? 36 : 0);
    if (i) {
      ctx.fillStyle = sep;
      ctx.fillRect(x + i * cw, y - 64, 2, 84);
    }
    font(ctx, "serif", 52, 600);
    ctx.fillStyle = color;
    ctx.fillText(c.valeur, cx, y - 14);
    font(ctx, "sans", 22, 600);
    ctx.fillStyle = sub;
    spaced(ctx, c.label.toUpperCase(), cx, y + 20, 2.5);
  });
}

function priceBlock(ctx: Ctx, o: RenderOpts, x: number, y: number, color: string, sub: string, big = 76) {
  const d = o.data;
  let cx = x;
  if (o.modele === "baisse" && d.ancienPrix) {
    font(ctx, "serif", big * 0.55, 500);
    ctx.fillStyle = sub;
    const w = ctx.measureText(d.ancienPrix).width;
    ctx.fillText(d.ancienPrix, cx, y);
    ctx.fillStyle = C.coral;
    ctx.save();
    ctx.translate(cx, y - big * 0.18);
    ctx.rotate(-0.08);
    ctx.fillRect(-4, -2, w + 8, 5);
    ctx.restore();
    cx += w + 28;
  }
  if (d.prix) {
    font(ctx, "serif", big, 700);
    ctx.fillStyle = color;
    ctx.fillText(d.prix, cx, y);
    font(ctx, "sans", 21, 500);
    ctx.fillStyle = sub;
    ctx.fillText("Honoraires inclus", x, y + 38);
  }
}

/* ---------- Nouveauté / Baisse de prix : photo pleine page, bloc éditorial ---------- */
function editorial(ctx: Ctx, o: RenderOpts, W: number, H: number, tag: string) {
  const s = safe(o.format);
  const d = o.data;
  background(ctx, o, W, H, o.photos[0] ?? null);
  ctx.fillStyle = vGradient(ctx, 0, H, [
    [0, "rgba(13,20,32,.55)"],
    [0.16, "rgba(13,20,32,0)"],
    [o.format === "carre" ? 0.3 : 0.4, "rgba(13,20,32,0)"],
    [0.72, "rgba(13,20,32,.72)"],
    [1, "rgba(13,20,32,.94)"],
  ]);
  ctx.fillRect(0, 0, W, H);

  drawLogo(ctx, o.emblem, M, s.top, 74, C.cream);
  if (d.dpe) {
    const dw = dpeWidth(ctx, 50) + 40;
    roundRect(ctx, W - M - dw, s.top + 6, dw, 66, 33);
    ctx.fillStyle = "rgba(13,20,32,.45)";
    ctx.fill();
    drawDpe(ctx, d.dpe, W - M - dw + 22, s.top + 14, 50, C.cream);
  }

  const maxW = W - 2 * M;
  let y = H - s.bottom;
  const isBaisse = o.modele === "baisse";
  // bandeau prix
  if (isBaisse) {
    const bh = 170;
    y -= bh;
    roundRect(ctx, M - 24, y, W - 2 * M + 48, bh, 28);
    ctx.fillStyle = PALETTES[o.palette === "creme" ? "bordeaux" : o.palette].bg;
    ctx.fill();
    priceBlock(ctx, o, M + 16, y + 96, C.cream, "rgba(246,241,231,.7)", 80);
    y -= 56;
  } else if (d.prix) {
    priceBlock(ctx, o, M, y - 40, C.cream, "rgba(246,241,231,.72)");
    y -= 150;
  }
  if (d.chiffres.length) {
    chiffresRow(ctx, d.chiffres, M, y, maxW, C.cream, "rgba(246,241,231,.7)", "rgba(246,241,231,.25)");
    y -= 112;
    ctx.fillStyle = "rgba(246,241,231,.22)";
    ctx.fillRect(M, y, maxW, 2);
    y -= 48;
  }
  font(ctx, "sans", 30, 500);
  ctx.fillStyle = "rgba(246,241,231,.85)";
  ctx.fillText(d.lieu, M, y);
  y -= 58;
  const t = fit(ctx, d.titre, "serif", 600, o.format === "carre" ? 74 : 86, 48, maxW, o.format === "carre" ? 2 : 3);
  const lh = t.size * 1.12;
  ctx.fillStyle = C.cream;
  for (let i = t.lines.length - 1; i >= 0; i--) {
    ctx.fillText(t.lines[i], M, y);
    y -= lh;
  }
  y -= 8;
  label(ctx, tag, M, y, C.cream);
}

/* ---------- Visite ce week-end : photo en haut, panneau de marque, carte date ---------- */
function visite(ctx: Ctx, o: RenderOpts, W: number, H: number) {
  const s = safe(o.format);
  const d = o.data;
  const p = PALETTES[o.palette];
  const split = Math.round(H * (o.format === "story" ? 0.5 : o.format === "carre" ? 0.44 : 0.5));
  ctx.fillStyle = p.bg2;
  ctx.fillRect(0, 0, W, H);
  background(ctx, o, W, H, o.photos[0] ?? null, 0, split);
  ctx.fillStyle = vGradient(ctx, 0, split, [
    [0, "rgba(13,20,32,.5)"],
    [0.3, "rgba(13,20,32,0)"],
  ]);
  ctx.fillRect(0, 0, W, split);
  // panneau
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, split, W, H - split);
  ctx.clip();
  brandBackground(ctx, W, H, o.palette, o.arcades, { arcadesY: H - 380 * (W / 1080) });
  ctx.restore();
  drawLogo(ctx, o.emblem, M, s.top, 70, C.cream);

  // carte date à cheval
  const cardH = o.format === "carre" ? 200 : 236;
  const cardY = split - cardH * 0.55;
  const cardW = W - 2 * M;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.28)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 16;
  roundRect(ctx, M, cardY, cardW, cardH, 28);
  ctx.fillStyle = o.palette === "creme" ? C.bordeaux : C.cream;
  ctx.fill();
  ctx.restore();
  const cardFg = o.palette === "creme" ? C.cream : C.bordeaux;
  font(ctx, "sans", 24, 700);
  ctx.fillStyle = o.palette === "creme" ? C.cream : C.coral;
  spaced(ctx, "VISITE CE WEEK-END", M + 48, cardY + 62, 5);
  const mt = fit(ctx, d.mention || "[À compléter : date]", "serif", 600, 70, 40, cardW - 96, 1);
  ctx.fillStyle = cardFg;
  ctx.fillText(mt.lines[0], M + 48, cardY + 62 + mt.size * 1.15);
  font(ctx, "sans", 26, 500);
  ctx.fillStyle = o.palette === "creme" ? "rgba(246,241,231,.8)" : C.anthracite;
  ctx.fillText(d.cta, M + 48, cardY + cardH - 38);

  // infos
  let y = cardY + cardH + (o.format === "carre" ? 76 : 110);
  const maxW = W - 2 * M;
  const t = fit(ctx, d.titre, "serif", 600, o.format === "carre" ? 52 : 64, 40, maxW, 2);
  ctx.fillStyle = p.fg;
  t.lines.forEach((l) => {
    ctx.fillText(l, M, y);
    y += t.size * 1.14;
  });
  font(ctx, "sans", 28, 500);
  ctx.fillStyle = p.sub;
  ctx.fillText(d.ligne || d.lieu, M, y + 4);
  const bottom = H - s.bottom;
  if (d.prix) {
    font(ctx, "serif", 64, 700);
    ctx.fillStyle = p.fg;
    ctx.fillText(d.prix, M, bottom - 30);
    font(ctx, "sans", 20, 500);
    ctx.fillStyle = p.sub;
    ctx.fillText("Honoraires inclus", M, bottom + 4);
  }
  if (d.dpe) drawDpe(ctx, d.dpe, W - M - dpeWidth(ctx, 64), bottom - 84, 64, p.sub);
}

/* ---------- Sous offre ---------- */
function sousOffre(ctx: Ctx, o: RenderOpts, W: number, H: number) {
  const s = safe(o.format);
  const d = o.data;
  const p = PALETTES[o.palette];
  background(ctx, o, W, H, o.photos[0] ?? null);
  ctx.fillStyle = "rgba(13,20,32,.38)";
  ctx.fillRect(0, 0, W, H);
  // cadre fin
  ctx.strokeStyle = "rgba(246,241,231,.7)";
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  const cw = W - 2 * 120;
  const ch = o.format === "carre" ? 520 : 600;
  const cx = 120;
  const cy = (H - ch) / 2 + (o.format === "story" ? -40 : 0);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = 60;
  roundRect(ctx, cx, cy, cw, ch, 8);
  ctx.fillStyle = rgba(p.bg, 0.94);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "center";
  font(ctx, "sans", 24, 600);
  ctx.fillStyle = p.sub;
  spaced(ctx, "BONNE NOUVELLE", W / 2, cy + 96, 6, "center");
  font(ctx, "serif", o.format === "carre" ? 112 : 128, 600);
  ctx.fillStyle = p.fg;
  ctx.fillText("Sous offre", W / 2, cy + 96 + (o.format === "carre" ? 140 : 160));
  ctx.fillStyle = C.coral;
  ctx.fillRect(W / 2 - 50, cy + ch * 0.56, 100, 4);
  const t = fit(ctx, d.titre, "serif", 500, 44, 30, cw - 120, 2);
  ctx.fillStyle = p.fg;
  let y = cy + ch * 0.56 + 76;
  t.lines.forEach((l) => {
    ctx.fillText(l, W / 2, y);
    y += t.size * 1.2;
  });
  font(ctx, "sans", 26, 500);
  ctx.fillStyle = p.sub;
  ctx.fillText(d.lieu, W / 2, y + 8);
  ctx.textAlign = "left";

  const by = H - s.bottom - 74;
  font(ctx, "sans", 28, 500);
  ctx.textAlign = "center";
  ctx.fillStyle = C.cream;
  ctx.fillText("Votre projet est le prochain ? Parlons-en.", W / 2, by - 50);
  ctx.textAlign = "left";
  drawLogo(ctx, o.emblem, W / 2, by, 64, C.cream, "center", false);
}

/* ---------- Vendu : sceau circulaire ---------- */
function circleText(ctx: Ctx, text: string, cx: number, cy: number, r: number) {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const sum = widths.reduce((a, b) => a + b, 0);
  const spacing = Math.max(2, (2 * Math.PI * r - sum) / chars.length);
  let a = -Math.PI / 2;
  chars.forEach((c, i) => {
    const cw = widths[i];
    a += cw / 2 / r;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(c, -cw / 2, 0);
    ctx.restore();
    a += (cw / 2 + spacing) / r;
  });
}

function vendu(ctx: Ctx, o: RenderOpts, W: number, H: number) {
  const s = safe(o.format);
  const d = o.data;
  const p = PALETTES[o.palette === "creme" ? "bordeaux" : o.palette];
  background(ctx, o, W, H, o.photos[0] ?? null);
  ctx.fillStyle = vGradient(ctx, 0, H, [
    [0, rgba(p.bg2, 0.35)],
    [0.45, rgba(p.bg, 0.55)],
    [1, rgba(p.bg2, 0.92)],
  ]);
  ctx.fillRect(0, 0, W, H);
  drawLogo(ctx, o.emblem, M, s.top, 70, C.cream);

  // sceau
  const r = o.format === "carre" ? 230 : 270;
  const cx = W / 2;
  const cy = o.format === "story" ? H * 0.42 : o.format === "carre" ? H * 0.45 : H * 0.44;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  ctx.translate(-cx, -cy);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = rgba(C.ink, 0.18);
  ctx.fill();
  ctx.strokeStyle = C.cream;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 70, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.stroke();
  font(ctx, "sans", 30, 600);
  ctx.fillStyle = C.cream;
  ctx.textBaseline = "middle";
  circleText(ctx, "PATRIM · TRANSACTION · TOULOUSE · VENDU · ", cx, cy, r - 36);
  ctx.textAlign = "center";
  font(ctx, "serif", r * 0.46, 700);
  ctx.fillText("Vendu", cx, cy - 4);
  ctx.fillStyle = C.coral;
  ctx.fillRect(cx - 44, cy + r * 0.26, 88, 4);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";

  let y = cy + r + 110;
  const t = fit(ctx, d.ligne || d.titre, "serif", 600, 54, 36, W - 2 * M, 2);
  ctx.fillStyle = C.cream;
  t.lines.forEach((l) => {
    ctx.fillText(l, W / 2, y);
    y += t.size * 1.15;
  });
  font(ctx, "sans", 28, 500);
  ctx.fillStyle = "rgba(246,241,231,.8)";
  ctx.fillText(d.lieu, W / 2, y + 2);

  const by = H - s.bottom;
  font(ctx, "sans", 28, 500);
  ctx.fillStyle = C.cream;
  const lines = wrap(ctx, d.cta || "Vous vendez ? Estimation offerte.", W - 2 * M - 40);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, by - 40 * (lines.slice(0, 2).length - 1 - i)));
  ctx.textAlign = "left";
}

/* ---------- Carrousel ---------- */
function pager(ctx: Ctx, i: number, n: number, W: number, top: number, color: string) {
  font(ctx, "sans", 24, 600);
  ctx.fillStyle = color;
  ctx.textAlign = "right";
  ctx.fillText(`${i + 1} / ${n}`, W - M, top + 44);
  ctx.textAlign = "left";
  const segW = 36;
  for (let k = 0; k < n; k++) {
    ctx.fillStyle = k === i ? C.coral : rgba(color.startsWith("#") ? color : "#f6f1e7", 0.3);
    ctx.fillRect(W - M - 110 - (n - 1 - k) * (segW + 8) - segW, top + 34, segW, 4);
  }
}

function carrousel(ctx: Ctx, o: RenderOpts, W: number, H: number, sk: { kind: string; index?: number }, i: number, n: number) {
  const s = safe(o.format);
  const d = o.data;
  const p = PALETTES[o.palette];
  const maxW = W - 2 * M;

  if (sk.kind === "cover") {
    editorial(ctx, { ...o, modele: "nouveaute" }, W, H, "À DÉCOUVRIR");
    // flèche « faire défiler »
    font(ctx, "sans", 24, 600);
    ctx.fillStyle = C.cream;
    ctx.textAlign = "right";
    ctx.fillText("Faites défiler  →", W - M, s.top + 120);
    ctx.textAlign = "left";
    return;
  }

  if (sk.kind === "photo") {
    background(ctx, o, W, H, o.photos[sk.index ?? 1] ?? null);
    ctx.fillStyle = vGradient(ctx, 0, H, [
      [0, "rgba(13,20,32,.5)"],
      [0.18, "rgba(13,20,32,0)"],
      [0.8, "rgba(13,20,32,0)"],
      [1, "rgba(13,20,32,.6)"],
    ]);
    ctx.fillRect(0, 0, W, H);
    drawLogo(ctx, o.emblem, M, s.top, 56, C.cream, "left", false);
    pager(ctx, i, n, W, s.top, "#f6f1e7");
    font(ctx, "sans", 26, 500);
    ctx.fillStyle = "rgba(246,241,231,.9)";
    ctx.fillText(d.lieu, M, H - s.bottom);
    return;
  }

  brandBackground(ctx, W, H, o.palette, o.arcades, { arcadesY: H - 330 });
  drawLogo(ctx, o.emblem, M, s.top, 56, p.fg, "left", false);
  pager(ctx, i, n, W, s.top, o.palette === "creme" ? C.anthracite : "#f6f1e7");
  const top = s.top + (o.format === "carre" ? 150 : 200);

  if (sk.kind === "chiffres") {
    label(ctx, "LES CHIFFRES CLÉS", M, top, p.fg, p.accent);
    const items = [...d.chiffres.slice(0, o.format === "carre" ? 4 : 6)];
    const cols = 2;
    const cellW = maxW / cols;
    const cellH = o.format === "carre" ? 170 : o.format === "story" ? 230 : 190;
    let y = top + 70;
    items.forEach((c, k) => {
      const col = k % cols;
      const row = Math.floor(k / cols);
      const x = M + col * cellW;
      const yy = y + row * cellH;
      ctx.fillStyle = rgba(o.palette === "creme" ? C.bordeaux : C.cream, 0.18);
      ctx.fillRect(x, yy, cellW - 30, 2);
      font(ctx, "serif", 76, 600);
      ctx.fillStyle = p.fg;
      ctx.fillText(c.valeur, x, yy + 96);
      font(ctx, "sans", 22, 600);
      ctx.fillStyle = p.sub;
      spaced(ctx, c.label.toUpperCase(), x, yy + 136, 3);
    });
    y += Math.ceil(items.length / cols) * cellH + 30;
    const bottom = H - s.bottom;
    if (d.prix) {
      font(ctx, "serif", 84, 700);
      ctx.fillStyle = p.fg;
      ctx.fillText(d.prix, M, bottom - 36);
      font(ctx, "sans", 21, 500);
      ctx.fillStyle = p.sub;
      ctx.fillText("Honoraires inclus", M, bottom);
    }
    if (d.dpe) drawDpe(ctx, d.dpe, W - M - dpeWidth(ctx, 70), bottom - 100, 70, p.sub);
    return;
  }

  if (sk.kind === "points") {
    label(ctx, "CE QUE L'ON AIME", M, top, p.fg, p.accent);
    const pts = d.pointsForts.slice(0, o.format === "carre" ? 4 : 5);
    let y = top + 110;
    const avail = H - s.bottom - y;
    const step = Math.min(o.format === "story" ? 230 : 170, avail / Math.max(pts.length, 1));
    pts.forEach((pt, k) => {
      font(ctx, "serif", 54, 600);
      ctx.fillStyle = p.accent;
      ctx.fillText(String(k + 1).padStart(2, "0"), M, y + 10);
      const tf = fit(ctx, pt, "sans", 500, 38, 26, maxW - 120, 2);
      ctx.fillStyle = p.fg;
      tf.lines.forEach((l, li) => ctx.fillText(l, M + 120, y + li * tf.size * 1.25));
      y += step;
    });
    return;
  }

  // contact
  ctx.textAlign = "center";
  const cy = H / 2 - (o.format === "carre" ? 140 : 200);
  font(ctx, "sans", 24, 600);
  ctx.fillStyle = p.sub;
  spaced(ctx, "ON EN PARLE ?", W / 2, cy, 6, "center");
  const t = fit(ctx, "Organisons votre visite", "serif", 600, 88, 56, maxW, 2);
  ctx.fillStyle = p.fg;
  let y = cy + t.size * 1.3;
  t.lines.forEach((l) => {
    ctx.fillText(l, W / 2, y);
    y += t.size * 1.12;
  });
  ctx.fillStyle = C.coral;
  ctx.fillRect(W / 2 - 50, y - 10, 100, 4);
  y += 70;
  font(ctx, "sans", 34, 600);
  ctx.fillStyle = p.fg;
  ctx.fillText(`${AGENCE.conseiller} · Conseiller vente`, W / 2, y);
  font(ctx, "serif", 64, 600);
  ctx.fillText(AGENCE.tel, W / 2, y + 96);
  font(ctx, "sans", 28, 500);
  ctx.fillStyle = p.sub;
  ctx.fillText(`@${AGENCE.instagram}`, W / 2, y + 158);
  ctx.fillText(AGENCE.adresse, W / 2, y + 204);
  ctx.textAlign = "left";
  drawLogo(ctx, o.emblem, W / 2, H - s.bottom - 90, 90, p.fg, "center");
}
