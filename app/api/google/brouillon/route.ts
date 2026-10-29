import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { utilisateur } from "@/lib/auth-server";
import { cleServiceSupabase } from "@/lib/env";
import { PasConnecte, creerBrouillon, jeton, type Signature } from "@/lib/google-server";

/* POST /api/google/brouillon { id, signature } : le mail préparé dans le Hub (ligne hub_docs
   « brouillon_mail », avec son PDF) devient tout de suite un brouillon dans le Gmail de
   l'utilisateur. Jamais envoyé : il relit et appuie lui-même sur Envoyer. */

export const maxDuration = 60;

export async function POST(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Session expirée, reconnecte-toi." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return NextResponse.json({ error: "Base non configurée" }, { status: 500 });
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { id, signature } = (await req.json().catch(() => ({}))) as { id?: string; signature?: Signature };
  if (!id) return NextResponse.json({ error: "Brouillon introuvable" }, { status: 400 });
  const { data } = await db.from("hub_docs").select("id,data").eq("id", id).eq("user_id", u.id).eq("kind", "brouillon_mail").maybeSingle();
  const b = (data as { data: Record<string, string> } | null)?.data;
  if (!b) return NextResponse.json({ error: "Brouillon introuvable" }, { status: 404 });
  if (b.statut === "cree") return NextResponse.json({ ok: true });
  try {
    const at = await jeton(db, u.id);
    await creerBrouillon(at, {
      a: b.a || "",
      sujet: b.sujet || "Avis de valeur",
      texte: b.texte || "",
      signature: signature ?? {},
      logo: `${new URL(req.url).origin}/logo-patrim.png`,
      pieces: b.pdf ? [{ nom: b.pdfNom || "Avis de valeur.pdf", type: "application/pdf", base64: b.pdf }] : [],
    });
    const { pdf: _pdf, ...reste } = b;
    await db.from("hub_docs").update({ data: { ...reste, statut: "cree", creeDansGmail: new Date().toISOString(), par: "google" }, updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Pas connecté : la ligne reste « à créer », le script Google du titulaire la reprendra s'il tourne
    return NextResponse.json({ error: e instanceof Error ? e.message : "Brouillon impossible", pasConnecte: e instanceof PasConnecte }, { status: e instanceof PasConnecte ? 409 : 502 });
  }
}
