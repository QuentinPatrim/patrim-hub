import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleServiceSupabase } from "@/lib/env";
import { utilisateur } from "@/lib/auth-server";
import { clePubliqueVapid, notifier } from "@/lib/push-server";

/* GET  /api/push : clé publique pour abonner le téléphone (vide si les notifications ne sont pas configurées).
   POST /api/push : notification d'essai sur les appareils du conseiller connecté. */

export async function GET() {
  return NextResponse.json({ cle: clePubliqueVapid() ?? null });
}

export async function POST(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Connecte-toi pour tester les notifications." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service || !clePubliqueVapid()) return NextResponse.json({ error: "Les notifications ne sont pas encore configurées sur le serveur." }, { status: 500 });
  const db = createClient(url, service, { auth: { persistSession: false } });
  const n = await notifier(db, u.id, { titre: "Notifications activées", texte: "Tu seras prévenu ici des nouveaux leads et du briefing du matin.", url: "/a-envoyer", tag: "essai" });
  if (!n) return NextResponse.json({ error: "Aucun appareil n'a reçu la notification. Réactive-les sur ce téléphone." }, { status: 404 });
  return NextResponse.json({ ok: true, appareils: n });
}
