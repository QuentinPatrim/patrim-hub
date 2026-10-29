/* ============================================================
   Disponibilités de visite du conseiller : des plages par jour de
   la semaine (ex. lundi à vendredi, 10h-12h et 14h30-18h), proposées
   sur la page web de chaque bien, moins les rendez-vous de l'agenda
   (Hub et Google Agenda). Une ligne « dispo » de hub_docs par compte.
   Fonctions pures, utilisées par le téléphone et par le serveur.
   ============================================================ */

export interface Plage {
  de: string; // HH:MM, heure de Paris
  a: string;
}
export interface Dispo {
  actif: boolean;
  /** Plages par jour : 0 dimanche … 6 samedi. */
  jours: Record<number, Plage[]>;
  /** Durée d'une visite, en minutes. */
  duree: number;
  /** Nombre de jours proposés à l'avance. */
  horizon: number;
}

const SEMAINE: Plage[] = [
  { de: "10:00", a: "12:00" },
  { de: "14:30", a: "18:00" },
];
export const DISPO_DEFAUT: Dispo = { actif: false, jours: { 1: SEMAINE, 2: SEMAINE, 3: SEMAINE, 4: SEMAINE, 5: SEMAINE }, duree: 45, horizon: 14 };
export const NOMS_JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

/** Date et heure de Paris (AAAA-MM-JJ, HH:MM) → instant ISO, heure d'été comprise. */
export function parisIso(ymd: string, hhmm: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const voulu = Date.UTC(y, m - 1, d, h, mi);
  let t = voulu;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const mur = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    t += voulu - mur;
  }
  return new Date(t).toISOString();
}

const ymdParis = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
const hhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

/** Tous les créneaux des disponibilités, du jour à l'horizon (sans tenir compte de l'agenda). */
export function creneauxDispo(d: Dispo | undefined, maintenant = Date.now()): string[] {
  if (!d?.actif) return [];
  const duree = Math.max(15, d.duree || 45);
  const out: string[] = [];
  for (let i = 0; i <= Math.min(d.horizon || 14, 60); i++) {
    const ymd = ymdParis(maintenant + i * 86400_000);
    const jour = new Date(ymd + "T12:00:00Z").getUTCDay();
    for (const p of d.jours?.[jour] ?? []) {
      const fin = minutes(p.a);
      for (let m = minutes(p.de); m + duree <= fin; m += duree) out.push(parisIso(ymd, hhmm(m)));
    }
  }
  return out;
}
