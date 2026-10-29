import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { cleServiceSupabase } from "@/lib/env";
import { notifier } from "@/lib/push-server";
import { creneauxDispo, type Dispo } from "@/components/visites/disponibilites";

/* GET /api/b/:id : créneaux de visite encore libres (les disponibilités du conseiller et les
   créneaux ajoutés sur ce bien, moins ceux qui chevauchent un rendez-vous de son agenda, Google
   Agenda compris). Seules les heures sont données.
   POST /api/b/:id : « Demander une visite » depuis la page web d'un bien (QR vitrine).
   Crée une fiche acquéreur chez le conseiller qui a publié la page, à rappeler aujourd'hui,
   et le prévient sur son téléphone. Avec un créneau choisi, la visite est posée dans son
   agenda et la confirmation au visiteur l'attend dans « À envoyer ». Rien n'est envoyé au visiteur. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Db = SupabaseClient;
type Page = { user_id: string; data: { titre?: string; disponible?: boolean; creneaux?: string[]; dureeVisite?: number; sansDispo?: boolean } };

/** Créneaux proposés, à venir (2 h au moins) et sans rendez-vous qui les chevauche. */
async function creneauxLibres(db: Db, page: Page) {
  let dispo: Dispo | undefined;
  if (page.data.disponible !== false && !page.data.sansDispo) {
    const { data } = await db.from("hub_docs").select("data").eq("user_id", page.user_id).eq("kind", "dispo").order("updated_at", { ascending: false }).limit(1);
    dispo = (data?.[0] as { data: Dispo } | undefined)?.data;
  }
  const minutes = page.data.dureeVisite ?? (dispo?.actif ? dispo.duree : undefined) ?? 45;
  const duree = minutes * 60_000;
  const tot = Date.now() + 2 * 3600_000;
  const proposes = [...new Set([...(page.data.creneaux ?? []), ...creneauxDispo(dispo)])].filter((c) => new Date(c).getTime() > tot).sort();
  if (!proposes.length) return { libres: [] as string[], minutes };
  const de = new Date(new Date(proposes[0]).getTime() - 86400_000).toISOString();
  const a = new Date(new Date(proposes[proposes.length - 1]).getTime() + 86400_000).toISOString();
  const { data } = await db.from("hub_docs").select("data").eq("user_id", page.user_id).eq("kind", "rdvs").gte("data->>debut", de).lte("data->>debut", a);
  const pris = ((data ?? []) as { data: { debut?: string; fin?: string; statut?: string } }[])
    .map((r) => r.data)
    .filter((r) => r.debut && r.statut !== "annule")
    .map((r) => {
      const d = new Date(r.debut!).getTime();
      return [d, r.fin ? new Date(r.fin).getTime() : d + 3600_000] as const;
    });
  // 15 minutes de battement autour de chaque rendez-vous pour le trajet
  const libres = proposes.filter((c) => {
    const d = new Date(c).getTime();
    return !pris.some(([x, y]) => d < y + 15 * 60_000 && d + duree > x - 15 * 60_000);
  });
  return { libres, minutes };
}

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = cleServiceSupabase();
  if (!UUID.test(id) || !url || !cle) return NextResponse.json({ creneaux: [] });
  const db = createClient(url, cle, { auth: { persistSession: false } });
  const { data: page } = await db.from("hub_docs").select("user_id,data").eq("id", id).eq("kind", "partage").maybeSingle();
  if (!page) return NextResponse.json({ creneaux: [] });
  const p = page as Page;
  const { libres, minutes } = await creneauxLibres(db, p);
  return NextResponse.json({ creneaux: libres, duree: minutes }, { headers: { "cache-control": "no-store" } });
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max) : "");

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = cleServiceSupabase();
  if (!UUID.test(id)) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  if (!url || !cle) return NextResponse.json({ error: "Service indisponible, appelez l'agence au 05 61 99 08 08." }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  if (txt(b?.site, 200)) return NextResponse.json({ ok: true }); // champ piège rempli par les robots
  const prenom = txt(b?.prenom, 60);
  const nom = txt(b?.nom, 80);
  const tel = txt(b?.tel, 30).replace(/[^\d+ .]/g, "");
  const email = txt(b?.email, 120).toLowerCase();
  const message = txt(b?.message, 1000);
  if (!nom && !prenom) return NextResponse.json({ error: "Indiquez votre nom." }, { status: 400 });
  if (tel.replace(/\D/g, "").length < 9 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Indiquez un téléphone ou un e-mail pour que nous puissions vous répondre." }, { status: 400 });

  const db = createClient(url, cle, { auth: { persistSession: false } });
  const { data: page } = await db.from("hub_docs").select("user_id,data").eq("id", id).eq("kind", "partage").maybeSingle();
  if (!page) return NextResponse.json({ error: "Cette annonce n'est plus en ligne." }, { status: 404 });
  const userId = (page as Page).user_id;
  const titre = String((page as Page).data?.titre ?? "le bien");
  const creneau = txt(b?.creneau, 40);
  const libre = creneau ? await creneauxLibres(db, page as Page) : undefined;
  if (creneau && !libre!.libres.includes(creneau)) return NextResponse.json({ error: "Ce créneau vient d'être pris. Choisissez-en un autre.", pris: true }, { status: 409 });
  const { data: bien } = await db.from("hub_docs").select("id").eq("user_id", userId).eq("kind", "biens").eq("data->pageWeb->>id", id).maybeSingle();

  // Pas plus de 20 demandes par heure sur une même page (protection contre les envois en masse)
  const uneHeure = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("hub_docs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "contacts").eq("data->>pageWebId", id).gte("updated_at", uneHeure);
  if ((count ?? 0) >= 20) return NextResponse.json({ error: "Trop de demandes pour le moment, appelez l'agence au 05 61 99 08 08." }, { status: 429 });

  const maintenant = new Date().toISOString();
  const jour = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const contactId = randomUUID();
  const quand = creneau ? new Date(creneau).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h") : "";
  const contact = {
    id: contactId,
    createdAt: maintenant,
    updatedAt: maintenant,
    prenom,
    nom: nom || prenom,
    tel: tel || undefined,
    email: email || undefined,
    roles: ["acquereur"],
    source: "vitrine",
    etape: "nouveau",
    chaleur: 2,
    bienOrigineId: (bien as { id: string } | null)?.id,
    pageWebId: id,
    optinTel: b?.rappel === true ? true : undefined,
    optinTelDate: b?.rappel === true ? maintenant : undefined,
    prochaineAction: creneau ? `Confirmer la visite du ${quand}` : "Répondre à la demande de visite",
    dateRelance: creneau ? undefined : jour,
    notes: message || undefined,
    historique: [{ date: maintenant, type: "note", texte: `${creneau ? `Visite réservée en ligne le ${quand}` : "Demande de visite"} depuis la page web (QR vitrine) pour « ${titre} »${b?.rappel === true ? ", accepte d'être rappelé par téléphone" : ""}${message ? ` : ${message}` : ""}` }],
  };
  const { error } = await db.from("hub_docs").insert({ id: contactId, user_id: userId, kind: "contacts", data: contact, updated_at: maintenant });
  if (error) return NextResponse.json({ error: "Envoi impossible, appelez l'agence au 05 61 99 08 08." }, { status: 500 });
  if (creneau) {
    const rdvId = randomUUID();
    const debut = new Date(creneau);
    const rdv = {
      id: rdvId,
      createdAt: maintenant,
      updatedAt: maintenant,
      type: "visite",
      debut: debut.toISOString(),
      fin: new Date(debut.getTime() + (libre?.minutes ?? 45) * 60_000).toISOString(),
      titre: `Visite ${titre} (réservée en ligne)`,
      bienId: (bien as { id: string } | null)?.id,
      contactIds: [contactId],
      statut: "prevu",
      reserveEnLigne: maintenant,
    };
    const { error: e2 } = await db.from("hub_docs").insert({ id: rdvId, user_id: userId, kind: "rdvs", data: rdv, updated_at: maintenant });
    if (e2) return NextResponse.json({ error: "Réservation impossible, appelez l'agence au 05 61 99 08 08." }, { status: 500 });
    await notifier(db, userId, { titre: "Visite réservée", texte: `${[prenom, nom].filter(Boolean).join(" ")}, ${quand}, ${titre}`, url: "/agenda", tag: `visite-${contactId}` }).catch(() => 0);
    return NextResponse.json({ ok: true, quand });
  }
  await notifier(db, userId, { titre: "Demande de visite", texte: `${[prenom, nom].filter(Boolean).join(" ")} pour ${titre}`, url: `/contacts/${contactId}`, tag: `visite-${contactId}` }).catch(() => 0);
  return NextResponse.json({ ok: true });
}
