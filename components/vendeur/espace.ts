"use client";

/* Espace vendeur en ligne : une page publique (lien secret, sans compte) où le
   propriétaire suit la commercialisation de son bien : visites, retours anonymisés,
   demandes, étapes de la vente, diagnostics. C'est une photo préparée ici, sans
   aucun nom de visiteur ni d'acquéreur, sans montant d'offre ; elle est remise à
   jour à chaque ouverture de la fiche du bien. */

import { supabase } from "@/lib/supabase";
import { uid, update } from "@/lib/store";
import { STATUT_BIEN, today } from "@/lib/format";
import { titrePublic } from "@/lib/titrePublic";
import { nomConseiller } from "@/lib/equipe";
import { AGENCE } from "@/components/documents/charte";
import { TYPE_MANDAT } from "@/components/mandats/registre";
import { statutsDiags } from "@/components/diagnostics/diagnostics";
import { VENTE_EN_COURS, echeances } from "@/components/vente/vente";
import type { Bien, Contact, Rdv } from "@/lib/types";

type RdvCr = Rdv & { crDetail?: { ressenti?: string; positifs?: string; negatifs?: string; suite?: string } };

export interface EspacePublic {
  v: 1;
  titre: string;
  lieu: string;
  photo?: string;
  prix?: number;
  statut: string;
  enVenteDepuis?: string;
  mandat?: { type?: string; fin?: string };
  stats: { visites: number; visites30: number; demandes: number; proposes: number; compatibles: number };
  aVenir: string[];
  retours: { date: string; avis?: number; ressenti?: string; positifs?: string; negatifs?: string }[];
  etapes: { label: string; texte: string; etat: string }[];
  diagnostics: { label: string; texte: string; tone: string }[];
  annonceUrl?: string;
  conseiller: { nom: string; tel: string; mail?: string };
  maj: string;
}

export type BienEspace = Bien & { espaceVendeur?: { id: string; empreinte?: string; maj?: string } };
export const espaceDe = (b: Bien) => (b as BienEspace).espaceVendeur;
export const lienEspace = (id: string) => `${window.location.origin}/imprimer/vendeur/${id}`;

export function photoEspace(b: Bien, compatibles: number, contacts: Contact[], rdvs: RdvCr[]): EspacePublic {
  const auj = today();
  const maintenant = Date.now();
  const visites = rdvs.filter((r) => r.bienId === b.id && r.type === "visite" && r.statut !== "annule");
  const faites = visites.filter((v) => new Date(v.debut).getTime() < maintenant).sort((x, y) => y.debut.localeCompare(x.debut));
  const aVenir = visites.filter((v) => v.statut === "prevu" && new Date(v.debut).getTime() >= maintenant).sort((x, y) => x.debut.localeCompare(y.debut));
  const marque = `Bien proposé : ${b.titre}`;
  const http = (u?: string) => (u && /^https:\/\//.test(u) ? u : undefined);
  return {
    v: 1,
    titre: titrePublic(b),
    lieu: [b.quartier, b.ville].filter(Boolean).join(", "),
    photo: http(b.photos?.[0]),
    prix: b.prix,
    statut: STATUT_BIEN[b.statut]?.label ?? b.statut,
    enVenteDepuis: b.dateMiseEnVente,
    mandat: b.mandat?.type || b.mandat?.fin ? { type: b.mandat?.type ? TYPE_MANDAT[b.mandat.type] : undefined, fin: b.mandat?.fin } : undefined,
    stats: {
      visites: faites.length,
      visites30: faites.filter((v) => maintenant - new Date(v.debut).getTime() < 30 * 86400000).length,
      demandes: contacts.filter((c) => c.bienOrigineId === b.id).length,
      proposes: contacts.filter((c) => c.biensProposes?.includes(b.id) || (c.historique ?? []).some((h) => h.texte === marque)).length,
      compatibles,
    },
    aVenir: aVenir.slice(0, 8).map((v) => v.debut),
    retours: faites.slice(0, 12).map((v) => ({
      date: v.debut,
      avis: v.avisClient,
      ressenti: v.crDetail?.ressenti || undefined,
      positifs: v.crDetail?.positifs || undefined,
      negatifs: v.crDetail?.negatifs || undefined,
    })),
    etapes: VENTE_EN_COURS(b) ? echeances(b, auj).filter((e) => e.etat !== "aCompleter").map((e) => ({ label: e.label, texte: e.texte, etat: e.etat })) : [],
    diagnostics: statutsDiags(b, auj)
      .filter((d) => d.etat !== "nonConcerne" && d.etat !== "aPreciser")
      .map((d) => ({ label: d.label, texte: d.texte, tone: d.tone })),
    annonceUrl: http(b.annonceUrl),
    conseiller: { nom: nomConseiller(), tel: AGENCE.conseillerTel, mail: AGENCE.conseillerMail || undefined },
    maj: new Date().toISOString(),
  };
}

/** Empreinte du contenu (sans la date de mise à jour) : on ne republie que si quelque chose a changé. */
export function empreinte(e: EspacePublic) {
  const s = JSON.stringify({ ...e, maj: "" });
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Crée ou met à jour l'espace du bien. Renvoie son lien. */
export async function publierEspace(b: Bien, e: EspacePublic): Promise<string> {
  if (!supabase) throw new Error("L'espace vendeur demande la connexion au Hub.");
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Session expirée, reconnecte-toi.");
  const id = espaceDe(b)?.id ?? uid();
  const { error } = await supabase.from("hub_docs").upsert({ id, kind: "vendeur", data: e, user_id: u.user.id, updated_at: e.maj });
  if (error) throw new Error("Publication impossible : " + error.message);
  update("biens", b.id, { espaceVendeur: { id, empreinte: empreinte(e), maj: e.maj } } as Partial<Bien>);
  return lienEspace(id);
}

/** Coupe le lien : la page n'est plus accessible. */
export async function couperEspace(b: Bien) {
  const id = espaceDe(b)?.id;
  if (supabase && id) await supabase.from("hub_docs").delete().eq("id", id).eq("kind", "vendeur");
  update("biens", b.id, { espaceVendeur: undefined } as Partial<Bien>);
}
