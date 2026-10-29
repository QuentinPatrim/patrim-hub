import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleServiceSupabase, secretSynchro } from "@/lib/env";
import { traiterSynchro, trouverUtilisateur, type Payload } from "@/lib/synchro";

/* POST /api/sync : reçoit ce que le script Google (Gmail + Agenda) du titulaire envoie.
   Le traitement lui-même est dans lib/synchro.ts. Protégé par un secret partagé (en-tête x-hub-secret).
   N'envoie jamais rien à un client. */

export const maxDuration = 60;

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

  // Trace du passage du script : la connexion Google du même compte lui laisse alors la création des événements
  await db.from("hub_docs").upsert({ id: `script-google-${user}`, kind: "synchro_script", user_id: user, data: { le: new Date().toISOString() }, updated_at: new Date().toISOString() });
  const r = await traiterSynchro(db, user, p);
  return NextResponse.json(r.body, { status: r.status });
}
