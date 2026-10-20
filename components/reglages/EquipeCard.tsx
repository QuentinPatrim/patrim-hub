"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Mail, Share2, UserPlus, Users } from "lucide-react";
import { Badge, Card, Field, Spinner } from "@/components/ui";
import { authHeaders } from "@/lib/ai";
import { ROLE_EQUIPE, useMoi, type Membre, type RoleEquipe } from "@/lib/equipe";
import { cloudEnabled } from "@/lib/supabase";

/* Réglages : accès de l'équipe au Hub.
   Le titulaire (Quentin) crée les accès ; l'appli n'envoie rien :
   elle affiche le mot de passe provisoire et prépare le message. */

type Prevu = { prenom: string; nom: string; email: string; role: Exclude<RoleEquipe, "titulaire"> };
const PREVUS: Prevu[] = [
  { prenom: "Julien", nom: "Passerini", email: "julien.passerini@patrim.fr", role: "responsable" },
  { prenom: "Clément", nom: "Monti", email: "clement.monti@patrim.fr", role: "collegue" },
];

type Acces = { email: string; password: string; prenom: string; nouveau: boolean };

export function EquipeCard() {
  const moi = useMoi();
  const [membres, setMembres] = useState<Membre[] | null>(null);
  const [form, setForm] = useState<Prevu & { tel: string }>({ ...PREVUS[0], tel: "" });
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [acces, setAcces] = useState<Acces | null>(null);
  const [copie, setCopie] = useState(false);

  const charger = useCallback(async () => {
    const r = await fetch("/api/equipe", { headers: await authHeaders(), cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setMembres(j.membres ?? []);
    else setErr(j.error || "L'équipe n'a pas pu être chargée.");
  }, []);

  useEffect(() => {
    if (cloudEnabled && moi.role === "titulaire" && moi.userId) void charger();
  }, [moi.role, moi.userId, charger]);

  if (!cloudEnabled) return null;

  if (moi.role !== "titulaire") {
    return (
      <Card title="Ton accès">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center size-11 shrink-0 rounded-xl bg-surface-2 ring-1 ring-inset ring-line/80"><Users size={19} /></span>
          <div className="text-sm">
            <div className="font-medium">{ROLE_EQUIPE[moi.role].label}</div>
            <p className="text-muted">
              {moi.role === "responsable"
                ? "Tu vois les biens, les propriétaires et les estimations de toute l'équipe. Les acquéreurs, prospects, rendez-vous et tâches de chacun restent sur son compte."
                : "Tu vois tes propres fiches (biens, contacts, estimations) et les biens que Quentin te partage. Ce que tu rentres reste sur ton compte."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const autres = (membres ?? []).filter((m) => m.user_id !== moi.userId);
  const choisir = (p: Prevu) => {
    const m = autres.find((x) => x.email?.toLowerCase() === p.email);
    setForm({ ...p, tel: m?.tel ?? "" });
    setAcces(null);
    setErr("");
    setOuvert(true);
  };

  async function creer() {
    setBusy(true);
    setErr("");
    setAcces(null);
    try {
      const r = await fetch("/api/equipe", { method: "POST", headers: await authHeaders(), body: JSON.stringify(form) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "L'accès n'a pas pu être créé.");
      setAcces({ email: j.email, password: j.password, prenom: form.prenom, nouveau: j.nouveau });
      await charger();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "L'accès n'a pas pu être créé.");
    } finally {
      setBusy(false);
    }
  }

  const lien = typeof window !== "undefined" ? window.location.origin : "";
  const message = acces
    ? `Salut ${acces.prenom},\n\nTon accès au PATRIM Hub est prêt :\n${lien}\nIdentifiant : ${acces.email}\nMot de passe provisoire : ${acces.password}\n\nUne fois connecté, change-le dans Réglages > Compte.\n\nQuentin`
    : "";

  return (
    <Card title="Équipe">
      <p className="text-sm text-muted">Tes acquéreurs, tes prospects, les leads des portails, ton agenda et tes tâches restent toujours sur ton seul compte.</p>

      <div className="mt-3 -mx-1 space-y-1">
        {PREVUS.map((p) => {
          const m = autres.find((x) => x.email?.toLowerCase() === p.email);
          const sansEmail = autres.some((x) => !x.email && `${x.prenom} ${x.nom}`.toLowerCase() === `${p.prenom} ${p.nom}`.toLowerCase());
          return (

            <button key={p.email} onClick={() => choisir(p)} className="w-full min-h-[52px] flex items-center gap-3 rounded-2xl px-1 py-2 text-left hover:bg-surface-2 transition">
              <span className="grid place-items-center size-10 shrink-0 rounded-xl bg-surface-2 ring-1 ring-inset ring-line/80 text-sm font-semibold">{p.prenom[0]}{p.nom[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {p.prenom} {p.nom} <Badge tone={m || sansEmail ? "ok" : "neutral"}>{m || sansEmail ? "Accès créé" : "Pas encore d'accès"}</Badge>
                </span>
                <span className="block text-xs text-muted">{ROLE_EQUIPE[p.role].label} · {ROLE_EQUIPE[p.role].detail}</span>
              </span>
            </button>
          );
        })}
        {autres
          .filter((m) => !PREVUS.some((p) => p.email === m.email?.toLowerCase() || (!m.email && `${p.prenom} ${p.nom}`.toLowerCase() === `${m.prenom} ${m.nom}`.toLowerCase())))
          .map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 px-1 py-2 text-sm">
              <span className="grid place-items-center size-10 shrink-0 rounded-xl bg-surface-2 ring-1 ring-inset ring-line/80 font-semibold">{(m.prenom[0] ?? "") + (m.nom[0] ?? "")}</span>
              <span className="flex-1">{m.prenom} {m.nom} · {ROLE_EQUIPE[m.role].label}</span>
            </div>
          ))}
      </div>

      {ouvert && (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface-2/60 p-3 ring-1 ring-inset ring-line/60">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Prénom"><input className="input" value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} /></Field>
            <Field label="Nom"><input className="input" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></Field>
          </div>
          <Field label="E-mail"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Portable" hint="Affiché sur ses documents et ses messages. Vide : le numéro de l'agence.">
            <input className="input" type="tel" inputMode="tel" placeholder="06 12 34 56 78" value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} />
          </Field>
          <p className="text-xs text-muted">{ROLE_EQUIPE[form.role].label} : {ROLE_EQUIPE[form.role].detail}</p>
          <button className="btn-primary w-full" onClick={creer} disabled={busy}>
            {busy ? <Spinner /> : autres.some((x) => x.email?.toLowerCase() === form.email.toLowerCase()) ? <KeyRound size={16} /> : <UserPlus size={16} />}
            {autres.some((x) => x.email?.toLowerCase() === form.email.toLowerCase()) ? "Enregistrer et donner un nouveau mot de passe" : "Créer son accès"}
          </button>
        </div>
      )}

      {err && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}

      {acces && (
        <div className="mt-3 space-y-2 rounded-2xl bg-ok/[0.07] p-3 ring-1 ring-inset ring-ok/20 text-sm">
          <div className="font-medium">{acces.nouveau ? `Accès de ${acces.prenom} créé.` : `Nouveau mot de passe pour ${acces.prenom}.`} Rien ne lui a été envoyé.</div>
          <div className="rounded-xl bg-surface px-3 py-2 font-mono text-[13px] break-all">
            {acces.email}
            <br />
            {acces.password}
          </div>
          <p className="text-xs text-muted">Ce mot de passe ne sera plus affiché : transmets-le maintenant.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="btn-secondary btn-sm"
              onClick={async () => {
                if (navigator.share) await navigator.share({ text: message }).catch(() => undefined);
                else {
                  await navigator.clipboard.writeText(message).catch(() => undefined);
                  setCopie(true);
                }
              }}
            >
              <Share2 size={14} /> Partager
            </button>
            <button
              className="btn-secondary btn-sm"
              onClick={async () => {
                await navigator.clipboard.writeText(message).catch(() => undefined);
                setCopie(true);
              }}
            >
              <Copy size={14} /> {copie ? "Copié" : "Copier"}
            </button>
            <a className="btn-secondary btn-sm col-span-2" href={`mailto:${acces.email}?subject=${encodeURIComponent("Ton accès au PATRIM Hub")}&body=${encodeURIComponent(message)}`}>
              <Mail size={14} /> Ouvrir dans le mail
            </a>
          </div>
        </div>
      )}
    </Card>
  );
}
