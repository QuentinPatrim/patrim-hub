import { createClient } from "@supabase/supabase-js";

/** Utilisateur connecté (jeton Supabase dans l'en-tête Authorization), ou null. Côté serveur uniquement. */
export async function utilisateur(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anon || !token) return null;
  const { data } = await createClient(url, anon, { auth: { persistSession: false } }).auth.getUser(token);
  return data.user ?? null;
}
