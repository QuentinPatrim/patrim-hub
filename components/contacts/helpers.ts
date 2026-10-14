import type { Bien, Contact, ContactRole, Criteres, EtapeAcquereur, Source } from "@/lib/types";
import { eurK, today, TYPE_BIEN } from "@/lib/format";

/* Outils partagés du module Contacts. */

export const ETAPES: EtapeAcquereur[] = ["nouveau", "qualifie", "visite", "offre", "compromis", "gagne", "perdu"];
export const SOURCES: Source[] = ["seloger", "leboncoin", "bienici", "site", "telephone", "vitrine", "recommandation", "instagram", "pige", "autre"];
export const ROLES: ContactRole[] = ["acquereur", "vendeur", "prospect_vendeur", "locataire", "partenaire"];

export type HistoType = NonNullable<Contact["historique"]>[number]["type"];
export const HISTO_LABEL: Record<HistoType, string> = { appel: "Appel", mail: "Mail", sms: "SMS", visite: "Visite", note: "Note" };

/** Numéro au format international sans espaces (pour wa.me) */
export function telIntl(tel?: string) {
  if (!tel) return "";
  let d = tel.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.slice(1);
  if (d.startsWith("00")) return d.slice(2);
  if (d.startsWith("0") && d.length === 10) return "33" + d.slice(1);
  return d;
}
export const telHref = (tel?: string) => (tel ? `tel:${tel.replace(/[^\d+]/g, "")}` : undefined);
export const smsHref = (tel?: string, body?: string) =>
  tel ? `sms:${tel.replace(/[^\d+]/g, "")}${body ? `?&body=${encodeURIComponent(body)}` : ""}` : undefined;
export const waHref = (tel?: string, text?: string) =>
  tel ? `https://wa.me/${telIntl(tel)}${text ? `?text=${encodeURIComponent(text)}` : ""}` : undefined;
export const mailHref = (email?: string, subject?: string, body?: string) => {
  if (!email) return undefined;
  const q = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${email}${q ? "?" + q : ""}`;
};

/** Formate un numéro français : 06 12 34 56 78 */
export function telAffiche(tel?: string) {
  if (!tel) return "";
  const d = tel.replace(/\D/g, "");
  if (d.length === 10) return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  if (d.length === 11 && d.startsWith("33")) return "0" + d.slice(2).replace(/(\d{1})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1 $2 $3 $4 $5");
  return tel;
}

export const relanceDue = (c: Contact) => !!c.dateRelance && c.dateRelance <= today();
export const relanceEnRetard = (c: Contact) => !!c.dateRelance && c.dateRelance < today();

export function budgetTxt(k?: Criteres) {
  if (!k) return "";
  if (k.budgetMin && k.budgetMax) return `${eurK(k.budgetMin)} – ${eurK(k.budgetMax)}`;
  if (k.budgetMax) return `≤ ${eurK(k.budgetMax)}`;
  if (k.budgetMin) return `≥ ${eurK(k.budgetMin)}`;
  return "";
}

/** Résumé court des critères : "T3+ · 60 m² · ≤ 320 k€ · Carmes, Busca" */
export function criteresResume(k?: Criteres) {
  if (!k) return "";
  const parts: string[] = [];
  if (k.types?.length) parts.push(k.types.map((t) => TYPE_BIEN[t]).join("/"));
  if (k.piecesMin) parts.push(`T${k.piecesMin}+`);
  if (k.surfaceMin) parts.push(`${k.surfaceMin} m²+`);
  const b = budgetTxt(k);
  if (b) parts.push(b);
  if (k.quartiers?.length) parts.push(k.quartiers.slice(0, 3).join(", ") + (k.quartiers.length > 3 ? "…" : ""));
  return parts.join(" · ");
}

export function rolePrincipal(c: Contact): ContactRole | undefined {
  return c.roles?.[0];
}

export function normalize(s?: string) {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Texte de recherche d'un contact */
export function contactHaystack(c: Contact) {
  return normalize([c.prenom, c.nom, c.email, c.tel, c.tel?.replace(/\D/g, ""), c.notes, c.prochaineAction, c.criteres?.quartiers?.join(" ")].filter(Boolean).join(" "));
}

/** Retrouve un bien à partir d'une référence ou d'un prix (lead entrant). */
export function trouverBien(biens: Bien[], ref?: string, prix?: number, adresse?: string): Bien | undefined {
  const r = normalize(ref).replace(/\s/g, "");
  if (r) {
    const b = biens.find((x) => x.ref && normalize(x.ref).replace(/\s/g, "") === r) ?? biens.find((x) => x.ref && r.includes(normalize(x.ref).replace(/\s/g, "")));
    if (b) return b;
  }
  if (prix) {
    const cands = biens.filter((x) => x.prix && Math.abs(x.prix - prix) <= Math.max(1000, prix * 0.005) && x.statut !== "vendu" && x.statut !== "retire");
    if (cands.length === 1) return cands[0];
    if (cands.length > 1 && adresse) {
      const a = normalize(adresse);
      const m = cands.find((x) => a.includes(normalize(x.quartier)) || a.includes(normalize(x.ville)));
      if (m) return m;
    }
    if (cands.length) return cands[0];
  }
  return undefined;
}

export function sortByRelance(a: Contact, b: Contact) {
  const da = a.dateRelance ?? "9999";
  const db = b.dateRelance ?? "9999";
  if (da !== db) return da < db ? -1 : 1;
  return (b.chaleur ?? 0) - (a.chaleur ?? 0) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}
