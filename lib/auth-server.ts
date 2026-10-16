import { createClient } from "@supabase/supabase-js";
import { cleServiceSupabase } from "./env";

/** Utilisateur connecté (jeton Supabase dans l'en-tête Authorization), ou null. Côté serveur uniquement. */
export async function utilisateur(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return null;
  const { data } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  return data.user ?? null;
}

/** Rôle d'un compte dans l'équipe (titulaire, responsable, collegue), lu avec la clé serveur. */
export async function roleEquipe(userId: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return null;
  const { data } = await createClient(url, service, { auth: { persistSession: false } }).from("hub_equipe").select("role").eq("user_id", userId).maybeSingle();
  return (data as { role: string } | null)?.role ?? null;
}
