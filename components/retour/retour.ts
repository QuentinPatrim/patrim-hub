"use client";

/* Retour de visite : après une visite, le visiteur reçoit (par SMS, envoyé par le conseiller)
   un lien vers un mini-questionnaire (/r/…). Sa réponse revient dans le compte rendu de la
   visite, sans écraser ce que le conseiller a déjà noté, et nourrit l'espace vendeur. */

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getAll, uid, update } from "@/lib/store";
import { nomConseiller } from "@/lib/equipe";
import { titrePublic } from "@/lib/titrePublic";
import type { Bien, Rdv } from "@/lib/types";
import type { CrDetail, Ressenti, SuiteKey } from "@/components/agenda/utils";

export interface Reponse {
  note?: 1 | 2 | 3 | 4 | 5;
  ressenti?: Ressenti;
  positifs?: string;
  negatifs?: string;
  suite?: SuiteKey;
  message?: string;
  recu: string;
}
export interface RetourPublic {
  v: 1;
  rdvId: string;
  titre: string;
  date: string;
  conseiller: string;
  reponse?: Reponse;
  applique?: string;
}

export type RdvRetour = Rdv & { retourId?: string; crDetail?: CrDetail };
export const lienRetour = (id: string) => `${window.location.origin}/r/${id}`;

/** Visites éligibles : faites depuis moins de 3 jours, avec un visiteur joignable par SMS, sans retour noté. */
export function visitesARetour(rdvs: RdvRetour[], maintenant = Date.now()) {
  const contacts = getAll("contacts");
  return rdvs.filter((r) => {
    if (r.type !== "visite" || r.statut === "annule" || r.avisClient || r.crDetail?.ressenti) return false;
    const fin = new Date(r.fin ?? r.debut).getTime();
    if (fin > maintenant || maintenant - fin > 3 * 86400000) return false;
    return (r.contactIds ?? []).some((id) => contacts.find((c) => c.id === id)?.tel);
  });
}

const enCours = new Set<string>();

/** Crée le lien de retour d'une visite (une fois). */
export async function creerRetour(r: RdvRetour, bien?: Bien) {
  if (!supabase || r.retourId || enCours.has(r.id)) return;
  enCours.add(r.id);
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const id = uid();
  const data: RetourPublic = { v: 1, rdvId: r.id, titre: bien ? titrePublic(bien) : "le bien", date: r.debut, conseiller: nomConseiller() };
  const { error } = await supabase.from("hub_docs").insert({ id, kind: "retour", data, user_id: u.user.id, updated_at: new Date().toISOString() });
  if (!error) update("rdvs", r.id, { retourId: id } as Partial<Rdv>);
}

/** Reporte les réponses reçues dans les visites (sans écraser le compte rendu du conseiller). */
async function reporterReponses() {
  if (!supabase) return;
  const { data } = await supabase.from("hub_docs").select("id,data").eq("kind", "retour").not("data->reponse", "is", null).is("data->applique", null).limit(50);
  for (const row of (data ?? []) as { id: string; data: RetourPublic }[]) {
    const rep = row.data.reponse!;
    const r = getAll("rdvs").find((x) => x.id === row.data.rdvId) as RdvRetour | undefined;
    if (!r) continue; // agenda pas encore chargé (ou visite supprimée) : on réessaiera
    {
      const cr: CrDetail = { ...(r.crDetail ?? {}) };
      if (!cr.ressenti && rep.ressenti) cr.ressenti = rep.ressenti;
      if (!cr.positifs && rep.positifs) cr.positifs = rep.positifs;
      if (!cr.negatifs && rep.negatifs) cr.negatifs = rep.negatifs;
      if (!cr.suite && rep.suite) cr.suite = rep.suite;
      if (rep.message) cr.notes = [cr.notes, `Message du visiteur : ${rep.message}`].filter(Boolean).join("\n");
      update("rdvs", r.id, { crDetail: cr, ...(r.avisClient || !rep.note ? {} : { avisClient: rep.note }) } as Partial<Rdv>);
      for (const cid of r.contactIds ?? []) {
        const c = getAll("contacts").find((x) => x.id === cid);
        if (c)
          update("contacts", c.id, {
            historique: [{ date: rep.recu, type: "visite" as const, texte: `Retour de visite reçu${rep.note ? ` : ${rep.note}/5` : ""}${rep.suite === "offre" ? ", souhaite faire une offre" : rep.suite === "seconde_visite" ? ", souhaite revisiter" : ""}` }, ...(c.historique ?? [])],
          });
      }
    }
    await supabase.from("hub_docs").update({ data: { ...row.data, applique: new Date().toISOString() } }).eq("id", row.id);
  }
}

/** À monter une fois dans l'appli : reprend les réponses à l'ouverture et toutes les 5 minutes. */
export function useRetoursVisite() {
  useEffect(() => {
    if (!supabase) return;
    const go = () => void reporterReponses().catch(() => {});
    const t0 = setTimeout(go, 4000);
    const t = setInterval(go, 5 * 60000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);
}
