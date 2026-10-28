"use client";

/* Page web d'un bien (lien court /b/…, pour le QR code de la vitrine) : une fiche publique
   à part, toujours sans l'adresse exacte, avec un formulaire « Demander une visite ».
   Elle se remet à jour à chaque ouverture de la fiche du bien quand quelque chose a changé. */

import { supabase } from "@/lib/supabase";
import { uid, update } from "@/lib/store";
import { ficheDepuisBien, type FichePublique } from "@/components/fiche/fiche";
import type { Bien, Contact } from "@/lib/types";

export type BienPageWeb = Bien & { pageWeb?: { id: string; empreinte?: string } };
export const pageWebDe = (b: Bien) => (b as BienPageWeb).pageWeb;
export const lienPageWeb = (id: string) => `${window.location.origin}/b/${id}`;

export const fichePageWeb = (b: Bien, vendeurs: Contact[]) => ficheDepuisBien(b, vendeurs, { adresse: false });

export function empreinteFiche(f: FichePublique) {
  const s = JSON.stringify({ ...f, majLe: "" });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Crée ou met à jour la page. Renvoie son lien. */
export async function publierPageWeb(b: Bien, f: FichePublique): Promise<string> {
  if (!supabase) throw new Error("La page web demande la connexion au Hub.");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Session expirée, reconnecte-toi.");
  const id = pageWebDe(b)?.id ?? uid();
  const { error } = await supabase.from("hub_docs").upsert({ id, kind: "partage", data: f, user_id: u.user.id, updated_at: new Date().toISOString() });
  if (error) throw new Error("Publication impossible : " + error.message);
  update("biens", b.id, { pageWeb: { id, empreinte: empreinteFiche(f) } } as Partial<Bien>);
  return lienPageWeb(id);
}

/** Retire la page : le QR code ne mène plus nulle part. */
export async function retirerPageWeb(b: Bien) {
  const id = pageWebDe(b)?.id;
  if (supabase && id) await supabase.from("hub_docs").delete().eq("id", id).eq("kind", "partage");
  update("biens", b.id, { pageWeb: undefined } as Partial<Bien>);
}
