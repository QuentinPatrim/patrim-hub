import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { utilisateur } from "@/lib/auth-server";
import { cleServiceSupabase } from "@/lib/env";
import { PasConnecte, synchroGoogle } from "@/lib/google-server";

/* POST /api/google/synchro : relève les leads des portails dans le Gmail de l'utilisateur et
   synchronise son Google Agenda avec l'agenda du Hub (dans les deux sens). Lancé par l'appli
   ouverte (toutes les 5 minutes au plus) et chaque nuit par l'agent de nuit. */

export const maxDuration = 60;

export async function POST(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return NextResponse.json({ error: "Base non configurée" }, { status: 500 });
  const db = createClient(url, service, { auth: { persistSession: false } });
  try {
    return NextResponse.json({ ok: true, bilan: await synchroGoogle(db, u.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Synchronisation impossible", pasConnecte: e instanceof PasConnecte }, { status: e instanceof PasConnecte ? 409 : 502 });
  }
}
