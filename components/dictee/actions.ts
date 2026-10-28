"use client";

/* Dictée vocale : ce que le conseiller dit en sortant d'un rendez-vous (« Rappeler
   M. Dupont jeudi », « nouveau prospect… », « visite samedi 10h au Gramond »)
   devient une liste d'actions à valider : note, relance, contact, rendez-vous, tâche.
   Rien n'est enregistré sans validation, rien n'est envoyé à un client. */

import { ask } from "@/lib/ai";
import { create, getAll, update } from "@/lib/store";
import { RDV_TYPE, nomComplet, today } from "@/lib/format";
import { titreGenerique } from "@/lib/titrePublic";
import type { BienType, Contact, ContactRole, RdvType } from "@/lib/types";

export type Action =
  | { type: "note"; contactId?: string; bienId?: string; texte: string }
  | { type: "relance"; contactId: string; date: string; quoi: string }
  | { type: "contact"; prenom?: string; nom: string; tel?: string; email?: string; role: ContactRole; criteres?: { types?: BienType[]; budgetMax?: number; surfaceMin?: number; piecesMin?: number; quartiers?: string[] }; notes?: string; relance?: string; optinTel?: boolean }
  | { type: "rdv"; rdvType: RdvType; debut: string; duree?: number; titre?: string; contactId?: string; bienId?: string; lieu?: string }
  | { type: "tache"; titre: string; echeance?: string; contactId?: string; bienId?: string };

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

export async function analyser(texte: string): Promise<Action[]> {
  const contacts = getAll("contacts");
  const biens = getAll("biens");
  const auj = today();
  const jour = JOURS[new Date(auj + "T12:00:00").getDay()];
  const annuaire = contacts
    .slice()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, 400)
    .map((c) => `${c.id} | ${nomComplet(c)} | ${c.roles.join(",")}`)
    .join("\n");
  const parc = biens.map((b) => `${b.id} | ${b.titre} | ${b.ref ?? ""} | ${titreGenerique(b)} | ${b.adresse ?? ""}`).join("\n");
  const r = await ask<{ actions: Action[] }>({
    json: true,
    effort: "low",
    system:
      "Tu transformes une note dictée par un conseiller immobilier en actions pour son agenda et son fichier. Tu n'inventes rien : chaque action vient de ce qui est dit. Tu relies les personnes et les biens cités à leurs identifiants quand le nom correspond clairement, sinon tu ne mets pas d'identifiant. Réponds uniquement en JSON.",
    prompt: `Aujourd'hui : ${jour} ${auj} (heure de Paris).

Contacts connus (id | nom | rôles) :
${annuaire || "(aucun)"}

Biens connus (id | titre | réf | résumé | adresse) :
${parc || "(aucun)"}

Note dictée :
"""${texte}"""

Réponds par {"actions": [...]} avec, au choix :
- {"type":"note","contactId"?,"bienId"?,"texte"} : information à garder sur une personne ou un bien connu (texte reformulé proprement, sans rien ajouter).
- {"type":"relance","contactId","date":"AAAA-MM-JJ","quoi":"Rappeler pour…"} : rappeler ou recontacter une personne connue à une date.
- {"type":"contact","prenom"?,"nom","tel"?,"email"?,"role":"acquereur"|"prospect_vendeur"|"vendeur"|"locataire"|"partenaire","criteres"?:{"types"?:["appartement"|"maison"|"terrain"|"local"|"immeuble"|"parking"],"budgetMax"?,"surfaceMin"?,"piecesMin"?,"quartiers"?},"notes"?,"relance"?:"AAAA-MM-JJ","optinTel"?:true seulement si la personne a dit accepter d'être appelée} : nouvelle personne qui n'est pas dans les contacts.
- {"type":"rdv","rdvType":"visite"|"estimation"|"appel"|"signature"|"rdv_vendeur"|"autre","debut":"AAAA-MM-JJTHH:MM","duree"?:minutes,"titre"?,"contactId"?,"bienId"?,"lieu"?} : rendez-vous avec une date et une heure.
- {"type":"tache","titre","echeance"?:"AAAA-MM-JJ","contactId"?,"bienId"?} : chose à faire sans rendez-vous.
Dates relatives (« jeudi », « demain », « dans 15 jours ») calculées depuis aujourd'hui. Sans heure dite, pas de rendez-vous : une tâche ou une relance.`,
  });
  const actions = r.json?.actions;
  if (!Array.isArray(actions)) throw new Error("Je n'ai pas compris la note. Reformule ou complète-la.");
  const idsContacts = new Set(contacts.map((c) => c.id));
  const idsBiens = new Set(biens.map((b) => b.id));
  // Identifiants inconnus retirés : on ne rattache jamais au hasard
  return actions
    .map((a) => {
      const x = { ...a } as Action & { contactId?: string; bienId?: string };
      if (x.contactId && !idsContacts.has(x.contactId)) delete x.contactId;
      if (x.bienId && !idsBiens.has(x.bienId)) delete x.bienId;
      return x as Action;
    })
    .filter((a) => (a.type === "relance" ? !!a.contactId && /^\d{4}-\d{2}-\d{2}$/.test(a.date) : a.type === "rdv" ? !isNaN(new Date(a.debut).getTime()) : true));
}

const nomContact = (id?: string) => {
  const c = id ? getAll("contacts").find((x) => x.id === id) : undefined;
  return c ? nomComplet(c) : undefined;
};
const nomBien = (id?: string) => (id ? getAll("biens").find((b) => b.id === id)?.titre : undefined);
const dateFr = (d?: string) => (d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");

/** Libellé d'une action pour l'écran de validation. */
export function decrire(a: Action): { titre: string; detail: string } {
  switch (a.type) {
    case "note":
      return { titre: `Note${nomContact(a.contactId) ? ` sur ${nomContact(a.contactId)}` : nomBien(a.bienId) ? ` sur ${nomBien(a.bienId)}` : " (à rattacher)"}`, detail: a.texte };
    case "relance":
      return { titre: `Relance ${nomContact(a.contactId)} ${dateFr(a.date)}`, detail: a.quoi };
    case "contact":
      return {
        titre: `Nouveau contact : ${[a.prenom, a.nom].filter(Boolean).join(" ")}`,
        detail: [a.tel, a.email, a.criteres?.budgetMax ? `budget ${a.criteres.budgetMax.toLocaleString("fr-FR")} €` : "", a.criteres?.quartiers?.join(", "), a.notes, a.relance ? `à relancer ${dateFr(a.relance)}` : ""].filter(Boolean).join(" · "),
      };
    case "rdv": {
      const h = new Date(a.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");
      return { titre: `${RDV_TYPE[a.rdvType] ?? "Rendez-vous"} ${dateFr(a.debut)} à ${h}`, detail: [a.titre, nomContact(a.contactId), nomBien(a.bienId), a.lieu].filter(Boolean).join(" · ") };
    }
    case "tache":
      return { titre: `À faire${a.echeance ? ` ${dateFr(a.echeance)}` : ""}`, detail: [a.titre, nomContact(a.contactId), nomBien(a.bienId)].filter(Boolean).join(" · ") };
  }
}

/** Enregistre une action validée. Renvoie la page où la retrouver. */
export function appliquer(a: Action): string {
  const maintenant = new Date().toISOString();
  const noteContact = (c: Contact, texte: string, type: "note" | "appel" = "note") => update("contacts", c.id, { historique: [...(c.historique ?? []), { date: maintenant, type, texte }] });
  switch (a.type) {
    case "note": {
      const c = a.contactId ? getAll("contacts").find((x) => x.id === a.contactId) : undefined;
      if (c) {
        noteContact(c, a.texte);
        return `/contacts/${c.id}`;
      }
      const b = a.bienId ? getAll("biens").find((x) => x.id === a.bienId) : undefined;
      if (b) {
        update("biens", b.id, { notes: [b.notes, `${today().split("-").reverse().join("/")} : ${a.texte}`].filter(Boolean).join("\n") });
        return `/biens/${b.id}`;
      }
      create("taches", { titre: a.texte, fait: false, origine: "moi", echeance: today() });
      return "/";
    }
    case "relance": {
      const c = getAll("contacts").find((x) => x.id === a.contactId);
      if (!c) return "/contacts";
      update("contacts", c.id, { dateRelance: a.date, prochaineAction: a.quoi });
      noteContact(c, `Relance prévue le ${a.date.split("-").reverse().join("/")} : ${a.quoi}`);
      return `/contacts/${c.id}`;
    }
    case "contact": {
      const c = create("contacts", {
        prenom: a.prenom,
        nom: a.nom,
        tel: a.tel,
        email: a.email,
        roles: [a.role],
        source: "autre",
        etape: a.role === "acquereur" ? "nouveau" : undefined,
        criteres: a.criteres,
        notes: a.notes,
        dateRelance: a.relance,
        optinTel: a.optinTel || undefined,
        optinTelDate: a.optinTel ? maintenant : undefined,
        historique: [{ date: maintenant, type: "note", texte: "Créé par dictée vocale" }],
      });
      return `/contacts/${c.id}`;
    }
    case "rdv": {
      const debut = new Date(a.debut);
      const fin = new Date(debut.getTime() + (a.duree ?? (a.rdvType === "appel" ? 15 : 60)) * 60000);
      create("rdvs", {
        type: a.rdvType,
        debut: debut.toISOString(),
        fin: fin.toISOString(),
        titre: a.titre,
        contactIds: a.contactId ? [a.contactId] : undefined,
        bienId: a.bienId,
        lieu: a.lieu,
        statut: "prevu",
      });
      return "/agenda";
    }
    case "tache": {
      create("taches", { titre: a.titre, echeance: a.echeance, fait: false, origine: "moi", lien: a.contactId ? { kind: "contact", id: a.contactId } : a.bienId ? { kind: "bien", id: a.bienId } : undefined });
      return "/";
    }
  }
}
