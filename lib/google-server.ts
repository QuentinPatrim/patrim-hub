import { createHmac, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lireMailPortail, lireSeLoger } from "./leadsPortails";
import { idTraceScript, traiterSynchro, type EvtAgenda, type Lead } from "./synchro";

/* Connexion Google de chaque utilisateur (Réglages > « Connecter mon compte Google ») :
   brouillons Gmail, leads des portails relevés dans sa boîte et Google Agenda ↔ Hub.
   Application OAuth « interne » au Workspace patrim.fr. Les autorisations restent côté serveur
   (table hub_google, sans aucun accès depuis le navigateur). Rien n'est jamais envoyé à un client :
   le Hub ne crée que des brouillons. */

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

const id = () => (process.env.GOOGLE_CLIENT_ID || "").trim();
const secret = () => (process.env.GOOGLE_CLIENT_SECRET || "").trim();
export const googleConfigure = () => !!id() && !!secret();

export const urlRetour = (req: Request) => `${new URL(req.url).origin}/api/google/retour`;

/* ---------- état signé (qui demande la connexion) ---------- */
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const signe = (x: string) => createHmac("sha256", secret()).update(x).digest("base64url");

export function etatSigne(userId: string) {
  const corps = b64(JSON.stringify({ u: userId, exp: Date.now() + 10 * 60_000 }));
  return `${corps}.${signe(corps)}`;
}

export function lireEtat(etat: string): string | null {
  const [corps, sig] = etat.split(".");
  if (!corps || !sig) return null;
  const attendu = Buffer.from(signe(corps));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(corps, "base64url").toString()) as { u: string; exp: number };
    return exp > Date.now() ? u : null;
  } catch {
    return null;
  }
}

export function urlAutorisation(req: Request, userId: string, email?: string) {
  const p = new URLSearchParams({
    client_id: id(),
    redirect_uri: urlRetour(req),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: etatSigne(userId),
    hd: "patrim.fr",
  });
  if (email) p.set("login_hint", email);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/* ---------- jetons ---------- */
export async function echangerCode(req: Request, code: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: id(), client_secret: secret(), redirect_uri: urlRetour(req), grant_type: "authorization_code" }),
  });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(j.error_description || "Google a refusé la connexion.");
  let email: string | undefined;
  try {
    email = (JSON.parse(Buffer.from((j.id_token ?? "").split(".")[1] ?? "", "base64url").toString()) as { email?: string }).email;
  } catch {}
  return { ...j, email };
}

export class PasConnecte extends Error {}

/** Jeton d'accès de l'utilisateur, renouvelé à partir de son autorisation enregistrée. */
export async function jeton(db: SupabaseClient, userId: string) {
  const { data } = await db.from("hub_google").select("refresh_token").eq("user_id", userId).maybeSingle();
  const rt = (data as { refresh_token?: string } | null)?.refresh_token;
  if (!rt) throw new PasConnecte("Compte Google non connecté.");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: rt, client_id: id(), client_secret: secret(), grant_type: "refresh_token" }),
  });
  const j = (await r.json()) as { access_token?: string; error?: string };
  if (j.error === "invalid_grant") {
    // Autorisation retirée côté Google : on l'oublie, la carte des Réglages repropose « Connecter »
    await db.from("hub_google").delete().eq("user_id", userId);
    throw new PasConnecte("La connexion Google a expiré : reconnecte ton compte dans Réglages.");
  }
  if (!j.access_token) throw new Error("Google ne répond pas, réessaie dans un instant.");
  return j.access_token;
}

async function g<T>(at: string, url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${at}`, ...(init.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message || `Google : erreur ${r.status}`);
  return j;
}

/* ---------- Gmail : brouillons ---------- */
export type Signature = { nom?: string; titre?: string; tel?: string; mail?: string };

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mot = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);
const lignes64 = (b: string) => b.replace(/.{1,76}/g, "$&\r\n");

function signatureHtml(s: Signature, logo: string) {
  const gris = (t: string, gras = false) => `<div><font face="arial, sans-serif" color="#666666">${gras ? `<b>${echapper(t)}</b>` : echapper(t)}</font></div>`;
  return [
    s.nom && gris(s.nom, true),
    `<div><img src="${logo}" alt="Patrim" width="200" height="85"></div>`,
    gris("Patrim", true),
    gris("45, Allées Jean Jaurès"),
    gris("31000 TOULOUSE"),
    gris("05.61.99.08.08"),
    s.tel && s.tel.replace(/\D/g, "") !== "0561990808" && gris(s.tel.replace(/\s/g, ".")),
  ]
    .filter(Boolean)
    .join("");
}

/** Crée un brouillon (jamais envoyé) dans le Gmail de l'utilisateur. Renvoie l'id du brouillon. */
export async function creerBrouillon(
  at: string,
  m: { a: string; sujet: string; texte: string; signature: Signature; logo: string; pieces?: { nom: string; type: string; base64: string }[] }
) {
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px">` +
    m.texte
      .split(/\n\s*\n/)
      .map((p) => `<p>${echapper(p).replace(/\n/g, "<br>")}</p>`)
      .join("") +
    `</div><div>${signatureHtml(m.signature, m.logo)}</div>`;
  const texte = `${m.texte}\n\n${[m.signature.nom, "Patrim", "45, Allées Jean Jaurès", "31000 TOULOUSE", "05.61.99.08.08", m.signature.tel].filter(Boolean).join("\n")}`;
  const f1 = `mix_${Date.now().toString(36)}`;
  const f2 = `alt_${Date.now().toString(36)}`;
  const parties = [
    `--${f1}`,
    `Content-Type: multipart/alternative; boundary="${f2}"`,
    "",
    `--${f2}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lignes64(Buffer.from(texte).toString("base64")),
    `--${f2}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    lignes64(Buffer.from(html).toString("base64")),
    `--${f2}--`,
    ...(m.pieces ?? []).flatMap((p) => [
      `--${f1}`,
      `Content-Type: ${p.type}; name="${mot(p.nom)}"`,
      `Content-Disposition: attachment; filename="${mot(p.nom)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      lignes64(p.base64),
    ]),
    `--${f1}--`,
  ];
  const brut = [
    m.a ? `To: ${m.a}` : "",
    `Subject: ${mot(m.sujet)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${f1}"`,
    "",
    ...parties,
  ]
    .filter((l, i) => i > 0 || l)
    .join("\r\n");
  const r = await g<{ id: string }>(at, "https://gmail.googleapis.com/upload/gmail/v1/users/me/drafts?uploadType=media", {
    method: "POST",
    headers: { "content-type": "message/rfc822" },
    body: brut,
  });
  return r.id;
}

/* ---------- Gmail : leads des portails ---------- */
type Partie = { mimeType?: string; body?: { data?: string }; parts?: Partie[] };
type Message = { id: string; internalDate?: string; payload?: Partie & { headers?: { name: string; value: string }[] } };

const decoder = (d?: string) => (d ? Buffer.from(d, "base64url").toString("utf8") : "");
function trouver(p: Partie | undefined, type: string): string {
  if (!p) return "";
  if (p.mimeType === type && p.body?.data) return decoder(p.body.data);
  for (const x of p.parts ?? []) {
    const t = trouver(x, type);
    if (t) return t;
  }
  return "";
}
/** Texte d'un mail : la partie texte, sinon le HTML aplati en gardant les liens (mailto:, tel:). */
function texteMail(p: Partie | undefined) {
  const t = trouver(p, "text/plain");
  if (t) return t;
  return trouver(p, "text/html")
    .replace(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, " $2 $1 ")
    .replace(/<(br|\/p|\/div|\/tr|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, " ");
}
const portail = (from: string) => (/seloger/i.test(from) ? "SeLoger" : /leboncoin/i.test(from) ? "Leboncoin" : /bienici/i.test(from) ? "Bien'ici" : /logic-immo/i.test(from) ? "Logic-Immo" : "portail");

export async function leadsGmail(at: string, periode = "newer_than:2d"): Promise<Lead[]> {
  const q = `from:(lead.seloger.com OR leboncoin.fr OR bienici.com OR logic-immo.com) ${periode}`;
  const liste = await g<{ messages?: { id: string }[] }>(at, `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&q=${encodeURIComponent(q)}`);
  const leads: Lead[] = [];
  for (const { id: mid } of liste.messages ?? []) {
    const m = await g<Message>(at, `https://gmail.googleapis.com/gmail/v1/users/me/messages/${mid}?format=full`);
    const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    const corps = texteMail(m.payload);
    const sujet = h("subject");
    const base = lireSeLoger(corps, sujet);
    const l: Lead = base.type && base.email ? (base as Lead) : { ...(lireMailPortail(corps, sujet) ?? {}) };
    if (!l.type) continue;
    l.recuLe = new Date(Number(m.internalDate) || Date.now()).toISOString();
    l.portail = portail(h("from"));
    leads.push(l);
  }
  return leads;
}

/* ---------- Agenda ---------- */
type EvtGoogle = { iCalUID?: string; id: string; summary?: string; location?: string; description?: string; status?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string } };

export async function evenements(at: string, de: Date, a: Date): Promise<EvtAgenda[]> {
  const out: EvtAgenda[] = [];
  let page: string | undefined;
  do {
    const p = new URLSearchParams({ timeMin: de.toISOString(), timeMax: a.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    if (page) p.set("pageToken", page);
    const r = await g<{ items?: EvtGoogle[]; nextPageToken?: string }>(at, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`);
    for (const e of r.items ?? []) {
      if (e.status === "cancelled" || !e.start?.dateTime) continue; // journées entières ignorées, comme le script
      const debut = new Date(e.start.dateTime);
      // Même identifiant que le script Google (iCalUID + heure) : les deux chemins reconnaissent les mêmes rendez-vous
      out.push({ id: `${e.iCalUID ?? e.id}_${debut.getTime()}`, titre: e.summary ?? "", debut: debut.toISOString(), fin: e.end?.dateTime ? new Date(e.end.dateTime).toISOString() : undefined, lieu: e.location ?? "", description: (e.description ?? "").slice(0, 1500) });
    }
    page = r.nextPageToken;
  } while (page);
  return out;
}

export async function creerEvenement(at: string, e: { titre: string; debut: string; fin: string; lieu?: string; description?: string }) {
  await g(at, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ summary: e.titre, location: e.lieu || undefined, description: e.description || undefined, start: { dateTime: e.debut }, end: { dateTime: e.fin }, reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }] } }),
  });
}

/* ---------- synchro complète d'un utilisateur ---------- */
export async function synchroGoogle(db: SupabaseClient, userId: string) {
  const at = await jeton(db, userId);
  const de = new Date(Date.now() - 86400_000);
  const a = new Date(Date.now() + 30 * 86400_000);
  const [leads, evts] = await Promise.all([leadsGmail(at).catch(() => [] as Lead[]), evenements(at, de, a)]);
  const r = await traiterSynchro(db, userId, { leads, agenda: { de: de.toISOString(), a: a.toISOString(), evenements: evts } }, { brouillonLead: false, google: true });
  const aCreer = (r.body.aCreer as { hubId: string; titre: string; debut: string; fin: string; lieu?: string; description?: string }[] | undefined) ?? [];
  const deja = evts.map((e) => e.description ?? "").join("\n");
  // Si le script Google du même compte tourne (passage il y a moins de 15 min), c'est lui qui crée les événements
  const { data: script } = await db.from("hub_docs").select("data").eq("id", idTraceScript(userId)).maybeSingle();
  const le = (script as { data?: { le?: string } } | null)?.data?.le;
  const scriptActif = !!le && Date.now() - new Date(le).getTime() < 15 * 60_000;
  let crees = 0;
  for (const v of scriptActif ? [] : aCreer) {
    if (deja.includes(`[hub:${v.hubId}]`)) continue;
    await creerEvenement(at, v);
    crees++;
  }
  await db.from("hub_google").update({ derniere_synchro: new Date().toISOString() }).eq("user_id", userId);
  return { ...(r.body.bilan as Record<string, number>), evenementsCrees: crees, leads: leads.length };
}
