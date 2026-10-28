import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { cleServiceSupabase } from "@/lib/env";
import { notifier } from "@/lib/push-server";

/* POST /api/b/:id : « Demander une visite » depuis la page web d'un bien (QR vitrine).
   Crée une fiche acquéreur chez le conseiller qui a publié la page, à rappeler aujourd'hui,
   et le prévient sur son téléphone. Rien n'est envoyé au visiteur. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  const userId = (page as { user_id: string }).user_id;
  const titre = String(((page as { data: { titre?: string } }).data ?? {}).titre ?? "le bien");
  const { data: bien } = await db.from("hub_docs").select("id").eq("user_id", userId).eq("kind", "biens").eq("data->pageWeb->>id", id).maybeSingle();

  // Pas plus de 20 demandes par heure sur une même page (protection contre les envois en masse)
  const uneHeure = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("hub_docs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", "contacts").eq("data->>pageWebId", id).gte("updated_at", uneHeure);
  if ((count ?? 0) >= 20) return NextResponse.json({ error: "Trop de demandes pour le moment, appelez l'agence au 05 61 99 08 08." }, { status: 429 });

  const maintenant = new Date().toISOString();
  const jour = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const contactId = randomUUID();
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
    prochaineAction: "Répondre à la demande de visite",
    dateRelance: jour,
    notes: message || undefined,
    historique: [{ date: maintenant, type: "note", texte: `Demande de visite depuis la page web (QR vitrine) pour « ${titre} »${b?.rappel === true ? ", accepte d'être rappelé par téléphone" : ""}${message ? ` : ${message}` : ""}` }],
  };
  const { error } = await db.from("hub_docs").insert({ id: contactId, user_id: userId, kind: "contacts", data: contact, updated_at: maintenant });
  if (error) return NextResponse.json({ error: "Envoi impossible, appelez l'agence au 05 61 99 08 08." }, { status: 500 });
  await notifier(db, userId, { titre: "Demande de visite", texte: `${[prenom, nom].filter(Boolean).join(" ")} pour ${titre}`, url: `/contacts/${contactId}`, tag: `visite-${contactId}` }).catch(() => 0);
  return NextResponse.json({ ok: true });
}
