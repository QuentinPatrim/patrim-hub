import { NextResponse } from "next/server";
import { cleClaude, cleServiceSupabase } from "@/lib/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { analyser, resumeCourt, type Donnees } from "@/lib/briefing";
import { complete, parseJson } from "@/lib/ai-server";
import type { Briefing, Kind } from "@/lib/types";
import { notifier } from "@/lib/push-server";

/* Agent de nuit, lancé chaque matin par Vercel Cron (voir vercel.json).
   Pour chaque utilisateur : analyse le portefeuille, crée les tâches du jour
   et écrit le briefing du matin. Ne contacte jamais un client. */

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  const db = createClient(url, service, { auth: { persistSession: false } });

  const { data: rows, error } = await db.from("hub_docs").select("id,user_id,kind,data").limit(20000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Prénom de chaque membre de l'équipe, pour signer ses SMS
  const { data: equipe } = await db.from("hub_equipe").select("user_id,prenom");
  const prenoms = new Map((equipe ?? []).map((m: { user_id: string; prenom: string }) => [m.user_id, m.prenom]));

  const parUser = new Map<string, Donnees & { briefings: Briefing[] }>();
  for (const r of rows ?? []) {
    const d = parUser.get(r.user_id) ?? { biens: [], contacts: [], rdvs: [], estimations: [], taches: [], briefings: [] };
    const list = (d as unknown as Record<string, unknown[]>)[r.kind as Kind];
    if (list) list.push({ ...r.data, id: r.id });
    parUser.set(r.user_id, d);
  }

  const now = new Date();
  const date = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const bilan: { user: string; points: number; taches: number }[] = [];

  for (const [user, d] of parUser) {
    if (d.briefings.some((b) => b.date === date)) continue; // déjà fait aujourd'hui
    const a = analyser(d, now);
    let resume = resumeCourt(a);
    const prenom = prenoms.get(user) || "Quentin";

    // Mot du matin + messages de relance prêts à envoyer, rédigés par Claude
    if (cleClaude() && a.points.length) {
      try {
        const relances = a.points.filter((p) => p.type === "relance" && p.lien?.kind === "contact").slice(0, 5);
        const contexte = relances.map((p) => {
          const c = d.contacts.find((x) => x.id === p.lien!.id);
          return { id: p.lien!.id, prenom: c?.prenom, nom: c?.nom, criteres: c?.criteres, prochaineAction: c?.prochaineAction, dernierEchange: c?.historique?.slice(-2) };
        });
        const txt = await complete({
          smart: true,
          effort: "medium",
          maxTokens: 3000,
          system: `Tu es l'agent de nuit de ${prenom}. Tu prépares sa journée.`,
          messages: [{
            role: "user",
            content: `Points détectés cette nuit :\n${JSON.stringify(a.points.map((p) => ({ type: p.type, titre: p.titre, detail: p.detail })))}\n\nContacts à relancer :\n${JSON.stringify(contexte)}\n\nRéponds en JSON : {"resume": "3 phrases max : les priorités du jour, dans l'ordre", "messages": [{"id": "<id du contact>", "sms": "SMS de relance court, vouvoiement, signé ${prenom} – PATRIM"}]}`,
          }],
        });
        const j = parseJson<{ resume?: string; messages?: { id: string; sms: string }[] }>(txt);
        if (j?.resume) resume = j.resume;
        j?.messages?.forEach((m) => {
          const p = a.points.find((x) => x.lien?.id === m.id);
          if (p && m.sms) p.detail = `${p.detail ? p.detail + "\n" : ""}SMS proposé : « ${m.sms} »`;
        });
      } catch {
        /* le briefing reste valable sans l'IA */
      }
    }

    const iso = now.toISOString();
    const docs = [
      { id: randomUUID(), user_id: user, kind: "briefings", data: { date, resume, points: a.points, createdAt: iso, updatedAt: iso }, updated_at: iso },
      ...a.nouvellesTaches.map((t) => ({ id: randomUUID(), user_id: user, kind: "taches", data: { ...t, createdAt: iso, updatedAt: iso }, updated_at: iso })),
    ];
    const ins = await db.from("hub_docs").insert(docs);
    bilan.push({ user, points: a.points.length, taches: ins.error ? -1 : a.nouvellesTaches.length });
    // Briefing prêt : notification discrète (sans son), lue au réveil
    if (!ins.error && a.points.length) await notifier(db, user, { titre: "Ta journée est prête", texte: resumeCourt(a), url: "/", tag: "briefing", discret: true }).catch(() => 0);
  }
  return NextResponse.json({ ok: true, date, bilan });
}
