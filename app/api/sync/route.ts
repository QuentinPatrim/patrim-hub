import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { cleServiceSupabase, secretSynchro } from "@/lib/env";
import type { Bien, BienType, Contact, Rdv, RdvType, Source, Tache } from "@/lib/types";

/* POST /api/sync : reçoit ce que le script Google (Gmail + Agenda) envoie.
   - lead    : nouveau lead d'un portail → fiche contact + tâche « Rappeler »
   - reponse : réponse d'un client à un mail → historique du contact (+ RDV)
   - agenda  : événements Google Agenda des prochaines semaines → Agenda de l'appli
   Protégé par un secret partagé (en-tête x-hub-secret). N'envoie jamais rien à un client. */

export const maxDuration = 60;

type Lead = {
  nom?: string; email?: string; telephone?: string; portail?: string; type?: "bien" | "projet";
  reference?: string; prix?: number; ville?: string; cp?: string; typeBien?: string; pieces?: number; surface?: string | number;
  message?: string; criteres?: Record<string, string>; recuLe?: string; sousOffre?: boolean;
};
type Reponse = { email?: string; nom?: string; resume?: string; date?: string; telephone?: string; rdv?: { debut: string; type?: string; lieu?: string; bien?: string } | null };
type EvtAgenda = { id: string; titre: string; debut: string; fin?: string; lieu?: string; description?: string };
type Payload = { compte?: string; leads?: Lead[]; reponses?: Reponse[]; agenda?: { de: string; a: string; evenements: EvtAgenda[] } };

type Row = { id: string; kind: string; data: Record<string, unknown> };

export async function POST(req: Request) {
  const secret = secretSynchro();
  // Tolère les espaces, guillemets ou backticks restés au copier-coller depuis un téléphone
  const net = (v: string | null | undefined) => (v ?? "").replace(/^HUB_SECRET\s*[:=]\s*/i, "").replace(/[\s`'"«»]/g, "");
  const recu = net(req.headers.get("x-hub-secret"));
  if (!secret || recu !== net(secret))
    return NextResponse.json({ error: "Non autorisé", aide: `Code reçu : ${recu.length} caractères, attendu : ${net(secret).length}.` }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const db = createClient(url, service, { auth: { persistSession: false } });

  let p: Payload;
  try {
    p = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const user = await trouverUtilisateur(db, p.compte);
  if (!user) return NextResponse.json({ error: "Aucun compte dans l'appli" }, { status: 404 });

  const { data: rows, error } = await db.from("hub_docs").select("id,kind,data").eq("user_id", user).in("kind", ["contacts", "rdvs", "biens", "taches"]).limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const s = new Etat(rows ?? []);
  const bilan = { contactsCrees: 0, contactsMisAJour: 0, rdvs: 0, rdvsAnnules: 0, taches: 0 };

  for (const l of p.leads ?? []) traiterLead(s, l, bilan);
  for (const r of p.reponses ?? []) traiterReponse(s, r, bilan);
  if (p.agenda) traiterAgenda(s, p.agenda, bilan);

  const lignes = s.modifies().map((d) => ({ id: d.id, user_id: user, kind: d.kind, data: d.data, updated_at: new Date().toISOString() }));
  for (let i = 0; i < lignes.length; i += 500) {
    const { error: e } = await db.from("hub_docs").upsert(lignes.slice(i, i + 500));
    if (e) return NextResponse.json({ error: e.message, bilan }, { status: 500 });
  }
  return NextResponse.json({ ok: true, bilan });
}

async function trouverUtilisateur(db: SupabaseClient, compte?: string) {
  const { data } = await db.auth.admin.listUsers({ perPage: 100 });
  const users = data?.users ?? [];
  const voulu = (process.env.HUB_USER_EMAIL || compte || "").toLowerCase();
  return (users.find((u) => u.email?.toLowerCase() === voulu) ?? (users.length === 1 ? users[0] : undefined))?.id;
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
  if (!l.email && !l.telephone) return;
  const date = l.recuLe ? new Date(l.recuLe).toISOString() : new Date().toISOString();
  const portail = l.portail || "portail";
  const bien = l.reference ? s.liste<Bien>("biens").find((b) => b.ref && b.ref.toLowerCase() === l.reference!.toLowerCase()) : undefined;
  const quoi =
    l.type === "projet"
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
      ...(recent ? { dateRelance: jour(), prochaineAction: `Rappeler : nouveau lead ${portail}` } : {}),
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
    roles: ["acquereur"],
    source: source(portail),
    etape: "nouveau",
    chaleur: 2,
    criteres: { types: t ? [t] : undefined, budgetMax: budget, piecesMin: pieces, remarques: l.type === "projet" ? Object.entries(l.criteres ?? {}).map(([k, v]) => `${k} : ${v}`).join(" · ") : undefined },
    bienOrigineId: bien?.id,
    biensProposes: bien ? [bien.id] : undefined,
    dateRelance: recent ? jour() : undefined,
    prochaineAction: recent ? `Rappeler : lead ${portail} du ${dateFr(date)}` : `Lead ${portail} du ${dateFr(date)} : faire le point`,
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
    const existant = rdvs.find((r) => r.externalId === e.id);
    if (existant) {
      const change = existant.debut !== data.debut || existant.titre !== data.titre || existant.lieu !== data.lieu || existant.fin !== data.fin;
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
    if (!r.externalId || vus.has(r.externalId) || r.statut !== "prevu") continue;
    const t = new Date(r.debut).getTime();
    if (t >= de && t <= fin) {
      s.maj(r.id, { statut: "annule" });
      bilan.rdvsAnnules++;
    }
  }
}
