/* Lecture des photos d'une fiche annonce du site patrim.fr, vente ou location (adresses absolues, relatives ou sans protocole). */
const PHOTO = /(?:https?:)?(?:\/\/www\.patrim\.fr)?\/photobox\/[^"'()\s<>]+?\/(?:transaction|location)\/photo\/(?!vignettes\/)[^"'()\s<>/?]+?\.(?:jpe?g|png|webp)/gi;

export function photosDansPage(html: string): string[] {
  const brut = html.replace(/&amp;/g, "&").replace(/\\\//g, "/").match(PHOTO) ?? [];
  const abs = brut.map((u) => (u.startsWith("http") ? u.replace(/^http:/, "https:") : u.startsWith("//") ? `https:${u}` : `https://www.patrim.fr${u}`));
  return [...new Set(abs)].slice(0, 24);
}
