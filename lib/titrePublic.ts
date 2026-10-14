import type { Bien } from "./types";

/* ============================================================
   Titre d'un bien utilisable hors de l'agence (mail acquéreur,
   annonce, visuel, reel). Les titres internes peuvent commencer
   par le nom du propriétaire (« DUPONT – T3 Carmes ») : ce préfixe
   est retiré, ainsi que tout nom de vendeur fourni.
   ============================================================ */

const TYPE: Record<Bien["type"], string> = { appartement: "Appartement", maison: "Maison", terrain: "Terrain", local: "Local", immeuble: "Immeuble", parking: "Parking" };

/** Un segment qui ressemble à un nom propre en capitales (« DUPONT », « MARTIN / DURAND ») sans chiffre. */
const estNomEnCapitales = (s: string) => !/\d/.test(s) && /\p{Lu}{3,}/u.test(s) && s === s.toUpperCase();

export function titreGenerique(b: Pick<Bien, "type" | "pieces" | "surface" | "quartier" | "ville">) {
  return [TYPE[b.type] ?? "Bien", b.pieces && b.type !== "terrain" && b.type !== "parking" ? `${b.pieces} pièces` : "", b.surface ? `${b.surface.toLocaleString("fr-FR")} m²` : "", b.quartier || b.ville || ""]
    .filter(Boolean)
    .join(" · ");
}

export function titrePublic(b: Pick<Bien, "titre" | "type" | "pieces" | "surface" | "quartier" | "ville">, nomsVendeurs: (string | undefined)[] = []): string {
  let parts = (b.titre ?? "").trim().split(/\s+[–—-]\s+/).filter(Boolean);
  while (parts.length > 1 && estNomEnCapitales(parts[0])) parts = parts.slice(1);
  let t = parts.length === 1 && estNomEnCapitales(parts[0]) ? "" : parts.join(" – ");
  for (const n of nomsVendeurs) {
    const nom = n?.trim();
    if (nom && nom.length >= 3) t = t.replace(new RegExp(nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").replace(/^\s*[–—-]\s*|\s*[–—-]\s*$/g, "").replace(/\s{2,}/g, " ").trim();
  }
  return t || titreGenerique(b);
}
