import { lireMailPortail } from "@/lib/leadsPortails";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";
import { cleServiceSupabase, secretSynchro } from "@/lib/env";
import { notifier } from "@/lib/push-server";
import { RDV_TYPE } from "@/lib/format";
import type { Bien, BienType, Contact, Rdv, RdvType, Source, Tache } from "@/lib/types";

/* Synchronisation Gmail + Agenda → Hub, commune au script Google (POST /api/sync, compte du titulaire)
   et à la connexion Google de chaque utilisateur (/api/google/synchro).
   - lead    : nouveau lead d'un portail → fiche contact + tâche « Rappeler »
   - reponse : réponse d'un client à un mail → historique du contact (+ RDV)
   - agenda  : événements Google Agenda des prochaines semaines → Agenda de l'appli ;
               en retour, les rendez-vous du Hub à créer dans Google Agenda (aCreer),
               reconnues ensuite grâce à la marque [hub:id] de leur description
   Protégé par un secret partagé (en-tête x-hub-secret). N'envoie jamais rien à un client. */


export type Lead = {
  nom?: string; email?: string; telephone?: string; portail?: string; type?: "bien" | "projet" | "estimation";
  adresse?: string; brut?: string; sujet?: string; // brut : texte d'un mail de portail que le script n'a pas su lire
  reference?: string; prix?: number; ville?: string; cp?: string; typeBien?: string; pieces?: number; surface?: string | number;
  message?: string; criteres?: Record<string, string>; recuLe?: string; sousOffre?: boolean;
};
type Reponse = { email?: string; nom?: string; resume?: string; date?: string; telephone?: string; rdv?: { debut: string; type?: string; lieu?: string; bien?: string } | null };
export type EvtAgenda = { id: string; titre: string; debut: string; fin?: string; lieu?: string; description?: string };
export type Payload = { compte?: string; brouillonsCrees?: string[]; leads?: Lead[]; reponses?: Reponse[]; agenda?: { de: string; a: string; evenements: EvtAgenda[] } };

type Row = { id: string; kind: string; data: Record<string, unknown> };

/** Id fixe (au format uuid) de la trace du passage du script Google pour un compte. */
export function idTraceScript(user: string) {
  const h = createHash("sha1").update(`script-google:${user}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type ResultatSynchro = { status: number; body: Record<string, unknown> };

/** Applique ce que Gmail et Google Agenda ont remonté pour un utilisateur ; renvoie aussi ce que Google doit créer. */
export async function traiterSynchro(db: SupabaseClient, user: string, p: Payload, opts: { brouillonLead?: boolean; google?: boolean } = {}): Promise<ResultatSynchro> {
  const { data: rows, error } = await db.from("hub_docs").select("id,kind,data").eq("user_id", user).in("kind", ["contacts", "rdvs", "biens", "taches"]).limit(20000);
  if (error) return { status: 500, body: { error: error.message } };
  const s = new Etat(rows ?? []);
  const bilan = { contactsCrees: 0, contactsMisAJour: 0, rdvs: 0, rdvsAnnules: 0, taches: 0 };

  for (const l of p.leads ?? []) traiterLead(s, l.type && (l.email || l.telephone) ? l : { ...l, ...(lireMailPortail(l.brut ?? "", l.sujet) ?? {}) }, bilan);
  for (const r of p.reponses ?? []) traiterReponse(s, r, bilan);
  if (p.agenda) traiterAgenda(s, p.agenda, bilan);

  const lignes = s.modifies().map((d) => ({ id: d.id, user_id: user, kind: d.kind, data: d.data, updated_at: new Date().toISOString() }));
  for (let i = 0; i < lignes.length; i += 500) {
    const { error: e } = await db.from("hub_docs").upsert(lignes.slice(i, i + 500));
    if (e) return { status: 500, body: { error: e.message, bilan } };
  }

  // Nouveaux leads récents : notification sur le téléphone du conseiller (jamais au client)
  const nouveaux = s
    .modifies()
    .filter((d) => d.kind === "contacts")
    .map((d) => d.data as unknown as Contact)
    .filter((c) => c.synchro === "gmail" && c.dateRelance === jour() && Date.now() - new Date(c.createdAt).getTime() < 10 * 60000);
  if (nouveaux.length)
    await notifier(db, user, {
      titre: nouveaux.length > 1 ? `${nouveaux.length} nouveaux leads` : `Nouveau lead : ${[nouveaux[0].prenom, nouveaux[0].nom].filter(Boolean).join(" ")}`,
      texte: nouveaux.length > 1 ? nouveaux.map((c) => [c.prenom, c.nom].filter(Boolean).join(" ")).join(", ") : (nouveaux[0].historique?.[0]?.texte ?? "").split("\n")[0] + (nouveaux[0].roles.includes("acquereur") && opts.brouillonLead !== false ? " · Brouillon prêt dans Gmail" : ""),
      url: nouveaux.length > 1 ? "/a-envoyer" : `/contacts/${nouveaux[0].id}`,
      tag: "lead",
    }).catch(() => 0);

  // Brouillons Gmail demandés depuis le Hub (avis de valeur en PDF) : le script les crée, puis confirme
  if (p.brouillonsCrees?.length) {
    const { data: faits } = await db.from("hub_docs").select("id,data").eq("user_id", user).eq("kind", "brouillon_mail").in("id", p.brouillonsCrees.slice(0, 20));
    for (const f of (faits ?? []) as { id: string; data: Record<string, unknown> }[]) {
      const { pdf: _pdf, ...reste } = f.data;
      await db.from("hub_docs").update({ data: { ...reste, statut: "cree", creeDansGmail: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", f.id);
    }
  }
  let brouillons: unknown[] | undefined;
  if (p.agenda && !opts.google) {
    const { data: aFaire } = await db.from("hub_docs").select("id,data").eq("user_id", user).eq("kind", "brouillon_mail").eq("data->>statut", "a_creer").order("updated_at").limit(2);
    brouillons = ((aFaire ?? []) as { id: string; data: Record<string, unknown> }[])
      .filter((b) => (p.brouillonsCrees ?? []).indexOf(b.id) === -1)
      .map((b) => ({ id: b.id, a: b.data.a, sujet: b.data.sujet, texte: b.data.texte, pdfNom: b.data.pdfNom, pdf: b.data.pdf }));
  }

  return { status: 200, body: { ok: true, bilan, ...(p.agenda ? { aCreer: aCreerDansGoogle(s), brouillons } : {}) } };
}

/** Rendez-vous du Hub (saisis dans l'appli ou réservés en ligne) pas encore dans Google Agenda : le script
    les crée avec la marque [hub:id]. Seulement dans la fenêtre que le script relit (29 jours), pour qu'il les retrouve. */
function aCreerDansGoogle(s: Etat) {
  const contacts = s.liste<Contact>("contacts");
  const biens = s.liste<Bien>("biens");
  const maintenant = Date.now();
  const tous = s.liste<Rdv & { reserveEnLigne?: string }>("rdvs");
  // Heures déjà occupées par un événement Google : un doublon saisi des deux côtés n'est pas recréé
  const google = new Set(tous.filter((r) => r.externalId && r.statut === "prevu").map((r) => Math.round(new Date(r.debut).getTime() / 60_000)));
  return tous
    .filter((r) => {
      const t = new Date(r.debut).getTime();
      return !r.externalId && r.statut === "prevu" && t > maintenant && t < maintenant + 29 * 86400_000 && !google.has(Math.round(t / 60_000));
    })
    .slice(0, 20)
    .map((r) => {
      const c = contacts.find((x) => r.contactIds?.includes(x.id));
      const b = biens.find((x) => x.id === r.bienId);
      return {
        hubId: r.id,
        titre: r.reserveEnLigne && c ? `Visite ${b?.titre ?? ""} · ${[c.prenom, c.nom].filter(Boolean).join(" ")}`.replace(/\s+/g, " ") : r.titre || [RDV_TYPE[r.type] ?? "Rendez-vous", c && [c.prenom, c.nom].filter(Boolean).join(" "), b?.titre].filter(Boolean).join(" · "),
        debut: r.debut,
        fin: r.fin ?? new Date(new Date(r.debut).getTime() + 45 * 60000).toISOString(),
        lieu: [b?.adresse, b?.ville].filter(Boolean).join(", "),
        description: [
          r.reserveEnLigne ? "Visite réservée en ligne depuis la page du bien (QR code)." : "Rendez-vous ajouté depuis PATRIM Hub.",
          c && [c.prenom, c.nom].filter(Boolean).join(" "),
          c?.tel && `Tél. ${c.tel}`,
          c?.email,
          r.reserveEnLigne && "La confirmation au visiteur t'attend dans « À envoyer » du Hub.",
          `[hub:${r.id}]`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    });
}

export async function trouverUtilisateur(db: SupabaseClient, compte?: string) {
  const { data } = await db.auth.admin.listUsers({ perPage: 100 });
  const users = data?.users ?? [];
  const voulu = (process.env.HUB_USER_EMAIL || compte || "").toLowerCase();
  const trouve = users.find((u) => u.email?.toLowerCase() === voulu) ?? (users.length === 1 ? users[0] : undefined);
  if (trouve) return trouve.id;
  // Plusieurs comptes (équipe) : les leads et l'agenda vont toujours au titulaire de l'appli
  const { data: t } = await db.from("hub_equipe").select("user_id").eq("role", "titulaire").limit(1).maybeSingle();
  return (t as { user_id: string } | null)?.user_id;
}

/* ---------- état en mémoire ---------- */
class Etat {
  private docs: Row[];
  private touches = new Set<string>();
  constructor(rows: Row[]) {
    this.docs = rows.map((r) => ({ ...r, data: { ...r.data, id: r.id } }));
  }
  liste<T>(kind: string) {
    return this.docs.filter((d) => d.kind === kind).map((d) => d.data as T);
  }
  creer<T extends object>(kind: string, data: T) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const d = { id, kind, data: { ...data, id, createdAt: now, updatedAt: now } as Record<string, unknown> };
    this.docs.push(d);
    this.touches.add(id);
    return d.data as T & { id: string; createdAt: string; updatedAt: string };
  }
  maj(id: string, patch: Record<string, unknown>) {
    const d = this.docs.find((x) => x.id === id);
    if (!d) return;
    d.data = { ...d.data, ...patch, id, updatedAt: new Date().toISOString() };
    this.touches.add(id);
  }
  modifies() {
    return this.docs.filter((d) => this.touches.has(d.id));
  }
}

/* ---------- leads ---------- */
const SOURCES: Record<string, Source> = { seloger: "seloger", leboncoin: "leboncoin", bienici: "bienici", "bien'ici": "bienici" };
const source = (portail?: string): Source => SOURCES[(portail || "").toLowerCase().replace(/[^a-z']/g, "")] ?? "autre";
const typeBien = (t?: string): BienType | undefined => {
  const x = (t || "").toLowerCase();
  if (x.includes("appart") || /^t\d|studio|duplex|loft/.test(x)) return "appartement";
  if (x.includes("maison") || x.includes("villa")) return "maison";
  if (x.includes("terrain")) return "terrain";
  if (x.includes("parking") || x.includes("garage")) return "parking";
  return undefined;
};
const nombre = (v?: string) => {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const jour = (iso?: string) => new Date(iso || Date.now()).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const dateFr = (iso?: string) => new Date(iso || Date.now()).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

function decouperNom(nom?: string) {
  const parts = (nom || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { prenom: undefined, nom: parts[0] || "" };
  return { prenom: parts.slice(0, -1).join(" "), nom: parts[parts.length - 1] };
}

function parEmail(s: Etat, email?: string) {
  const e = (email || "").trim().toLowerCase();
  return e ? s.liste<Contact>("contacts").find((c) => c.email?.trim().toLowerCase() === e) : undefined;
}

function traiterLead(s: Etat, l: Lead, bilan: Record<string, number>) {
  if (!l.type || (!l.email && !l.telephone)) return;
  const vendeur = l.type === "estimation";
  const date = l.recuLe ? new Date(l.recuLe).toISOString() : new Date().toISOString();
  const portail = l.portail || "portail";
  const bien = l.reference ? s.liste<Bien>("biens").find((b) => b.ref && b.ref.toLowerCase() === l.reference!.toLowerCase()) : undefined;
  const quoi =
    vendeur
      ? `demande d'estimation, ${[l.typeBien, l.pieces && `${l.pieces} p.`, l.surface && `${l.surface} m²`, l.adresse, l.ville].filter(Boolean).join(", ")}`
      : l.type === "projet"
      ? `projet de recherche${l.criteres?.["Type de bien"] ? " (" + l.criteres["Type de bien"] + ")" : ""}`
      : [l.typeBien, l.pieces && `${l.pieces} p.`, l.surface && `${l.surface} m²`, l.ville, l.prix && `${l.prix.toLocaleString("fr-FR")} €`, l.reference && `réf. ${l.reference}`].filter(Boolean).join(", ");
  const texte = `Lead ${portail} : ${quoi}${l.sousOffre ? " (bien sous offre)" : ""}${l.message ? `\n« ${l.message.slice(0, 600)} »` : ""}`;
  const entree = { date, type: "mail" as const, texte };
  const recent = Date.now() - new Date(date).getTime() < 3 * 86400000; // les anciens leads importés ne deviennent pas des relances du jour

  const existant = parEmail(s, l.email);
  if (existant) {
    if (existant.historique?.some((h) => h.date === date)) return; // déjà reçu
    s.maj(existant.id, {
      historique: [...(existant.historique ?? []), entree],
      dernierContact: date,
      ...(recent ? { dateRelance: jour(), prochaineAction: vendeur ? `Rappeler : demande d'estimation ${portail}` : `Rappeler : nouveau lead ${portail}` } : {}),
      roles: vendeur && !existant.roles.some((r) => r === "vendeur" || r === "prospect_vendeur") ? [...existant.roles, "prospect_vendeur"] : existant.roles,
      adresse: existant.adresse || (vendeur ? [l.adresse, l.cp, l.ville].filter(Boolean).join(" ") : undefined),
      bienOrigineId: existant.bienOrigineId ?? bien?.id,
      tel: existant.tel || l.telephone,
      synchro: "gmail",
    });
    bilan.contactsMisAJour++;
    return;
  }

  const t = typeBien(l.type === "projet" ? l.criteres?.["Type de bien"] : l.typeBien);
  const budget = l.type === "projet" ? nombre(l.criteres?.["Budget"]) : l.prix;
  const pieces = l.type === "projet" ? nombre(l.criteres?.["Nombre de pièces"]) : undefined;
  const { prenom, nom } = decouperNom(l.nom);
  const c = s.creer<Omit<Contact, "id" | "createdAt" | "updatedAt">>("contacts", {
    prenom,
    nom: nom || l.email || "Lead",
    email: l.email,
    tel: l.telephone,
    roles: vendeur ? ["prospect_vendeur"] : ["acquereur"],
    source: source(portail),
    etape: vendeur ? undefined : "nouveau",
    adresse: vendeur ? [l.adresse, l.cp, l.ville].filter(Boolean).join(" ") || undefined : undefined,
    chaleur: 2,
    criteres: vendeur ? undefined : { types: t ? [t] : undefined, budgetMax: budget, piecesMin: pieces, remarques: l.type === "projet" ? Object.entries(l.criteres ?? {}).map(([k, v]) => `${k} : ${v}`).join(" · ") : undefined },
    bienOrigineId: bien?.id,
    biensProposes: bien ? [bien.id] : undefined,
    dateRelance: recent ? jour() : undefined,
    prochaineAction: recent ? (vendeur ? `Rappeler : demande d'estimation ${portail} du ${dateFr(date)}` : `Rappeler : lead ${portail} du ${dateFr(date)}`) : `Lead ${portail} du ${dateFr(date)} : faire le point`,
    dernierContact: date,
    historique: [entree],
    synchro: "gmail",
  });
  bilan.contactsCrees++;

  // Tâche « Rappeler » seulement pour les leads récents (moins de 3 jours)
  if (recent) {
    const titre = `Rappeler ${[prenom, nom].filter(Boolean).join(" ") || l.email}`;
    if (!s.liste<Tache>("taches").some((x) => !x.fait && x.titre === titre)) {
      s.creer<Omit<Tache, "id" | "createdAt" | "updatedAt">>("taches", { titre, echeance: jour(), fait: false, priorite: 1, lien: { kind: "contact", id: c.id }, origine: "agent", detail: texte });
      bilan.taches++;
    }
  }
}

/* ---------- réponses clients ---------- */
function traiterReponse(s: Etat, r: Reponse, bilan: Record<string, number>) {
  if (!r.email) return;
  const date = r.date ? new Date(r.date).toISOString() : new Date().toISOString();
  let c: Contact | undefined = parEmail(s, r.email);
  if (!c) {
    const { prenom, nom } = decouperNom(r.nom);
    c = s.creer<Omit<Contact, "id" | "createdAt" | "updatedAt">>("contacts", { prenom, nom: nom || r.email, email: r.email, tel: r.telephone, roles: ["acquereur"], source: "autre", etape: "nouveau", chaleur: 2, historique: [], synchro: "gmail" });
    bilan.contactsCrees++;
  } else bilan.contactsMisAJour++;
  const ct = c;
  if (ct.historique?.some((h) => h.date === date)) return;

  const patch: Record<string, unknown> = {
    historique: [...(ct.historique ?? []), { date, type: "mail", texte: `Réponse du client : ${r.resume || "(voir Gmail)"}` }],
    dernierContact: date,
    chaleur: Math.max(ct.chaleur ?? 1, 2),
    synchro: "gmail",
  };
  if (r.telephone && !ct.tel) patch.tel = r.telephone;
  if (ct.etape === "nouveau") patch.etape = "qualifie";
  if (r.rdv?.debut) {
    const rdvType: RdvType = r.rdv.type === "appel" ? "appel" : "visite";
    if (rdvType === "visite" && (ct.etape === "nouveau" || ct.etape === "qualifie")) patch.etape = "visite";
    const deja = s.liste<Rdv>("rdvs").some((x) => x.debut === new Date(r.rdv!.debut).toISOString() && x.contactIds?.includes(ct.id));
    if (!deja) {
      s.creer<Omit<Rdv, "id" | "createdAt" | "updatedAt">>("rdvs", { type: rdvType, debut: new Date(r.rdv.debut).toISOString(), titre: r.rdv.bien, lieu: r.rdv.lieu, contactIds: [ct.id], statut: "prevu" });
      bilan.rdvs++;
    }
  }
  s.maj(ct.id, patch);
}

/* ---------- agenda ---------- */
function typeRdv(titre: string): RdvType {
  const t = titre.toLowerCase();
  if (t.includes("visite")) return "visite";
  if (t.includes("estimation") || t.includes("estim")) return "estimation";
  if (/signature|compromis|acte|promesse|notaire/.test(t)) return "signature";
  if (/rappeler|appel|répondre|tel\b|téléphone/.test(t)) return "appel";
  if (/vendeur|mandat|rdv/.test(t)) return "rdv_vendeur";
  return "autre";
}

function traiterAgenda(s: Etat, a: NonNullable<Payload["agenda"]>, bilan: Record<string, number>) {
  const contacts = s.liste<Contact>("contacts");
  const biens = s.liste<Bien>("biens");
  const rdvs = s.liste<Rdv>("rdvs");
  const vus = new Set<string>();
  const apparies = new Set<string>();

  for (const e of a.evenements ?? []) {
    if (!e.id || !e.debut || /^\[TEST\]/i.test(e.titre || "")) continue;
    vus.add(e.id);
    const titre = (e.titre || "").slice(0, 200);
    const texte = `${titre} ${e.description ?? ""}`.toLowerCase();
    const lies = contacts
      .filter((c) => (c.nom && c.nom.length > 2 && texte.includes(c.nom.toLowerCase())) || (c.email && texte.includes(c.email.toLowerCase())))
      .slice(0, 3)
      .map((c) => c.id);
    const bien = biens.find((b) => (b.ref && texte.includes(b.ref.toLowerCase())) || (b.titre && b.titre.length > 6 && texte.includes(b.titre.toLowerCase())));
    const data = {
      type: typeRdv(titre),
      debut: new Date(e.debut).toISOString(),
      fin: e.fin ? new Date(e.fin).toISOString() : undefined,
      titre,
      lieu: e.lieu || undefined,
      externalId: e.id,
      contactIds: lies.length ? lies : undefined,
      bienId: bien?.id,
    };
    // Visite créée par le Hub dans Google Agenda : retrouvée par sa marque [hub:id]
    const marque = /\[hub:([0-9a-f-]{36})\]/i.exec(e.description ?? "")?.[1];
    const t0 = new Date(e.debut).getTime();
    const existant =
      rdvs.find((r) => r.externalId === e.id) ??
      (marque ? rdvs.find((r) => r.id === marque) : undefined) ??
      // Même rendez-vous saisi à la main dans le Hub et dans Google : on les relie au lieu de le doubler
      rdvs.find((r) => !r.externalId && !apparies.has(r.id) && r.statut === "prevu" && Math.abs(new Date(r.debut).getTime() - t0) < 60_000);
    if (existant) {
      apparies.add(existant.id);
      const change = existant.externalId !== data.externalId || existant.debut !== data.debut || existant.titre !== data.titre || existant.lieu !== data.lieu || existant.fin !== data.fin;
      if (change || existant.statut === "annule") {
        s.maj(existant.id, { ...data, contactIds: existant.contactIds ?? data.contactIds, bienId: existant.bienId ?? data.bienId, statut: existant.statut === "annule" ? "prevu" : existant.statut });
        bilan.rdvs++;
      }
    } else {
      s.creer<Omit<Rdv, "id" | "createdAt" | "updatedAt">>("rdvs", { ...data, statut: "prevu" });
      bilan.rdvs++;
    }
  }

  // Événements supprimés de Google Agenda : RDV marqué annulé
  const de = new Date(a.de).getTime();
  const fin = new Date(a.a).getTime();
  for (const r of rdvs) {
    if (!r.externalId || vus.has(r.externalId) || apparies.has(r.id) || r.statut !== "prevu") continue;
    const t = new Date(r.debut).getTime();
    if (t >= de && t <= fin) {
      s.maj(r.id, { statut: "annule" });
      bilan.rdvsAnnules++;
    }
  }
}
