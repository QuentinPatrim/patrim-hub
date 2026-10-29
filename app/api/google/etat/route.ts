import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { utilisateur } from "@/lib/auth-server";
import { cleServiceSupabase } from "@/lib/env";
import { googleConfigure } from "@/lib/google-server";

/* GET /api/google/etat : le compte Google de l'utilisateur est-il connecté ?
   DELETE : déconnecter (l'autorisation est aussi retirée chez Google). */

export const dynamic = "force-dynamic";

function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  return url && service ? createClient(url, service, { auth: { persistSession: false } }) : null;
}

export async function GET(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  const db = base();
  if (!db || !googleConfigure()) return NextResponse.json({ configure: false, connecte: false });
  const { data, error } = await db.from("hub_google").select("email,connecte_le,derniere_synchro").eq("user_id", u.id).maybeSingle();
  if (error) return NextResponse.json({ configure: false, connecte: false, aide: "Table hub_google absente : migration 0009 à appliquer." });
  const r = data as { email?: string; connecte_le?: string; derniere_synchro?: string } | null;
  return NextResponse.json({ configure: true, connecte: !!r, email: r?.email, connecteLe: r?.connecte_le, derniereSynchro: r?.derniere_synchro });
}

export async function DELETE(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Session expirée" }, { status: 401 });
  const db = base();
  if (!db) return NextResponse.json({ error: "Base non configurée" }, { status: 500 });
  const { data } = await db.from("hub_google").select("refresh_token").eq("user_id", u.id).maybeSingle();
  const rt = (data as { refresh_token?: string } | null)?.refresh_token;
  if (rt) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: "POST" }).catch(() => 0);
  await db.from("hub_google").delete().eq("user_id", u.id);
  return NextResponse.json({ ok: true });
}
