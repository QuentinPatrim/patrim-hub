"use client";

/* Page web d'un bien (lien court /b/…, pour le QR code de la vitrine) : une fiche publique
   à part, toujours sans l'adresse exacte, avec un formulaire « Demander une visite »
   et, si le conseiller en propose, des créneaux à réserver soi-même.
   Elle se remet à jour à chaque ouverture de la fiche du bien quand quelque chose a changé. */

import { supabase } from "@/lib/supabase";
import { uid, update } from "@/lib/store";
import { ficheDepuisBien, type FichePublique } from "@/components/fiche/fiche";
import type { Bien, Contact } from "@/lib/types";

export type BienPageWeb = Bien & { pageWeb?: { id: string; empreinte?: string; creneaux?: string[]; dureeVisite?: number } };
/** Page publiée : la fiche, plus les créneaux de visite proposés en libre-service. */
export type DonneesPageWeb = FichePublique & { creneaux?: string[]; dureeVisite?: number };
export const pageWebDe = (b: Bien) => (b as BienPageWeb).pageWeb;
export const lienPageWeb = (id: string) => `${window.location.origin}/b/${id}`;

/** Créneaux encore à venir (au moins deux heures devant soi pour s'organiser). */
export const creneauxAVenir = (b: Bien) => (pageWebDe(b)?.creneaux ?? []).filter((c) => new Date(c).getTime() > Date.now() + 2 * 3600_000).sort();

export function fichePageWeb(b: Bien, vendeurs: Contact[]): DonneesPageWeb {
  const f = ficheDepuisBien(b, vendeurs, { adresse: false });
  const creneaux = f.disponible ? creneauxAVenir(b) : [];
  return creneaux.length ? { ...f, creneaux, dureeVisite: pageWebDe(b)?.dureeVisite ?? 45 } : f;
}

export function empreinteFiche(f: DonneesPageWeb) {
  const s = JSON.stringify({ ...f, majLe: "" });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Crée ou met à jour la page. Renvoie son lien. */
export async function publierPageWeb(b: Bien, f: DonneesPageWeb): Promise<string> {
  if (!supabase) throw new Error("La page web demande la connexion au Hub.");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Session expirée, reconnecte-toi.");
  const id = pageWebDe(b)?.id ?? uid();
  const { error } = await supabase.from("hub_docs").upsert({ id, kind: "partage", data: f, user_id: u.user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error("Publication impossible : " + error.message);
  update("biens", b.id, { pageWeb: { ...pageWebDe(b), id, empreinte: empreinteFiche(f) } } as Partial<Bien>);
  return lienPageWeb(id);
}

/** Créneaux proposés : enregistrés sur le bien, la page se republie d'elle-même. */
export function changerCreneaux(b: Bien, creneaux: string[], dureeVisite?: number) {
  const p = pageWebDe(b);
  if (!p) return;
  update("biens", b.id, { pageWeb: { ...p, creneaux: [...new Set(creneaux)].sort(), dureeVisite: dureeVisite ?? p.dureeVisite } } as Partial<Bien>);
}

/** Retire la page : le QR code ne mène plus nulle part. */
export async function retirerPageWeb(b: Bien) {
  const id = pageWebDe(b)?.id;
  if (supabase && id) await supabase.from("hub_docs").delete().eq("id", id).eq("kind", "partage");
  update("biens", b.id, { pageWeb: undefined } as Partial<Bien>);
}
