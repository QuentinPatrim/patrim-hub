import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { cleServiceSupabase } from "@/lib/env";
import { stockerPhoto } from "@/lib/photos-server";
import { utilisateur } from "@/lib/auth-server";

/* POST /api/photos : une photo prise ou choisie sur le téléphone → Supabase Storage.
   Réservé à l'utilisateur connecté. Renvoie { url }. */

export const maxDuration = 30;

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return NextResponse.json({ error: "Stockage non configuré" }, { status: 501 });
  const user = await utilisateur(req);
  if (!user) return NextResponse.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });

  const { data } = (await req.json().catch(() => ({}))) as { data?: string };
  if (!data) return NextResponse.json({ error: "Image manquante" }, { status: 400 });
  try {
    const db = createClient(url, service, { auth: { persistSession: false } });
    const lien = await stockerPhoto(db, `${user.id}/${randomUUID()}.jpg`, data);
    return NextResponse.json({ url: lien });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Envoi impossible" }, { status: 500 });
  }
}
