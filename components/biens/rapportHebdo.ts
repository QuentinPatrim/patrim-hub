import { addDays, dateCourte, dateLongue, eur, nomComplet, today } from "@/lib/format";
import type { Bien, Contact, Rdv } from "@/lib/types";
import { joursDepuis } from "./utils";
import { titrePublic } from "@/lib/titrePublic";
import { nomConseiller } from "@/lib/equipe";

/* ============================================================
   Rapport vendeur hebdomadaire, calculé sans IA (instantané) :
   visites de la semaine, retours anonymisés, nouvelles demandes,
   propositions à notre fichier, visites à venir. Jamais de nom de
   visiteur, jamais de durée de visite, rien d'inventé.
   ============================================================ */

type RdvCr = Rdv & { crDetail?: { ressenti?: string; positifs?: string; negatifs?: string; suite?: string } };

const jourParis = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });

export interface Hebdo {
  debut: string;
  fin: string;
  visites: RdvCr[];
  aVenir: RdvCr[];
  totalVisites: number;
  demandes: number;
  proposes: number;
  sujet: string;
  texte: string;
}

export function rapportHebdo({ bien, rdvs, contacts, vendeurs, finSemaine = today() }: { bien: Bien; rdvs: RdvCr[]; contacts: Contact[]; vendeurs: Contact[]; finSemaine?: string }): Hebdo {
  const debut = addDays(finSemaine, -6);
  const dansSemaine = (iso?: string) => !!iso && jourParis(iso) >= debut && jourParis(iso) <= finSemaine;
  const maintenant = Date.now();
  const toutesVisites = rdvs.filter((r) => r.bienId === bien.id && r.type === "visite" && r.statut !== "annule");
  const faites = toutesVisites.filter((v) => new Date(v.debut).getTime() < maintenant);
  const visites = faites.filter((v) => dansSemaine(v.debut)).sort((a, b) => a.debut.localeCompare(b.debut));
  const aVenir = toutesVisites.filter((v) => v.statut === "prevu" && new Date(v.debut).getTime() >= maintenant).sort((a, b) => a.debut.localeCompare(b.debut));
  const demandes = contacts.filter((c) => c.bienOrigineId === bien.id && dansSemaine(c.createdAt)).length;
  const marque = `Bien proposé : ${bien.titre}`;
  const proposes = contacts.filter((c) => (c.historique ?? []).some((h) => h.texte === marque && dansSemaine(h.date))).length;
  const jours = joursDepuis(bien.dateMiseEnVente);

  const salutation = vendeurs.length ? `Bonjour ${vendeurs.map((v) => [v.civilite, v.nom].filter(Boolean).join(" ") || nomComplet(v)).join(" et ")},` : "Bonjour,";
  const retours = visites.map((v, i) => {
    const d = v.crDetail ?? {};
    const morceaux = [
      v.avisClient ? `intérêt ${v.avisClient}/5` : "",
      d.ressenti ? `ressenti : ${d.ressenti}` : "",
      d.positifs ? `points appréciés : ${d.positifs}` : "",
      d.negatifs ? `réserves : ${d.negatifs}` : "",
      v.suite ? `suite : ${v.suite}` : "",
    ].filter(Boolean);
    return `• Visite ${i + 1} (${dateCourte(v.debut)}) : ${morceaux.length ? morceaux.join(" ; ") : "[Retour à compléter]"}`;
  });

  const lignes = [
    salutation,
    "",
    `Voici le point de la semaine du ${dateCourte(debut)} au ${dateCourte(finSemaine)} sur la commercialisation de votre bien${bien.quartier ? ` (${bien.quartier})` : ""}.`,
    "",
    "ACTIVITÉ DE LA SEMAINE",
    `• Visites réalisées : ${visites.length}${faites.length !== visites.length ? ` (${faites.length} depuis le début de la commercialisation)` : ""}`,
    `• Nouvelles demandes reçues pour votre bien : ${demandes}`,
    `• Acquéreurs de notre fichier à qui nous l'avons proposé : ${proposes}`,
    aVenir.length ? `• Visites programmées : ${aVenir.length} (${aVenir.slice(0, 4).map((v) => dateLongue(v.debut)).join(", ")})` : "• Aucune visite programmée pour le moment",
    bien.prix ? `• Prix affiché : ${eur(bien.prix)}${jours != null ? `, en vente depuis ${jours} jours` : ""}` : null,
    "",
    "RETOURS DES VISITEURS",
    ...(retours.length ? retours : ["• Pas de visite cette semaine."]),
    "",
    "PROCHAINES ÉTAPES",
    "• [À compléter]",
    "",
    "Je reste à votre disposition pour en parler de vive voix.",
    "",
    "Bien cordialement,",
    nomConseiller(),
    "PATRIM Immobilier",
  ].filter((l): l is string => l !== null);

  return {
    debut,
    fin: finSemaine,
    visites,
    aVenir,
    totalVisites: faites.length,
    demandes,
    proposes,
    sujet: `Point hebdomadaire – ${titrePublic(bien)} – semaine du ${dateCourte(debut)}`,
    texte: lignes.join("\n"),
  };
}
