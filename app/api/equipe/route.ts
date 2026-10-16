import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "crypto";
import { roleEquipe, utilisateur } from "@/lib/auth-server";
import { cleServiceSupabase } from "@/lib/env";

/* /api/equipe : accès de l'équipe au Hub. Réservé au titulaire (Quentin).
   GET  → membres (prénom, nom, rôle, e-mail)
   POST { email, prenom, nom, role, tel? }  → crée le compte (ou lui donne un nouveau mot de passe)
        et renvoie un mot de passe provisoire, affiché une seule fois à Quentin.
   N'envoie aucun e-mail : c'est Quentin qui transmet le mot de passe. */

export const dynamic = "force-dynamic";

const ROLES = ["responsable", "collegue"] as const;

async function admin(req: Request) {
  const u = await utilisateur(req);
  if (!u) return { erreur: NextResponse.json({ error: "Connexion requise" }, { status: 401 }) };
  if ((await roleEquipe(u.id)) !== "titulaire") return { erreur: NextResponse.json({ error: "Réservé au titulaire de l'appli." }, { status: 403 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return { erreur: NextResponse.json({ error: "Supabase non configuré" }, { status: 500 }) };
  return { u, db: createClient(url, service, { auth: { persistSession: false } }) };
}

/** Mot de passe provisoire lisible : 3 syllabes + 4 chiffres, ex. « Ralomi-4821 ». */
function motDePasse() {
  const c = "bcdfghjklmnprstvz";
  const v = "aeiou";
  let s = "";
  for (let i = 0; i < 3; i++) s += c[randomInt(c.length)] + v[randomInt(v.length)];
  return s.charAt(0).toUpperCase() + s.slice(1) + "-" + String(randomInt(1000, 10000));
}

export async function GET(req: Request) {
  const a = await admin(req);
  if ("erreur" in a) return a.erreur;
  const { data: membres } = await a.db.from("hub_equipe").select("user_id,role,prenom,nom,titre,tel");
  const { data: users } = await a.db.auth.admin.listUsers({ perPage: 200 });
  const mails = new Map((users?.users ?? []).map((x) => [x.id, x.email ?? ""]));
  return NextResponse.json({ membres: (membres ?? []).map((m) => ({ ...m, email: mails.get(m.user_id) ?? "" })) });
}

export async function POST(req: Request) {
  const a = await admin(req);
  if ("erreur" in a) return a.erreur;
  let b: { email?: string; prenom?: string; nom?: string; role?: string; tel?: string; titre?: string };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Demande illisible" }, { status: 400 });
  }
  const email = (b.email ?? "").trim().toLowerCase();
  const role = ROLES.find((r) => r === b.role);
  if (!/^[^@\s]+@patrim\.fr$/.test(email)) return NextResponse.json({ error: "Il faut une adresse @patrim.fr." }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Rôle inconnu." }, { status: 400 });
  if (email === a.u.email?.toLowerCase()) return NextResponse.json({ error: "C'est ton propre compte." }, { status: 400 });

  const password = motDePasse();
  const { data: liste } = await a.db.auth.admin.listUsers({ perPage: 200 });
  const existant = liste?.users.find((x) => x.email?.toLowerCase() === email);
  let id = existant?.id;
  if (existant) {
    const { error } = await a.db.auth.admin.updateUserById(existant.id, { password });
    if (error) return NextResponse.json({ error: "Le mot de passe n'a pas pu être changé." }, { status: 500 });
  } else {
    const { data, error } = await a.db.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return NextResponse.json({ error: "Le compte n'a pas pu être créé." }, { status: 500 });
    id = data.user.id;
  }
  const { error: e } = await a.db.from("hub_equipe").upsert({
    user_id: id,
    role,
    prenom: (b.prenom ?? "").trim().slice(0, 40),
    nom: (b.nom ?? "").trim().slice(0, 40),
    titre: (b.titre ?? "Conseiller en vente").trim().slice(0, 60),
    tel: (b.tel ?? "").trim().slice(0, 20) || null,
  });
  if (e) return NextResponse.json({ error: "Le compte existe, mais son rôle n'a pas pu être enregistré." }, { status: 500 });
  return NextResponse.json({ ok: true, email, password, nouveau: !existant });
}
