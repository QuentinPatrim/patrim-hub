import { NextResponse } from "next/server";
import { cleClaude, cleServiceSupabase, secretSynchro } from "@/lib/env";

/* GET /api/sante : vérifie que la base et les clés sont en place (aucune donnée renvoyée). */
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let base: "ok" | "table_absente" | "non_configuree" | "erreur" = "non_configuree";
  if (url && key) {
    try {
      const r = await fetch(`${url}/rest/v1/hub_docs?select=id&limit=1`, { headers: { apikey: key, authorization: `Bearer ${key}` }, cache: "no-store" });
      base = r.ok ? "ok" : r.status === 404 ? "table_absente" : "erreur";
    } catch {
      base = "erreur";
    }
  }
  return NextResponse.json({
    base,
    cleClaude: !!cleClaude(),
    agentDeNuit: !!cleServiceSupabase() && !!process.env.CRON_SECRET,
    synchroGmail: !!secretSynchro() && !!cleServiceSupabase(),
  });
}
