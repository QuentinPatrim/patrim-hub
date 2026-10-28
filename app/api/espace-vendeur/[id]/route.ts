import { NextResponse } from "next/server";
import { cleServiceSupabase } from "@/lib/env";

/* GET /api/espace-vendeur/:id : espace vendeur, ouvert par le propriétaire sans compte.
   Ne lit que les documents « vendeur » (préparés par le conseiller, sans nom de visiteur
   ni d'acquéreur). Aucun autre document n'est accessible par cette route. */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = cleServiceSupabase();
  if (!UUID.test(id)) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  if (!url || !cle) return NextResponse.json({ error: "Espace indisponible" }, { status: 503 });
  try {
    const r = await fetch(`${url}/rest/v1/hub_docs?id=eq.${id}&kind=eq.vendeur&select=data&limit=1`, {
      headers: { apikey: cle, authorization: `Bearer ${cle}` },
      cache: "no-store",
    });
    const rows = r.ok ? ((await r.json()) as { data: unknown }[]) : [];
    if (!rows.length) return NextResponse.json({ error: "Espace introuvable ou lien coupé" }, { status: 404 });
    return NextResponse.json({ espace: rows[0].data }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Espace indisponible" }, { status: 503 });
  }
}
