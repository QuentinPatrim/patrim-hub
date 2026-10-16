/* Dessin de l'aperçu des formes de lettres (dépannage d'un PDF fait d'images) : chaque forme posée sur une ligne
   de base, dans un cadre gris, chaque point de l'image devenu un carré net de k pixels de l'écran pour qu'une
   capture garde le dessin exact. Module pur (le contexte de dessin est fourni par l'écran). */

import type { Apercu } from "./formes";

export interface PlanFormes {
  /** Largeur et hauteur en pixels de l'écran, taille d'un point en pixels de l'écran. */
  L: number;
  H: number;
  k: number;
  rangs: { y: number; dessus: number; formes: { x: number; i: number }[] }[];
}

function placer(ap: Apercu, L: number, k: number): PlanFormes {
  const marge = Math.max(8, 3 * k);
  const rangs: PlanFormes["rangs"] = [];
  let x = marge;
  let y = marge;
  let dessous = 0;
  let rang: PlanFormes["rangs"][number] | null = null;
  ap.formes.forEach((f, i) => {
    const w = (f.l + 2) * k;
    if (!rang || x + w > L - marge) {
      if (rang) y += (rang.dessus + dessous + 2) * k + marge;
      rang = { y, dessus: 0, formes: [] };
      rangs.push(rang);
      x = marge;
      dessous = 0;
    }
    rang.formes.push({ x, i });
    rang.dessus = Math.max(rang.dessus, f.h - f.bas);
    dessous = Math.max(dessous, f.bas);
    x += w + marge;
  });
  const dernier = rangs[rangs.length - 1];
  return { L, k, rangs, H: dernier ? dernier.y + (dernier.dessus + dessous + 2) * k + marge : marge };
}

/** Mise en page sur une largeur L : les points les plus gros possible (6 pixels au plus, 2 au moins) en restant sous hMax. */
export function planFormes(ap: Apercu, L: number, hMax: number): PlanFormes {
  let k = 6;
  let plan = placer(ap, L, k);
  while (k > 2 && plan.H > hMax) plan = placer(ap, L, --k);
  return plan;
}

/** Contexte de dessin : seules ces fonctions d'un canevas 2D servent. */
export interface Pinceau {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
}

export function dessinerFormes(ctx: Pinceau, ap: Apercu, plan: PlanFormes) {
  const { L, H, k } = plan;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, L, H);
  for (const r of plan.rangs) {
    // Ligne de base : juste sous les lettres sans jambage.
    const base = r.y + (r.dessus + 1) * k;
    ctx.fillStyle = "#f2c4c4";
    ctx.fillRect(0, base, L, 1);
    for (const { x, i } of r.formes) {
      const f = ap.formes[i];
      const haut = base - (f.h - f.bas) * k;
      // Cadre gris d'un pixel, au bord extérieur d'une marge d'un point autour de la forme : il en donne la taille
      // exacte et ne touche ni la forme ni la ligne de base.
      ctx.strokeStyle = "#c8c8c8";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, haut - k + 0.5, (f.l + 2) * k - 1, (f.h + 2) * k - 1);
      ctx.fillStyle = "#000";
      for (let py = 0; py < f.h; py++) for (let px = 0; px < f.l; px++) if (f.points[py * f.l + px]) ctx.fillRect(x + (px + 1) * k, haut + py * k, k, k);
    }
  }
}
