import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleServiceSupabase } from "@/lib/env";
import { notifier } from "@/lib/push-server";

/* /api/r/:id : questionnaire de retour de visite, ouvert par le visiteur sans compte.
   GET : le bien et la date (rien d'autre). POST : enregistre la réponse, une seule fois,
   et prévient le conseiller. Ne lit et n'écrit que les documents « retour ». */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max) : "");
const RESSENTIS = ["enthousiaste", "positif", "mitige", "negatif"];
const SUITES = ["offre", "seconde_visite", "reflexion", "pas_interesse"];

function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = cleServiceSupabase();
  return url && cle ? createClient(url, cle, { auth: { persistSession: false } }) : null;
}

async function lire(id: string) {
  const db = base();
  if (!db || !UUID.test(id)) return null;
  const { data } = await db.from("hub_docs").select("id,user_id,data").eq("id", id).eq("kind", "retour").maybeSingle();
  return data ? { db, row: data as { id: string; user_id: string; data: Record<string, unknown> } } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const x = await lire((await params).id);
  if (!x) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  const d = x.row.data;
  return NextResponse.json({ titre: d.titre, date: d.date, conseiller: d.conseiller, deja: !!d.reponse }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const x = await lire((await params).id);
  if (!x) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  if (x.row.data.reponse) return NextResponse.json({ error: "Votre avis a déjà été enregistré, merci !" }, { status: 409 });
  const b = await req.json().catch(() => ({}));
  const note = Number(b?.note);
  const reponse = {
    note: note >= 1 && note <= 5 ? Math.round(note) : undefined,
    ressenti: RESSENTIS.includes(b?.ressenti) ? b.ressenti : undefined,
    positifs: txt(b?.positifs, 500) || undefined,
    negatifs: txt(b?.negatifs, 500) || undefined,
    suite: SUITES.includes(b?.suite) ? b.suite : undefined,
    message: txt(b?.message, 800) || undefined,
    recu: new Date().toISOString(),
  };
  if (!reponse.note && !reponse.suite && !reponse.positifs && !reponse.negatifs && !reponse.message) return NextResponse.json({ error: "Donnez au moins une note ou un mot." }, { status: 400 });
  const { error } = await x.db.from("hub_docs").update({ data: { ...x.row.data, reponse }, updated_at: reponse.recu }).eq("id", x.row.id);
  if (error) return NextResponse.json({ error: "Enregistrement impossible, réessayez." }, { status: 500 });
  await notifier(x.db, x.row.user_id, {
    titre: "Retour de visite",
    texte: `${String(x.row.data.titre)}${reponse.note ? ` : ${reponse.note}/5` : ""}${reponse.suite === "offre" ? ", veut faire une offre !" : reponse.suite === "seconde_visite" ? ", veut revisiter" : ""}`,
    url: "/agenda",
    tag: `retour-${x.row.id}`,
  }).catch(() => 0);
  return NextResponse.json({ ok: true });
}
