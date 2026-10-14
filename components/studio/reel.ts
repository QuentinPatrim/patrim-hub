"use client";

/* Reel vertical 1080×1920 : diaporama Ken Burns, fondus, textes animés,
   écran de fin PATRIM. Une seule fonction pure dessine l'image à l'instant t. */

import { AGENCE } from "./shared";
import { brandBackground, C, clamp01, dpeWidth, drawCover, drawDpe, drawLogo, easeInOut, easeOut, fit, font, lerp, rgba, roundRect, spaced, vGradient } from "./canvas";

export const RW = 1080;
export const RH = 1920;

export type StyleVideo = "elegant" | "dynamique" | "minimal";
export const STYLES: { value: StyleVideo; label: string; hint: string }[] = [
  { value: "elegant", label: "Élégant", hint: "Lent, serif, fondus longs" },
  { value: "dynamique", label: "Dynamique", hint: "Rythmé, glissés, blocs de couleur" },
  { value: "minimal", label: "Minimal", hint: "Cadre crème, typographie sobre" },
];

export interface ReelTexts {
  accroche: string; // petit libellé d'ouverture (ex. NOUVEAUTÉ)
  titre: string;
  lieu: string;
  prix: string;
  chiffres: string; // "T3 · 68 m² · balcon"
  points: string[];
  cta: string;
  dpe?: string;
}

type Img = HTMLImageElement | HTMLCanvasElement;
type Overlay = { kind: "titre" } | { kind: "prix" } | { kind: "chiffres" } | { kind: "point"; text: string; n: number } | { kind: "none" };
interface Scene {
  start: number;
  dur: number; // durée pleine (hors fondu de sortie)
  img: Img | null;
  i: number;
  overlay: Overlay;
}
export interface ReelPlan {
  duration: number;
  style: StyleVideo;
  texts: ReelTexts;
  scenes: Scene[];
  endStart: number;
  tf: number;
  emblem: HTMLImageElement | null;
  arcades: HTMLImageElement | null;
}

const TF: Record<StyleVideo, number> = { elegant: 0.9, dynamique: 0.38, minimal: 0.6 };

/** Réduit les photos très lourdes pour garder 30 images/seconde sur téléphone. */
export function preparePhoto(img: HTMLImageElement, max = 2200): Img {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (s >= 1) return img;
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function buildPlan(o: { duration: number; style: StyleVideo; texts: ReelTexts; photos: Img[]; emblem: HTMLImageElement | null; arcades: HTMLImageElement | null }): ReelPlan {
  const tf = TF[o.style];
  const endDur = o.duration <= 15 ? 3.5 : 4.5;
  const body = o.duration - endDur;
  const overlays: Overlay[] = [{ kind: "titre" }];
  if (o.texts.prix) overlays.push({ kind: "prix" });
  if (o.texts.chiffres) overlays.push({ kind: "chiffres" });
  o.texts.points.filter(Boolean).forEach((p, n) => overlays.push({ kind: "point", text: p, n }));
  const target = o.style === "dynamique" ? 2.6 : 3.4;
  let n = Math.round(body / target);
  n = Math.max(3, Math.min(n, Math.max(o.photos.length, 3), 10));
  const sd = body / n;
  const scenes: Scene[] = Array.from({ length: n }, (_, i) => ({
    start: i * sd,
    dur: sd,
    img: o.photos.length ? o.photos[i % o.photos.length] : null,
    i,
    overlay: overlays[i] ?? { kind: "none" },
  }));
  // si plus de textes que de plans, on regroupe les points forts restants sur le dernier plan
  if (overlays.length > n) {
    const rest = overlays.slice(n - 1).filter((x): x is Extract<Overlay, { kind: "point" }> => x.kind === "point");
    if (rest.length > 1) scenes[n - 1].overlay = { kind: "point", text: rest.map((r) => r.text).join(" · "), n: rest[0].n };
  }
  return { duration: o.duration, style: o.style, texts: o.texts, scenes, endStart: body, tf, emblem: o.emblem, arcades: o.arcades };
}

/* ---------- Dessin d'une image ---------- */
export function drawReel(ctx: CanvasRenderingContext2D, plan: ReelPlan, t: number) {
  const { style, tf } = plan;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
  if (style === "minimal") {
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, RW, RH);
  } else {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, RW, RH);
  }

  for (const s of plan.scenes) {
    const local = t - s.start;
    if (local < 0 || local > s.dur + tf) continue;
    const enter = s.i === 0 ? 1 : easeInOut(local / tf);
    ctx.save();
    if (style === "dynamique" && s.i > 0 && enter < 1) {
      ctx.translate(RW * (1 - enter) * 0.6, 0);
      ctx.globalAlpha = Math.min(1, enter * 1.6);
    } else ctx.globalAlpha = enter;
    drawScene(ctx, plan, s, local);
    ctx.restore();
  }

  // écran de fin
  const le = t - plan.endStart;
  if (le >= 0) {
    ctx.save();
    ctx.globalAlpha = easeInOut(le / tf);
    drawEnd(ctx, plan, le);
    ctx.restore();
  }

  // barre de progression façon story (dynamique)
  if (style === "dynamique") {
    const n = plan.scenes.length + 1;
    const gap = 10;
    const w = (RW - 2 * 60 - gap * (n - 1)) / n;
    for (let k = 0; k < n; k++) {
      const s0 = k < plan.scenes.length ? plan.scenes[k].start : plan.endStart;
      const d0 = k < plan.scenes.length ? plan.scenes[k].dur : plan.duration - plan.endStart;
      const p = clamp01((t - s0) / d0);
      const x = 60 + k * (w + gap);
      ctx.fillStyle = "rgba(246,241,231,.3)";
      ctx.fillRect(x, 120, w, 6);
      ctx.fillStyle = C.cream;
      ctx.fillRect(x, 120, w * p, 6);
    }
  }
}

function kenBurns(i: number, k: number, style: StyleVideo) {
  const amp = style === "dynamique" ? 0.22 : style === "elegant" ? 0.12 : 0.07;
  const e = style === "dynamique" ? easeOut(k) : k;
  switch (i % 4) {
    case 0:
      return { z: 1 + amp * e, px: 0, py: 0 };
    case 1:
      return { z: 1 + amp * (1 - e) + 0.04, px: lerp(-0.8, 0.8, e), py: 0 };
    case 2:
      return { z: 1 + amp * 0.5 + amp * 0.5 * e, px: lerp(0.7, -0.7, e), py: lerp(0.3, -0.2, e) };
    default:
      return { z: 1 + amp * (1 - e), px: 0, py: lerp(0.5, -0.5, e) };
  }
}

function drawScene(ctx: CanvasRenderingContext2D, plan: ReelPlan, s: Scene, local: number) {
  const { style } = plan;
  const k = clamp01(local / (s.dur + plan.tf));
  const kb = kenBurns(s.i, k, style);

  if (style === "minimal") {
    const fx = 60,
      fy = 220,
      fw = RW - 120,
      fh = 1040;
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, RW, RH);
    ctx.save();
    roundRect(ctx, fx, fy, fw, fh, 28);
    ctx.clip();
    if (s.img) drawCover(ctx, s.img, fx, fy, fw, fh, kb.z, kb.px, kb.py);
    else brandBackground(ctx, RW, fy + fh, "bordeaux", plan.arcades, { arcadesY: fy + fh - 380 });
    ctx.restore();
    drawLogo(ctx, plan.emblem, RW / 2, 110, 74, C.ink, "center", false);
  } else {
    if (s.img) drawCover(ctx, s.img, 0, 0, RW, RH, kb.z, kb.px, kb.py);
    else brandBackground(ctx, RW, RH, s.i % 2 ? "encre" : "bordeaux", plan.arcades);
    ctx.fillStyle = vGradient(ctx, 0, RH, [
      [0, "rgba(13,20,32,.55)"],
      [0.14, "rgba(13,20,32,0)"],
      [0.5, "rgba(13,20,32,0)"],
      [0.82, "rgba(13,20,32,.7)"],
      [1, "rgba(13,20,32,.9)"],
    ]);
    ctx.fillRect(0, 0, RW, RH);
    drawLogo(ctx, plan.emblem, 70, style === "dynamique" ? 170 : 150, 64, C.cream, "left", false);
  }

  if (s.overlay.kind === "none") return;
  // apparition / disparition du texte
  const tin = clamp01((local - 0.25) / (style === "dynamique" ? 0.35 : 0.7));
  const tout = 1 - clamp01((local - (s.dur - 0.35)) / 0.35);
  const a = Math.min(easeOut(tin), tout);
  if (a <= 0) return;
  drawOverlay(ctx, plan, s.overlay, a, easeOut(tin));
}

function overlayContent(plan: ReelPlan, o: Overlay): { tag: string; main: string; sub?: string } {
  const t = plan.texts;
  switch (o.kind) {
    case "titre":
      return { tag: t.accroche || "NOUVEAUTÉ", main: t.titre, sub: t.lieu };
    case "prix":
      return { tag: "PRIX", main: t.prix, sub: "Honoraires inclus" };
    case "chiffres":
      return { tag: "EN BREF", main: t.chiffres, sub: t.lieu };
    case "point":
      return { tag: "ON AIME", main: o.text };
    default:
      return { tag: "", main: "" };
  }
}

function drawOverlay(ctx: CanvasRenderingContext2D, plan: ReelPlan, o: Overlay, a: number, p: number) {
  const { style } = plan;
  const c = overlayContent(plan, o);
  const M = 80;
  const maxW = RW - 2 * M;
  ctx.save();
  ctx.globalAlpha *= a;

  if (style === "minimal") {
    const y0 = 1340 + (1 - p) * 20;
    font(ctx, "sans", 26, 600);
    ctx.fillStyle = C.bordeaux;
    ctx.textAlign = "center";
    spaced(ctx, c.tag.toUpperCase(), RW / 2, y0, 6, "center");
    const big = o.kind === "prix" ? 96 : 68;
    const f = fit(ctx, c.main, "serif", o.kind === "prix" ? 700 : 500, big, 40, maxW, 2);
    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    f.lines.forEach((l, i) => ctx.fillText(l, RW / 2, y0 + 30 + f.size * (1.05 + i * 1.12)));
    if (c.sub) {
      font(ctx, "sans", 28, 500);
      ctx.fillStyle = C.anthracite;
      ctx.fillText(c.sub, RW / 2, y0 + 30 + f.size * (1.05 + f.lines.length * 1.12) + 26);
    }
    if (o.kind === "prix" && plan.texts.dpe) drawDpe(ctx, plan.texts.dpe, RW / 2 - dpeWidth(ctx, 60) / 2, y0 + 30 + f.size * (1.05 + f.lines.length * 1.12) + 62, 60, C.anthracite);
    ctx.restore();
    return;
  }

  if (style === "dynamique") {
    const f = fit(ctx, c.main.toUpperCase(), "sans", 800, o.kind === "prix" ? 104 : 76, 40, maxW - 60, 3);
    const lh = f.size * 1.1;
    const boxH = f.lines.length * lh + 70;
    const y = 1380 - boxH / 2;
    const wipe = easeOut(p);
    // étiquette
    roundRect(ctx, M, y - 74, 0 + spacedTag(ctx, c.tag) + 44, 54, 27);
    ctx.fillStyle = C.coral;
    ctx.fill();
    font(ctx, "sans", 24, 700);
    ctx.fillStyle = "#fff";
    spaced(ctx, c.tag, M + 22, y - 38, 4);
    // bloc
    ctx.save();
    ctx.beginPath();
    ctx.rect(M - 10, y, (maxW + 20) * wipe, boxH);
    ctx.clip();
    ctx.fillStyle = rgba(C.bordeaux, 0.95);
    ctx.fillRect(M - 10, y, maxW + 20, boxH);
    font(ctx, "sans", f.size, 800);
    ctx.fillStyle = C.cream;
    f.lines.forEach((l, i) => ctx.fillText(l, M + 24, y + 35 + f.size * 0.86 + i * lh));
    ctx.restore();
    if (c.sub) {
      font(ctx, "sans", 32, 600);
      ctx.fillStyle = C.cream;
      ctx.fillText(c.sub, M, y + boxH + 56);
    }
    if (o.kind === "prix" && plan.texts.dpe) drawDpe(ctx, plan.texts.dpe, M, y + boxH + 96, 64, C.cream);
    ctx.restore();
    return;
  }

  // élégant
  const rise = (1 - p) * 40;
  const big = o.kind === "prix" ? 120 : o.kind === "titre" ? 92 : 76;
  const f = fit(ctx, c.main, "serif", o.kind === "prix" ? 700 : 600, big, 44, maxW, 3);
  const lh = f.size * 1.12;
  let y = 1560 - f.lines.length * lh + rise;
  ctx.fillStyle = C.coral;
  ctx.fillRect(M, y - lh - 4, 60 * p, 4);
  font(ctx, "sans", 26, 600);
  ctx.fillStyle = C.cream;
  spaced(ctx, c.tag.toUpperCase(), M + 80, y - lh + 6, 6);
  font(ctx, "serif", f.size, o.kind === "prix" ? 700 : 600);
  ctx.fillStyle = C.cream;
  f.lines.forEach((l) => {
    ctx.fillText(l, M, y);
    y += lh;
  });
  if (c.sub) {
    font(ctx, "sans", 32, 500);
    ctx.fillStyle = "rgba(246,241,231,.85)";
    ctx.fillText(c.sub, M, y + 6);
  }
  if (o.kind === "prix" && plan.texts.dpe) drawDpe(ctx, plan.texts.dpe, RW - M - dpeWidth(ctx, 72), 1560 - 120 + rise, 72, C.cream);
  ctx.restore();
}

function spacedTag(ctx: CanvasRenderingContext2D, tag: string) {
  font(ctx, "sans", 24, 700);
  return [...tag].reduce((s, ch) => s + ctx.measureText(ch).width, 0) + 4 * (tag.length - 1);
}

function drawEnd(ctx: CanvasRenderingContext2D, plan: ReelPlan, le: number) {
  const light = plan.style === "minimal";
  if (light) {
    ctx.fillStyle = C.cream;
    ctx.fillRect(0, 0, RW, RH);
  } else brandBackground(ctx, RW, RH, "bordeaux", plan.arcades, { arcadesY: RH - 640 + (1 - easeOut(le / 2)) * 120, arcadesAlpha: 0.11 });
  const fg = light ? C.ink : C.cream;
  const sub = light ? C.anthracite : "rgba(246,241,231,.78)";
  const step = (d: number) => easeOut((le - d) / 0.6);

  ctx.save();
  const s1 = step(0.15);
  ctx.globalAlpha *= s1;
  const sc = lerp(0.92, 1, s1);
  ctx.translate(RW / 2, 640);
  ctx.scale(sc, sc);
  ctx.translate(-RW / 2, -640);
  drawLogo(ctx, plan.emblem, RW / 2, 560, 150, fg, "center");
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  const s2 = step(0.6);
  ctx.globalAlpha *= s2;
  const f = fit(ctx, plan.texts.cta || "Réservez votre visite", "serif", 600, 84, 48, RW - 160, 2);
  ctx.fillStyle = fg;
  f.lines.forEach((l, i) => ctx.fillText(l, RW / 2, 900 + (1 - s2) * 30 + i * f.size * 1.12));
  ctx.fillStyle = C.coral;
  const ly = 900 + f.lines.length * f.size * 1.12 + 10;
  ctx.fillRect(RW / 2 - 50, ly, 100, 4);
  ctx.restore();

  ctx.save();
  ctx.textAlign = "center";
  const s3 = step(1.0);
  ctx.globalAlpha *= s3;
  const by = 1230 + (1 - s3) * 30;
  font(ctx, "sans", 34, 600);
  ctx.fillStyle = fg;
  ctx.fillText(`${AGENCE.conseiller} · Conseiller vente`, RW / 2, by);
  font(ctx, "serif", 76, 600);
  ctx.fillText(AGENCE.tel, RW / 2, by + 110);
  font(ctx, "sans", 32, 500);
  ctx.fillStyle = sub;
  ctx.fillText(`@${AGENCE.instagram}`, RW / 2, by + 186);
  ctx.fillText(AGENCE.adresse, RW / 2, by + 236);
  ctx.restore();
}

/* ---------- Enregistrement ---------- */
export function pickMime(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const tries: [string, "mp4" | "webm"][] = [
    ["video/mp4;codecs=avc1.42E01E", "mp4"],
    ["video/mp4;codecs=avc1", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9", "webm"],
    ["video/webm;codecs=vp8", "webm"],
    ["video/webm", "webm"],
  ];
  for (const [m, e] of tries) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext: e };
    } catch {}
  }
  return null;
}

export function canRecord() {
  return typeof document !== "undefined" && "captureStream" in HTMLCanvasElement.prototype && !!pickMime();
}

/** Joue le reel sur le canvas en temps réel. Avec record=true, renvoie le fichier vidéo. */
export function play(
  canvas: HTMLCanvasElement,
  plan: ReelPlan,
  opts: { record: boolean; onProgress?: (p: number) => void; signal?: AbortSignal }
): Promise<{ blob: Blob; ext: string } | null> {
  const ctx = canvas.getContext("2d")!;
  canvas.width = RW;
  canvas.height = RH;
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  const chunks: Blob[] = [];
  const mime = opts.record ? pickMime() : null;
  if (opts.record) {
    if (!mime || !("captureStream" in canvas)) return Promise.reject(new Error("Ce navigateur ne sait pas enregistrer de vidéo. Essayez avec Chrome ou Safari à jour."));
    drawReel(ctx, plan, 0);
    stream = canvas.captureStream(30);
    rec = new MediaRecorder(stream, { mimeType: mime.mime, videoBitsPerSecond: 10_000_000 });
    rec.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  }
  return new Promise((resolve, reject) => {
    let t0 = 0;
    let stopped = false;
    const finish = (ok: boolean) => {
      if (stopped) return;
      stopped = true;
      if (rec && rec.state !== "inactive") {
        rec.onstop = () => {
          stream?.getTracks().forEach((tr) => tr.stop());
          if (!ok) return resolve(null);
          const type = mime!.mime.split(";")[0];
          const blob = new Blob(chunks, { type });
          blob.size ? resolve({ blob, ext: mime!.ext }) : reject(new Error("La vidéo est vide. Gardez l'écran allumé pendant la création."));
        };
        try {
          rec.requestData();
        } catch {}
        rec.stop();
      } else resolve(null);
    };
    opts.signal?.addEventListener("abort", () => finish(false));
    const frame = (now: number) => {
      if (stopped) return;
      if (!t0) t0 = now;
      const t = (now - t0) / 1000;
      drawReel(ctx, plan, Math.min(t, plan.duration));
      opts.onProgress?.(Math.min(1, t / plan.duration));
      if (t >= plan.duration) {
        // laisse la dernière image s'enregistrer
        setTimeout(() => finish(true), opts.record ? 250 : 0);
        return;
      }
      requestAnimationFrame(frame);
    };
    if (rec) rec.start(500);
    requestAnimationFrame(frame);
  });
}
