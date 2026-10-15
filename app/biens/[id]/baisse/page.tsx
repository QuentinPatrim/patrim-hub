"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Mail, MessageCircle, MessageSquareText, Phone, Users } from "lucide-react";
import { Avatar, Badge, Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { smsHref, telHref, waHref } from "@/components/biens/utils";
import { baisseEnCours, cibles, type BienBaisse, type Cible, type Groupe } from "@/components/baisse/baisse";
import { marquerPrevenu, messageBaisse, type Canal } from "@/components/baisse/messages";
import { update, useCollection, useDoc } from "@/lib/store";
import { ETAPE, dateCourte, eur, eurK, initiales, nomComplet, today } from "@/lib/format";
import type { Bien } from "@/lib/types";

/* ============================================================
   Annoncer une baisse de prix : les acquéreurs qui ont visité
   ou reçu le bien, puis ceux dont le budget colle au nouveau
   prix, avec un SMS, un WhatsApp ou un mail prêts à relire.
   ============================================================ */

const GROUPES: { g: Groupe; titre: string }[] = [
  { g: "visite", titre: "Ont visité le bien" },
  { g: "propose", titre: "Ont reçu le bien" },
  { g: "budget", titre: "Dans leur budget" },
];

export default function BaissePage() {
  const { id } = useParams<{ id: string }>();
  const { doc } = useDoc("biens", id);
  const b = doc as BienBaisse | undefined;
  const { items: contacts } = useCollection("contacts");
  const { items: rdvs } = useCollection("rdvs");
  const [de, setDe] = useState<number>();
  const [mail, setMail] = useState<Cible | null>(null);
  const [waited, setWaited] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!b || init.current) return;
    init.current = true;
    setDe(baisseEnCours(b)?.de);
  }, [b]);

  const enCours = b ? baisseEnCours(b) : undefined;
  const a = b?.prix;
  const deValide = de != null && a != null && de > a ? de : undefined;

  // L'ancien prix saisi ici est gardé sur le bien (la fiche affiche alors la baisse à annoncer).
  useEffect(() => {
    if (!b || a == null || deValide == null || deValide === enCours?.de) return;
    const t = setTimeout(() => update("biens", b.id, { baisse: { de: deValide, a, date: enCours?.date ?? today(), prevenus: enCours?.prevenus } } as Partial<Bien>), 700);
    return () => clearTimeout(t);
  }, [b, a, deValide, enCours]);

  const liste = useMemo(() => (b && a != null ? cibles(b, contacts, rdvs, deValide) : []), [b, a, contacts, rdvs, deValide]);

  if (!b) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const header = <PageHeader back={`/biens/${b.id}`} title="Baisse de prix" subtitle={b.titre} />;
  if (a == null)
    return (
      <div className="space-y-5 pb-6">
        {header}
        <div className="card">
          <Empty title="Prix affiché manquant" text="Indiquez le nouveau prix sur la fiche du bien, puis revenez ici pour prévenir les acquéreurs." action={<Link href={`/biens/${b.id}`} className="btn-primary">Ouvrir la fiche</Link>} />
        </div>
      </div>
    );

  const baisse = { de: deValide, a };
  const prevenus = enCours?.prevenus ?? {};
  const brouillon = mail ? messageBaisse(b, mail, baisse) : null;
  const restants = liste.filter((x) => !prevenus[x.c.id]).length;

  return (
    <div className="space-y-5 pb-6">
      {header}

      <Card title="Le prix">
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Ancien prix">
            <NumInput value={de} onChange={setDe} suffix="€" />
          </Field>
          <Field label="Nouveau prix">
            <div className="input flex items-center font-semibold">{eur(a)}</div>
          </Field>
        </div>
        {de != null && de <= a ? (
          <p className="mt-2 text-xs text-warn">L&apos;ancien prix doit être plus élevé que le prix affiché aujourd&apos;hui.</p>
        ) : (
          <p className="mt-2 text-xs text-muted">
            {enCours
              ? `Baisse du ${dateCourte(enCours.date)}, honoraires inclus. Le nouveau prix est celui de la fiche.`
              : "Saisissez le prix affiché avant la baisse : les messages le rappellent. Le nouveau prix est celui de la fiche."}
          </p>
        )}
      </Card>

      {!liste.length ? (
        <div className="card">
          <Empty
            icon={<Users size={20} />}
            title="Personne à prévenir pour l'instant"
            text="Aucun acquéreur n'a visité ou reçu ce bien, et aucun budget enregistré ne correspond au nouveau prix."
            action={<Link href="/contacts" className="btn-secondary">Voir les contacts</Link>}
          />
        </div>
      ) : (
        <>
          <p className="px-1 text-sm text-muted">
            {restants ? (
              <>
                <span className="font-semibold text-fg">{restants}</span> acquéreur{restants > 1 ? "s" : ""} à prévenir
              </>
            ) : (
              "Tout le monde a été prévenu."
            )}
            {liste.length > restants ? ` · ${liste.length - restants} déjà prévenu${liste.length - restants > 1 ? "s" : ""}` : ""}
          </p>
          {GROUPES.map(({ g, titre }) => {
            const xs = liste.filter((x) => x.groupe === g).sort((x, y) => Number(!!prevenus[x.c.id]) - Number(!!prevenus[y.c.id]));
            if (!xs.length) return null;
            return (
              <Card
                key={g}
                title={
                  <span className="inline-flex items-center gap-2">
                    {titre}
                    <span className="rounded-full bg-surface-2 px-2 text-[11px] font-semibold text-muted">{xs.length}</span>
                  </span>
                }
                pad={false}
              >
                <ul className="divide-y divide-line">
                  {xs.map((x) => (
                    <Ligne key={x.c.id} x={x} b={b} baisse={baisse} prevenu={prevenus[x.c.id]} onMail={() => setMail(x)} />
                  ))}
                </ul>
              </Card>
            );
          })}
          <p className="px-1 text-xs text-muted">Rien n&apos;est envoyé d&apos;ici : chaque message s&apos;ouvre dans votre messagerie pour relecture.</p>
        </>
      )}

      {mail && brouillon && (
        <BrouillonMail
          open
          onClose={() => setMail(null)}
          titre={`Prévenir ${nomComplet(mail.c)}`}
          to={mail.c.email}
          tel={mail.c.tel}
          sujet={brouillon.sujet}
          corps={brouillon.mail}
          onPrepare={(canal) => marquerPrevenu(b.id, mail, canal === "whatsapp" ? "whatsapp" : "mail", baisse)}
        />
      )}
    </div>
  );
}

function Ligne({ x, b, baisse, prevenu, onMail }: { x: Cible; b: Bien; baisse: { de?: number; a: number }; prevenu?: string; onMail: () => void }) {
  const m = messageBaisse(b, x, baisse);
  const marquer = (canal: Canal) => marquerPrevenu(b.id, x, canal, baisse);
  const etape = x.c.etape ? ETAPE[x.c.etape] : undefined;
  const detail =
    x.groupe === "visite"
      ? `${x.aVenir ? "Visite prévue le" : "A visité le"} ${dateCourte(x.visite)}`
      : x.groupe === "propose"
        ? "Bien déjà proposé"
        : `Compatible à ${x.score} %${x.c.criteres?.budgetMax ? ` · budget ${eurK(x.c.criteres.budgetMax)}` : ""}`;
  const bouton = "btn-secondary !h-12 flex-1 flex-col !gap-0.5 !px-1 text-[11px]";

  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3">
        <Avatar text={initiales(x.c)} className={cx(prevenu && "opacity-60")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={`/contacts/${x.c.id}`} className="truncate font-medium hover:text-accent">
              {nomComplet(x.c)}
            </Link>
            {etape && <Badge tone={etape.tone}>{etape.label}</Badge>}
            {x.grace && <Badge tone="brand">Grâce à la baisse</Badge>}
          </div>
          <div className="text-xs text-muted">{detail}</div>
          {prevenu && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-ok">
              <Check size={13} /> Prévenu le {dateCourte(prevenu)}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {x.c.tel && (
          <a href={smsHref(x.c.tel, m.sms)} onClick={() => marquer("sms")} className={bouton}>
            <MessageSquareText size={16} /> SMS
          </a>
        )}
        {x.c.tel && (
          <a href={waHref(x.c.tel, m.sms)} target="_blank" rel="noreferrer" onClick={() => marquer("whatsapp")} className={bouton}>
            <MessageCircle size={16} /> WhatsApp
          </a>
        )}
        <button type="button" onClick={onMail} className={bouton}>
          <Mail size={16} /> Mail
        </button>
        {x.c.tel && (
          <a href={telHref(x.c.tel)} onClick={() => marquer("appel")} className={bouton}>
            <Phone size={16} /> Appeler
          </a>
        )}
      </div>
    </li>
  );
}
