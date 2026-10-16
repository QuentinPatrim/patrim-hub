"use client";

/* Contexte compact envoyé à l'assistant à chaque message, construit depuis le store.
   Aucune coordonnée (téléphone, mail, adresse) de contact n'y figure, ni l'identité des vendeurs. */

import { getAll } from "@/lib/store";
import { addDays, dateCourte, dateLongue, eurK, ETAPE, heure, m2, RDV_TYPE, ROLE, STATUT_BIEN, today, TYPE_BIEN } from "@/lib/format";
import { ACQUEREUR_ACTIF, BIEN_DISPONIBLE, matchScore, topMatches } from "@/lib/matching";
import type { Contact } from "@/lib/types";
import { nomConseiller } from "@/lib/equipe";

const court = (s: string | undefined, n: number) => (!s ? "" : s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const prenom = (c?: Contact) => (c ? [c.prenom, c.nom ? c.nom[0] + "." : ""].filter(Boolean).join(" ") || "Sans nom" : "?");

export function buildContext(): string {
  const auj = today();
  const fin = addDays(auj, 14);
  const biens = getAll("biens");
  const contacts = getAll("contacts");
  const rdvs = getAll("rdvs");
  const estimations = getAll("estimations");
  const taches = getAll("taches");
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const out: string[] = [`Aujourd'hui : ${dateLongue(auj)} ${auj.slice(0, 4)} (heure de Paris : ${heure(new Date().toISOString())}).`];

  // ---- Biens
  const actifs = biens.filter((b) => b.statut !== "retire").slice(0, 40);
  const acquereurs = contacts.filter(ACQUEREUR_ACTIF);
  if (actifs.length) {
    out.push(`\n## Biens (${actifs.length})`);
    for (const b of actifs) {
      const visites = rdvs.filter((r) => r.bienId === b.id && r.type === "visite" && r.statut === "fait").length;
      const jours = b.dateMiseEnVente ? Math.floor((Date.now() - new Date(b.dateMiseEnVente).getTime()) / 86400000) : null;
      const f = [
        `[${b.ref || b.id.slice(0, 6)}] ${b.titre}`,
        TYPE_BIEN[b.type],
        [b.quartier, b.ville].filter(Boolean).join(", "),
        b.prix ? `${eurK(b.prix)} FAI` : "",
        b.surface ? m2(b.surface) : "",
        b.pieces ? `${b.pieces} p.` : "",
        b.chambres ? `${b.chambres} ch.` : "",
        b.etage != null ? `étage ${b.etage}${b.ascenseur ? " asc." : ""}` : "",
        b.exterieur ?? "",
        b.parking ? `parking : ${b.parking}` : "",
        b.dpe ? `DPE ${b.dpe}` : "DPE inconnu",
        `statut : ${STATUT_BIEN[b.statut].label}`,
        b.mandat?.type ? `mandat ${b.mandat.type}${b.mandat.fin ? ` jusqu'au ${dateCourte(b.mandat.fin)}` : ""}` : "",
        jours != null ? `en vente depuis ${jours} j` : "",
        `${visites} visite(s) faite(s)`,
        b.pointsForts?.length ? `points forts : ${court(b.pointsForts.join(", "), 140)}` : "",
      ].filter(Boolean);
      out.push("- " + f.join(" · "));
      if (BIEN_DISPONIBLE(b) && acquereurs.length) {
        const m = topMatches(acquereurs, (c) => matchScore(c, b), 55).slice(0, 5);
        if (m.length) out.push(`  acquéreurs compatibles : ${m.map((x) => `${prenom(x.item)} (${x.score}/100${x.raisons.length ? ", " + x.raisons.slice(0, 2).join(", ") : ""})`).join(" ; ")}`);
      }
    }
  }

  // ---- Contacts actifs
  const suivis = contacts
    .filter((c) => ACQUEREUR_ACTIF(c) || c.roles?.includes("prospect_vendeur") || (c.dateRelance && c.dateRelance <= fin))
    .sort((a, b) => (a.dateRelance ?? "9999").localeCompare(b.dateRelance ?? "9999"))
    .slice(0, 60);
  if (suivis.length) {
    out.push(`\n## Contacts actifs (${suivis.length})`);
    for (const c of suivis) {
      const k = c.criteres ?? {};
      const crit = [
        k.types?.length ? k.types.map((t) => TYPE_BIEN[t]).join("/") : "",
        k.budgetMax ? `≤ ${eurK(k.budgetMax)}` : "",
        k.surfaceMin ? `≥ ${k.surfaceMin} m²` : "",
        k.piecesMin ? `≥ ${k.piecesMin} p.` : "",
        k.quartiers?.length ? k.quartiers.slice(0, 4).join("/") : "",
        k.exterieur ? "extérieur" : "",
        k.parking ? "parking" : "",
        k.investissement ? "investissement" : "",
        k.remarques ? court(k.remarques, 80) : "",
      ].filter(Boolean);
      const f = [
        prenom(c),
        (c.roles ?? []).map((r) => ROLE[r]).join("/"),
        c.etape ? `étape : ${ETAPE[c.etape].label}` : "",
        c.chaleur ? ["", "froid", "tiède", "chaud"][c.chaleur] : "",
        crit.length ? `cherche : ${crit.join(", ")}` : "",
        c.financement?.accordBanque ? "accord bancaire" : "",
        c.financement?.aVendre ? "a un bien à vendre" : "",
        c.prochaineAction ? `prochaine action : ${court(c.prochaineAction, 80)}` : "",
        c.dateRelance ? `relance : ${dateCourte(c.dateRelance)}${c.dateRelance < auj ? " (en retard)" : ""}` : "",
        c.dernierContact ? `dernier contact : ${dateCourte(c.dernierContact)}` : "",
        c.roles?.includes("prospect_vendeur") ? (c.optinTel ? "accord démarchage tél. : oui" : "accord démarchage tél. : non") : "",
      ].filter(Boolean);
      out.push("- " + f.join(" · "));
    }
  }

  // ---- Agenda 14 jours
  const prochains = rdvs
    .filter((r) => r.statut !== "annule" && r.debut.slice(0, 10) >= auj && r.debut.slice(0, 10) <= fin)
    .sort((a, b) => a.debut.localeCompare(b.debut))
    .slice(0, 50);
  if (prochains.length) {
    out.push(`\n## Rendez-vous des 14 prochains jours (${prochains.length})`);
    for (const r of prochains) {
      const b = biens.find((x) => x.id === r.bienId);
      const who = (r.contactIds ?? []).map((id) => prenom(byId.get(id))).join(", ");
      out.push(
        "- " +
          [`${dateCourte(r.debut)} ${heure(r.debut)}`, RDV_TYPE[r.type], r.titre ?? "", b ? `bien : ${b.titre}` : "", who ? `avec ${who}` : "", r.lieu ? `lieu : ${court(r.lieu, 60)}` : ""]
            .filter(Boolean)
            .join(" · ")
      );
    }
  }

  // ---- Estimations en cours
  const est = estimations.filter((e) => e.statut === "a_faire" || e.statut === "envoyee").slice(0, 20);
  if (est.length) {
    out.push(`\n## Estimations en cours (${est.length})`);
    for (const e of est) {
      out.push(
        "- " +
          [
            e.adresse,
            e.type,
            e.surface ? m2(e.surface) : "",
            e.pieces ? `${e.pieces} p.` : "",
            e.resultat ? `fourchette ${eurK(e.resultat.bas)}–${eurK(e.resultat.haut)}` : "",
            e.prixConseille ? `prix conseillé ${eurK(e.prixConseille)}` : "",
            e.statut === "a_faire" ? "à faire" : "envoyée",
            `créée le ${dateCourte(e.createdAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")
      );
    }
  }

  // ---- Tâches
  const td = taches
    .filter((t) => !t.fait)
    .sort((a, b) => (a.echeance ?? "9999").localeCompare(b.echeance ?? "9999"))
    .slice(0, 30);
  if (td.length) {
    out.push(`\n## Tâches à faire (${td.length})`);
    for (const t of td)
      out.push("- " + [t.titre, t.echeance ? `échéance ${dateCourte(t.echeance)}${t.echeance < auj ? " (en retard)" : ""}` : "", t.priorite === 1 ? "priorité haute" : ""].filter(Boolean).join(" · "));
  }

  const txt = out.join("\n");
  return txt.length > 30000 ? txt.slice(0, 30000) + "\n[…contexte tronqué]" : txt;
}

export const systemAssistant = () => `Tu es l'assistant personnel de ${nomConseiller()}, conseiller en vente chez PATRIM à Toulouse, dans son application PATRIM Hub.
Tu disposes ci-dessous d'un extrait à jour de ses données (biens, contacts, agenda, estimations, tâches). Appuie-toi dessus, cite les biens et les personnes par leur nom, et dis clairement quand une information n'y figure pas plutôt que de supposer.
Façon de répondre :
- En français, direct et concret, comme un collègue expérimenté. Commence par l'essentiel.
- Mise en forme simple : titres courts (###), listes, **gras** pour les points clés. Pas de tableaux.
- Pour une journée : ordre chronologique, priorités, relances à faire, préparation de chaque rendez-vous.
- Pour un rapprochement acquéreurs / bien : classe les acquéreurs, explique pourquoi en une ligne, signale les points bloquants, propose le message d'approche.
- Pour un mail ou un SMS à un client : rédige un brouillon prêt à copier (vouvoiement), sans rien inventer sur le bien ; tu ne peux rien envoyer toi-même.
- Pour un argumentaire de baisse de prix : appuie-toi sur les faits (durée de mise en vente, nombre de visites, retours, positionnement par rapport aux critères des acquéreurs), avec tact et empathie pour le vendeur.
- Pour une photo (DPE, annonce, document) : décris ce que tu lis, extrais les données utiles et signale ce qui est illisible.
- Démarchage téléphonique (prospection) : depuis le 11/08/2026, il faut l'accord préalable du particulier ; sans accord, propose un courrier, un mail ou un passage en boîte aux lettres.
- Dans tout contenu destiné à un client ou au public, ne révèle jamais l'identité ou la situation d'un vendeur, le montant d'une offre, une marge de négociation ou d'autres acquéreurs.`;
