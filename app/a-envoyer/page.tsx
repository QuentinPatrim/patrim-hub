"use client";

/* « À envoyer » : les messages prêts du jour, à relire et envoyer
   un par un. Rien ne part d'ici : le message s'ouvre dans Mail,
   Gmail, SMS ou WhatsApp, puis « C'est envoyé » le note. */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, CheckCircle2, Clock, Copy, Inbox, Mail, MessageCircle, MessageSquare, Sparkles, X } from "lucide-react";
import { Avatar, Badge, Empty, PageHeader, Sheet, Spinner, Tabs, cx } from "@/components/ui";
import { addDays, initiales, nomComplet, today } from "@/lib/format";
import { ask } from "@/lib/ai";
import { gmailHref } from "@/components/matching/BrouillonMail";
import { mailHref, smsHref, waHref } from "@/components/biens/utils";
import { CATEGORIE, type CategorieEnvoi, type Envoi } from "@/components/boite/envois";
import { noterBoite } from "@/components/boite/etat";
import { useEnvois } from "@/components/boite/useEnvois";
import type { Canal } from "@/components/vente/messages";

type Filtre = "tous" | CategorieEnvoi;

export default function AEnvoyer() {
  const envois = useEnvois();
  const [pret, setPret] = useState(false);
  useEffect(() => setPret(true), []);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [ouvert, setOuvert] = useState<Envoi | null>(null);
  const [faits, setFaits] = useState(0);

  const cats = (Object.keys(CATEGORIE) as CategorieEnvoi[]).filter((c) => envois.some((e) => e.cat === c));
  const liste = filtre === "tous" ? envois : envois.filter((e) => e.cat === filtre);
  useEffect(() => {
    if (filtre !== "tous" && !envois.some((e) => e.cat === filtre)) setFiltre("tous");
  }, [envois, filtre]);

  if (!pret) return <div className="skeleton h-64 !rounded-2xl" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="À envoyer"
        subtitle={envois.length ? `${envois.length} message${envois.length > 1 ? "s" : ""} prêt${envois.length > 1 ? "s" : ""} à relire${faits ? ` · ${faits} envoyé${faits > 1 ? "s" : ""} aujourd'hui` : ""}` : "Tout est envoyé."}
      />
      {cats.length > 1 && (
        <Tabs<Filtre>
          value={filtre}
          onChange={setFiltre}
          items={[{ value: "tous", label: "Tout", count: envois.length }, ...cats.map((c) => ({ value: c as Filtre, label: CATEGORIE[c].label, count: envois.filter((e) => e.cat === c).length }))]}
        />
      )}
      {liste.length ? (
        <ul className="space-y-2.5">
          {liste.map((e) => (
            <Carte key={e.cle} e={e} onOuvrir={() => setOuvert(e)} />
          ))}
        </ul>
      ) : (
        <Empty icon={<CheckCircle2 size={22} />} title="Rien à envoyer pour l'instant" text="Les relances, baisses de prix, points de vente, comptes rendus et remerciements arriveront ici dès qu'ils sont dus." />
      )}
      <p className="text-xs text-muted">Rien n&apos;est envoyé automatiquement : chaque message s&apos;ouvre dans ta messagerie pour relecture.</p>
      {ouvert && (
        <Composer
          e={ouvert}
          onClose={() => setOuvert(null)}
          onFait={() => {
            setOuvert(null);
            setFaits((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function Carte({ e, onOuvrir }: { e: Envoi; onOuvrir: () => void }) {
  const c = CATEGORIE[e.cat];
  const apercu = (e.sms ?? e.mail).split("\n").filter((l) => l.trim() && !/^Bonjour/.test(l))[0];
  return (
    <li className="card card-pad space-y-2.5">
      <div className="flex items-start gap-3">
        <Avatar text={initiales(e.contact)} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/contacts/${e.contact.id}`} className="font-semibold text-sm hover:underline">{nomComplet(e.contact)}</Link>
            <Badge tone={c.tone}>{c.label}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">{e.raison}</p>
          {apercu && <p className="mt-1.5 text-sm line-clamp-2">{apercu}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {e.dansGmail ? (
          <a className="btn-primary btn-sm !h-10" href="https://mail.google.com/mail/u/0/#drafts" target="_blank" rel="noreferrer">
            <Mail size={14} /> Ouvrir les brouillons Gmail
          </a>
        ) : (
          <button className="btn-primary btn-sm !h-10" onClick={onOuvrir}>
            <Mail size={14} /> Relire et envoyer
          </button>
        )}
        {e.dansGmail && (
          <button className="btn-secondary btn-sm !h-10" onClick={() => e.fait("mail", "")}>
            <Check size={14} /> C&apos;est envoyé
          </button>
        )}
        <button className="btn-ghost btn-sm !h-10" onClick={() => void noterBoite("reportes", e.cle, addDays(today(), 1))}>
          <Clock size={14} /> Demain
        </button>
        <button className="btn-ghost btn-sm !h-10 text-muted" onClick={() => void noterBoite("ecartes", e.cle, new Date().toISOString())}>
          <X size={14} /> Ne pas envoyer
        </button>
      </div>
    </li>
  );
}

function Composer({ e, onClose, onFait }: { e: Envoi; onClose: () => void; onFait: () => void }) {
  const tel = e.contact.tel;
  const email = e.contact.email;
  const [canal, setCanal] = useState<"mail" | "sms">(email || !tel || !e.sms ? "mail" : "sms");
  const [sujet, setSujet] = useState(e.sujet);
  const [mail, setMail] = useState(e.mail);
  const [sms, setSms] = useState(e.sms ?? "");
  const [utilise, setUtilise] = useState<Canal | null>(null);
  const [copie, setCopie] = useState(false);
  const [ia, setIa] = useState(false);
  const [err, setErr] = useState("");
  const texte = canal === "mail" ? mail : sms;

  const reecrire = async () => {
    setIa(true);
    setErr("");
    try {
      const c = e.contact;
      const contexte = [
        `Contact : ${nomComplet(c)} (${(c.roles ?? []).join(", ")})`,
        c.criteres ? `Recherche : ${JSON.stringify(c.criteres)}` : "",
        c.prochaineAction ? `Prochaine action prévue : ${c.prochaineAction}` : "",
        c.notes ? `Notes : ${c.notes}` : "",
        (c.historique ?? []).length ? `Derniers échanges : ${(c.historique ?? []).slice(0, 6).map((h) => `${h.date.slice(0, 10)} ${h.type} : ${h.texte}`).join(" | ")}` : "",
      ].filter(Boolean).join("\n");
      const res = await ask({
        system: "Tu rédiges une relance courte et naturelle d'un conseiller immobilier à un client qu'il connaît. Vouvoiement, chaleureux, sans formule creuse, sans rien inventer. Ne jamais citer d'autre client ni de montant d'offre. Ne jamais indiquer la durée d'une visite ou d'un appel.",
        prompt: `${contexte}\n\nÉcris ${canal === "mail" ? "le corps du mail, de « Bonjour » à la signature (le conseiller signe déjà en dessous : termine par « Bien à vous, »)" : "un SMS de 3 lignes maximum, commençant par « Bonjour »"}. Texte brut uniquement.`,
      });
      const t = (res.text ?? "").trim();
      if (!t) throw new Error("Pas de réponse, réessaie.");
      if (canal === "mail") setMail(t.replace(/Bien à vous,?\s*$/, "").trim() + "\n\n" + e.mail.split("\n").slice(-3).join("\n"));
      else setSms(t);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setIa(false);
    }
  };

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(canal === "mail" ? `${sujet}\n\n${mail}` : sms);
      setCopie(true);
      setUtilise(canal === "mail" ? "mail" : "sms");
    } catch {}
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><Inbox size={16} className="text-accent" /> {nomComplet(e.contact)}</span>}
      footer={
        <div className="flex w-full flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {canal === "mail" ? (
              <>
                <a className="btn-secondary btn-sm !h-10" href={mailHref(email, sujet, mail)} onClick={() => setUtilise("mail")}><Mail size={14} /> Mail</a>
                <a className="btn-secondary btn-sm !h-10" href={gmailHref(email, sujet, mail)} target="_blank" rel="noreferrer" onClick={() => setUtilise("mail")}><Mail size={14} /> Gmail</a>
              </>
            ) : (
              <>
                <a className={cx("btn-secondary btn-sm !h-10", !tel && "pointer-events-none opacity-50")} href={smsHref(tel, sms)} onClick={() => setUtilise("sms")}><MessageSquare size={14} /> SMS</a>
                <a className={cx("btn-secondary btn-sm !h-10", !tel && "pointer-events-none opacity-50")} href={waHref(tel, sms)} target="_blank" rel="noreferrer" onClick={() => setUtilise("whatsapp")}><MessageCircle size={14} /> WhatsApp</a>
              </>
            )}
            <button className="btn-secondary btn-sm !h-10" onClick={copier}>{copie ? <Check size={14} /> : <Copy size={14} />} {copie ? "Copié" : "Copier"}</button>
          </div>
          <button
            className={cx("btn-primary !h-11", !utilise && "opacity-80")}
            onClick={() => {
              e.fait(utilise ?? (canal === "mail" ? "mail" : "sms"), texte);
              onFait();
            }}
          >
            <Check size={15} /> C&apos;est envoyé
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted">{e.raison}</p>
        {e.sms && (
          <Tabs<"mail" | "sms"> value={canal} onChange={setCanal} items={[{ value: "mail", label: "Mail" }, { value: "sms", label: "SMS / WhatsApp" }]} />
        )}
        <div className="input flex items-center text-sm text-muted">
          {canal === "mail" ? email || "Pas d'adresse e-mail : à saisir dans le brouillon" : tel || "Pas de numéro sur la fiche"}
        </div>
        {canal === "mail" && (
          <label className="block">
            <span className="label">Objet</span>
            <input className="input" value={sujet} onChange={(x) => setSujet(x.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="label">Message</span>
          <textarea
            className={cx("input text-sm leading-relaxed", canal === "mail" ? "min-h-[38dvh]" : "min-h-[22dvh]")}
            value={texte}
            onChange={(x) => (canal === "mail" ? setMail(x.target.value) : setSms(x.target.value))}
          />
        </label>
        {/\[À compléter\]/.test(texte) && <p className="text-xs text-warn">Il reste un « [À compléter] » dans le texte.</p>}
        {e.reecrire && (
          <button className="btn-ghost btn-sm" onClick={reecrire} disabled={ia}>
            {ia ? <Spinner /> : <Sparkles size={14} />} Réécrire d&apos;après la fiche
          </button>
        )}
        {err && <p className="text-xs text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}
