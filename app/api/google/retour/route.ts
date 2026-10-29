import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cleServiceSupabase } from "@/lib/env";
import { echangerCode, lireEtat } from "@/lib/google-server";

/* GET /api/google/retour : Google revient ici après l'autorisation. L'autorisation est rangée
   côté serveur (hub_google), puis retour aux Réglages. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const vers = (etat: string) => NextResponse.redirect(new URL(`/reglages?google=${etat}#google`, u.origin));
  const userId = lireEtat(u.searchParams.get("state") || "");
  const code = u.searchParams.get("code");
  if (!userId || !code) return vers(u.searchParams.get("error") === "access_denied" ? "refus" : "erreur");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return vers("erreur");
  try {
    const j = await echangerCode(req, code);
    if (!j.refresh_token) return vers("erreur");
    const db = createClient(url, service, { auth: { persistSession: false } });
    const { error } = await db.from("hub_google").upsert({ user_id: userId, email: j.email ?? null, refresh_token: j.refresh_token, scopes: j.scope ?? null, connecte_le: new Date().toISOString() });
    return vers(error ? "erreur" : "ok");
  } catch {
    return vers("erreur");
  }
}
