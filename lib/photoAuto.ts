/* Photo automatique quand un bien n'a aucune photo : façade vue de la rue
   (Panoramax) ou, à défaut, vue du ciel (IGN). Voir /api/photo-adresse. */

export interface LieuPhoto {
  adresse?: string;
  codePostal?: string;
  ville?: string;
  lat?: number;
  lon?: number;
  /** Vue choisie avec « Autre vue » (0 = la plus pertinente, la vue du ciel vient en dernier). */
  vueAuto?: number;
}

/** URL de la photo automatique, ou undefined si l'adresse ne suffit pas. */
export function photoAuto(l: LieuPhoto | undefined, opts: { grande?: boolean; v?: number } = {}): string | undefined {
  if (!l) return undefined;
  const p = new URLSearchParams();
  if (Number.isFinite(l.lat) && Number.isFinite(l.lon) && (l.lat || l.lon)) {
    p.set("lat", l.lat!.toFixed(5));
    p.set("lon", l.lon!.toFixed(5));
  } else {
    const adresse = (l.adresse ?? "").trim();
    // Sans numéro ni rue, la photo tomberait au hasard dans la ville
    if (adresse.length < 5) return undefined;
    const q = [adresse, /\b\d{5}\b/.test(adresse) ? "" : [l.codePostal, l.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    p.set("q", q);
  }
  const v = opts.v ?? l.vueAuto ?? 0;
  if (v) p.set("v", String(v));
  p.set("w", opts.grande ? "1200" : "600");
  return `/api/photo-adresse?${p.toString()}`;
}

/** Photo de couverture d'un bien : sa première photo, sinon la photo automatique de l'adresse. */
export function couverture(b: LieuPhoto & { photos?: string[] }, grande?: boolean): string | undefined {
  return b.photos?.[0] || photoAuto(b, { grande });
}
