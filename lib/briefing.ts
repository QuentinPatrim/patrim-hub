import type { Bien, Briefing, Contact, Estimation, Rdv, Tache } from "./types";
import { ACQUEREUR_ACTIF, BIEN_DISPONIBLE, matchScore } from "./matching";
import { alertesMandats, registre } from "@/components/mandats/registre";

/* ============================================================
   Agent de nuit : analyse tout le portefeuille et prépare le
   briefing du matin (relances, rapprochements, mandats qui
   s'essoufflent ou arrivent à échéance, comptes rendus manquants).
   Fonction pure : utilisée par la tâche planifiée Vercel (serveur)
   et par le bouton « Lancer l'analyse » (navigateur).
   ============================================================ */

export interface Donnees {
  biens: Bien[];
  contacts: Contact[];
  rdvs: Rdv[];
  estimations: Estimation[];
  taches: Tache[];
}

type Point = Briefing["points"][number];
export interface Analyse {
  points: Point[];
  nouvellesTaches: Omit<Tache, "id" | "createdAt" | "updatedAt">[];
}

const jours = (iso?: string, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : Infinity);
const nom = (c: Contact) => [c.prenom, c.nom].filter(Boolean).join(" ") || "Contact";
const ymd = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export function analyser(d: Donnees, now = new Date()): Analyse {
  const today = ymd(now);
  const points: Point[] = [];
  const taches: Analyse["nouvellesTaches"] = [];
  const tacheExiste = (titre: string) => d.taches.some((t) => !t.fait && t.titre === titre);
  const ajouterTache = (t: Analyse["nouvellesTaches"][number]) => {
    if (!tacheExiste(t.titre) && !taches.some((x) => x.titre === t.titre)) taches.push(t);
  };

  const biensDispo = d.biens.filter(BIEN_DISPONIBLE);
  const acquereurs = d.contacts.filter(ACQUEREUR_ACTIF);

  // 1. Relances dues
  const dues = d.contacts.filter((c) => c.dateRelance && c.dateRelance <= today && c.etape !== "perdu" && c.etape !== "gagne");
  dues
    .sort((a, b) => (b.chaleur ?? 1) - (a.chaleur ?? 1))
    .slice(0, 12)
    .forEach((c) => {
      points.push({ type: "relance", titre: `Relancer ${nom(c)}`, detail: c.prochaineAction || (c.dateRelance! < today ? `Relance prévue le ${c.dateRelance}` : "Relance prévue aujourd'hui"), lien: { kind: "contact", id: c.id } });
      ajouterTache({ titre: `Relancer ${nom(c)}`, echeance: today, fait: false, priorite: c.chaleur === 3 ? 1 : 2, lien: { kind: "contact", id: c.id }, origine: "agent", detail: c.prochaineAction });
    });

  // 2. Acquéreurs chauds sans contact depuis 7 jours
  acquereurs
    .filter((c) => (c.chaleur ?? 1) >= 3 && jours(c.dernierContact ?? c.updatedAt, now.getTime()) >= 7 && !dues.includes(c))
    .slice(0, 6)
    .forEach((c) => points.push({ type: "relance", titre: `${nom(c)} est chaud mais sans nouvelles depuis ${jours(c.dernierContact ?? c.updatedAt, now.getTime())} jours`, lien: { kind: "contact", id: c.id } }));

  // 3. Rapprochements : biens compatibles pas encore proposés
  for (const b of biensDispo) {
    const nouveaux = acquereurs
      .map((c) => ({ c, m: matchScore(c, b) }))
      .filter(({ c, m }) => m.score >= 70 && !m.bloquants.length && !c.biensProposes?.includes(b.id))
      .sort((x, y) => y.m.score - x.m.score)
      .slice(0, 5);
    if (nouveaux.length)
      points.push({
        type: "matching",
        titre: `${b.titre || b.adresse} : ${nouveaux.length} acquéreur${nouveaux.length > 1 ? "s" : ""} compatible${nouveaux.length > 1 ? "s" : ""} à qui le proposer`,
        detail: nouveaux.map(({ c, m }) => `${nom(c)} (${m.score} %)`).join(", "),
        lien: { kind: "bien", id: b.id },
      });
  }

  // 4. Mandats qui s'essoufflent : en vente depuis 45 j sans visite depuis 21 j
  for (const b of biensDispo) {
    const depuis = jours(b.dateMiseEnVente ?? b.createdAt, now.getTime());
    const visites = d.rdvs.filter((r) => r.bienId === b.id && r.type === "visite" && r.statut !== "annule");
    const derniere = visites.map((r) => r.debut).sort().pop();
    if (depuis >= 45 && jours(derniere, now.getTime()) >= 21) {
      points.push({ type: "mandat", titre: `${b.titre || b.adresse} : ${visites.length ? "aucune visite depuis 3 semaines" : "aucune visite"} (${depuis} j en vente)`, detail: "Faire un point avec le vendeur (rapport d'activité, repositionnement du prix, nouveaux visuels).", lien: { kind: "bien", id: b.id } });
      ajouterTache({ titre: `Point vendeur : ${b.titre || b.adresse}`, echeance: today, fait: false, priorite: 2, lien: { kind: "bien", id: b.id }, origine: "agent" });
    }
    // Fiche incomplète
    const manque = [!b.dpe && "DPE", b.type === "appartement" && b.etage == null && "étage", b.type === "appartement" && !b.chargesAnnuelles && "charges", !b.taxeFonciere && "taxe foncière", !b.photos?.length && "photos"].filter(Boolean);
    if (manque.length >= 2) points.push({ type: "alerte", titre: `Fiche à compléter : ${b.titre || b.adresse}`, detail: `Manque : ${manque.join(", ")}. Les acquéreurs posent ces questions en premier.`, lien: { kind: "bien", id: b.id } });
  }

  // 5. Registre des mandats : numéro en double, mandat expiré ou bientôt fini (les dates manquantes restent dans le registre)
  for (const a of alertesMandats(registre(d.biens, now)).filter((a) => a.code === "doublon" || a.code === "expire" || a.code === "bientot"))
    points.push({ type: "alerte", titre: a.titre, detail: a.detail, lien: a.bienIds.length === 1 ? { kind: "bien", id: a.bienIds[0] } : { kind: "page", id: "mandats" } });

  // 6. Visites passées sans compte rendu
  d.rdvs
    .filter((r) => r.type === "visite" && r.statut === "prevu" && new Date(r.debut) < now && jours(r.debut, now.getTime()) <= 14)
    .forEach((r) => {
      points.push({ type: "relance", titre: "Visite sans compte rendu", detail: `Visite du ${ymd(new Date(r.debut))} : noter le retour du client et la suite.`, lien: { kind: "rdv", id: r.id } });
    });

  // 7. Estimations envoyées sans suite depuis 10 jours
  d.estimations
    .filter((e) => e.statut === "envoyee" && jours(e.updatedAt, now.getTime()) >= 10)
    .forEach((e) => {
      points.push({ type: "mandat", titre: `Estimation ${e.adresse} envoyée il y a ${jours(e.updatedAt, now.getTime())} j`, detail: "Rappeler le propriétaire pour transformer en mandat.", lien: { kind: "estimation", id: e.id } });
      ajouterTache({ titre: `Rappeler le propriétaire : ${e.adresse}`, echeance: today, fait: false, priorite: 2, lien: { kind: "estimation", id: e.id }, origine: "agent" });
    });

  return { points, nouvellesTaches: taches };
}

export function resumeCourt(a: Analyse) {
  const n = (t: Point["type"]) => a.points.filter((p) => p.type === t).length;
  const parts = [
    n("relance") && `${n("relance")} relance${n("relance") > 1 ? "s" : ""}`,
    n("matching") && `${n("matching")} bien${n("matching") > 1 ? "s" : ""} à proposer`,
    n("mandat") && `${n("mandat")} mandat${n("mandat") > 1 ? "s" : ""} à relancer`,
    n("alerte") && `${n("alerte")} alerte${n("alerte") > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return parts.length ? `Aujourd'hui : ${parts.join(", ")}.` : "Rien d'urgent ce matin. Bonne journée !";
}
