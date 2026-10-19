import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { utilisateur } from "@/lib/auth-server";
import { cleServiceSupabase } from "@/lib/env";

/* /api/mandats/numero : compteur de mandats partagé par toute l'agence.
   GET  → { numero, prochains } : le prochain numéro à attribuer, et les
          deux suivants (aperçu), sans rien consommer.
   POST → { numero } : réserve atomiquement le prochain numéro. Deux
          demandes simultanées (Quentin, Julien, Clément…) obtiennent
          deux numéros différents, quel que soit le compte.
   Le compteur ne repart jamais à 1, même d'une année sur l'autre. */

export const dynamic = "force-dynamic";

async function base() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return null;
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const db = await base();
  if (!db) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { data, error } = await db.from("hub_compteurs").select("valeur").eq("cle", "mandat").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const dernier = (data as { valeur: number } | null)?.valeur ?? 0;
  return NextResponse.json({ numero: dernier + 1, prochains: [dernier + 2, dernier + 3] });
}

export async function POST(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const db = await base();
  if (!db) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const { data, error } = await db.rpc("hub_prochain_numero", { p_cle: "mandat" });
  if (error || data == null) return NextResponse.json({ error: error?.message ?? "Numéro indisponible" }, { status: 500 });
  return NextResponse.json({ numero: Number(data) });
}
