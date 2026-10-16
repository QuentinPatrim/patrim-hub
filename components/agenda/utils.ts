import { CalendarCheck, Calculator, Signature, KeyRound, Phone, UsersRound, type LucideIcon } from "lucide-react";
import type { Bien, Contact, Rdv, RdvType } from "@/lib/types";
import { RDV_TYPE, dateLongue, heure, nomComplet } from "@/lib/format";
import { adresseComplete, secteur } from "@/components/biens/utils";
import { nomConseiller } from "@/lib/equipe";

/* Outils du module Agenda. */

export type Ressenti = "enthousiaste" | "positif" | "mitige" | "negatif";
export type SuiteKey = "offre" | "seconde_visite" | "reflexion" | "pas_interesse";

export interface CrDetail {
  ressenti?: Ressenti;
  positifs?: string;
  negatifs?: string;
  suite?: SuiteKey;
  prochaineAction?: string;
  notes?: string;
}
/** Champ ajouté par le module (non présent dans lib/types.ts) : le compte rendu structuré. */
export type RdvExt = Rdv & { crDetail?: CrDetail };

export const RESSENTI: Record<Ressenti, { label: string; emoji: string }> = {
  enthousiaste: { label: "Enthousiaste", emoji: "😍" },
  positif: { label: "Positif", emoji: "🙂" },
  mitige: { label: "Mitigé", emoji: "😐" },
  negatif: { label: "Négatif", emoji: "🙁" },
};
export const SUITE: Record<SuiteKey, { label: string; tone: "ok" | "brand" | "warn" | "neutral" }> = {
  offre: { label: "Va faire une offre", tone: "brand" },
  seconde_visite: { label: "2e visite", tone: "ok" },
  reflexion: { label: "En réflexion", tone: "warn" },
  pas_interesse: { label: "Pas intéressé", tone: "neutral" },
};

export const RDV_ICON: Record<RdvType, LucideIcon> = {
  visite: KeyRound,
  estimation: Calculator,
  appel: Phone,
  signature: Signature,
  rdv_vendeur: UsersRound,
  autre: CalendarCheck,
};
/** Couleur de pastille par type (classes Tailwind sur fond). */
export const RDV_DOT: Record<RdvType, string> = {
  visite: "bg-brand",
  estimation: "bg-sky-600",
  appel: "bg-emerald-600",
  signature: "bg-coral",
  rdv_vendeur: "bg-amber-600",
  autre: "bg-slate-patrim",
};
export const DUREE_DEFAUT: Record<RdvType, number> = { visite: 45, estimation: 60, appel: 15, signature: 60, rdv_vendeur: 60, autre: 30 };

const TZ = "Europe/Paris";
/** Jour (AAAA-MM-JJ, heure de Paris) d'une date ISO. */
export const jourDe = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: TZ });
/** Heure HH:MM (Paris) d'une date ISO, pour les champs de saisie. */
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
/** Date + heure saisies (heure de l'appareil) → ISO. */
export const versIso = (jour: string, h: string) => new Date(`${jour}T${h || "09:00"}:00`).toISOString();
/** Lundi de la semaine d'un jour AAAA-MM-JJ. */
export const lundiDe = (ymd: string) => {
  const d = new Date(ymd + "T12:00:00Z");
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
};

export const finDe = (r: Rdv) => (r.fin ? new Date(r.fin) : new Date(new Date(r.debut).getTime() + DUREE_DEFAUT[r.type] * 60000));
export const estPasse = (r: Rdv) => finDe(r).getTime() < Date.now();
export const aCompteRendu = (r: Rdv) => !!(r.compteRendu || r.avisClient || r.suite);
export const crAFaire = (r: Rdv) => r.type === "visite" && r.statut !== "annule" && !aCompteRendu(r) && new Date(r.debut).getTime() < Date.now();

export function titreRdv(r: Rdv, bien?: Bien, contacts: Contact[] = []) {
  if (r.titre) return r.titre;
  const qui = contacts.map((c) => nomComplet(c)).join(", ");
  if (r.type === "visite") return bien ? `Visite · ${bien.titre}` : qui ? `Visite avec ${qui}` : "Visite";
  if (bien) return `${RDV_TYPE[r.type]} · ${bien.titre}`;
  return qui ? `${RDV_TYPE[r.type]} · ${qui}` : RDV_TYPE[r.type];
}

export const lieuRdv = (r: Rdv, bien?: Bien) => r.lieu || (bien ? adresseComplete(bien) : "");

/* ---------- Fichier calendrier (.ics) ---------- */
const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const fold = (line: string) => {
  const out: string[] = [];
  let l = line;
  while (l.length > 72) {
    out.push(l.slice(0, 72));
    l = " " + l.slice(72);
  }
  out.push(l);
  return out.join("\r\n");
};

/** Événement pour l'agenda du conseiller (usage personnel). */
export function icsDeRdv(r: Rdv, bien?: Bien, contacts: Contact[] = []) {
  const lieu = lieuRdv(r, bien);
  const desc = [
    bien ? `Bien : ${bien.titre}${bien.ref ? ` (${bien.ref})` : ""}` : "",
    ...contacts.map((c) => `${nomComplet(c)}${c.tel ? " – " + c.tel : ""}`),
    "Préparé avec PATRIM Hub",
  ].filter(Boolean);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PATRIM//Hub//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${r.id}@patrim-hub`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(new Date(r.debut))}`,
    `DTEND:${icsDate(finDe(r))}`,
    `SUMMARY:${icsEsc(titreRdv(r, bien, contacts))}`,
    lieu ? `LOCATION:${icsEsc(lieu)}` : "",
    `DESCRIPTION:${icsEsc(desc.join("\n"))}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Rappel",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n");
}

export function telechargerIcs(r: Rdv, bien?: Bien, contacts: Contact[] = []) {
  const blob = new Blob([icsDeRdv(r, bien, contacts)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${r.type}-${jourDe(r.debut)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function lienGoogleAgenda(r: Rdv, bien?: Bien, contacts: Contact[] = []) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: titreRdv(r, bien, contacts),
    dates: `${icsDate(new Date(r.debut))}/${icsDate(finDe(r))}`,
    location: lieuRdv(r, bien),
    details: contacts.map((c) => `${nomComplet(c)}${c.tel ? " – " + c.tel : ""}`).join("\n"),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Message de confirmation au client : date, heure, lieu. Jamais de durée. */
export function texteConfirmation(r: Rdv, bien: Bien | undefined, c: Contact) {
  const qui = c.prenom || [c.civilite, c.nom].filter(Boolean).join(" ");
  const quand = `${dateLongue(r.debut)} à ${heure(r.debut)}`;
  const lieu = lieuRdv(r, bien);
  const objet =
    r.type === "visite"
      ? `notre visite${bien ? ` du bien « ${bien.titre} »${secteur(bien) ? ` (${secteur(bien)})` : ""}` : ""}`
      : r.type === "estimation"
        ? "notre rendez-vous pour l'estimation de votre bien"
        : r.type === "signature"
          ? "notre rendez-vous de signature"
          : r.type === "appel"
            ? "notre échange téléphonique"
            : "notre rendez-vous";
  return [
    `Bonjour ${qui},`,
    "",
    `Je vous confirme ${objet} le ${quand}${lieu && r.type !== "appel" ? `, au ${lieu}` : ""}.`,
    "",
    "En cas d'empêchement, n'hésitez pas à me prévenir.",
    "",
    "Belle journée,",
    `${nomConseiller()} – PATRIM`,
  ].join("\n");
}
