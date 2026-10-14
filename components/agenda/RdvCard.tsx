"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, CalendarPlus, CircleCheck, ClipboardCheck, MapPin, MessageCircle, Navigation, Pencil, Phone, RotateCcw, Send, Star } from "lucide-react";
import { Avatar, Badge, Sheet, cx } from "@/components/ui";
import { BienCover } from "@/components/biens/BienVisual";
import { mailHref, mapsHref, smsHref, telHref, waHref } from "@/components/biens/utils";
import { update } from "@/lib/store";
import { RDV_TYPE, dateCourte, heure, initiales, nomComplet } from "@/lib/format";
import type { Bien, Contact } from "@/lib/types";
import { RDV_DOT, RDV_ICON, SUITE, crAFaire, finDe, lieuRdv, telechargerIcs, texteConfirmation, titreRdv, type RdvExt } from "./utils";

export function RdvCard({
  rdv: r,
  bien,
  contacts,
  onEdit,
  onCompteRendu,
  showDate,
}: {
  rdv: RdvExt;
  bien?: Bien;
  contacts: Contact[];
  onEdit: () => void;
  onCompteRendu: () => void;
  showDate?: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const Icon = RDV_ICON[r.type];
  const lieu = lieuRdv(r, bien);
  const annule = r.statut === "annule";
  const aFaire = crAFaire(r);
  const enCours = !annule && new Date(r.debut).getTime() <= Date.now() && finDe(r).getTime() >= Date.now();
  const suiteKey = r.crDetail?.suite;

  return (
    <article className={cx("card overflow-hidden transition", annule && "opacity-60", enCours && "ring-2 ring-accent/40")}>
      <div className="flex gap-3 p-3.5 sm:p-4">
        {bien ? (
          <Link href={`/biens/${bien.id}`} className="shrink-0">
            <BienCover photo={bien.photos?.[0]} type={bien.type} compact className="size-16 sm:size-[72px] rounded-xl" />
          </Link>
        ) : (
          <span className={cx("grid place-items-center size-16 sm:size-[72px] shrink-0 rounded-xl text-white", RDV_DOT[r.type])}>
            <Icon size={24} strokeWidth={1.6} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span className={cx("size-1.5 rounded-full", RDV_DOT[r.type])} />
              {RDV_TYPE[r.type]}
            </span>
            {showDate && <span className="text-[11px] text-muted">· {dateCourte(r.debut)}</span>}
            {enCours && <Badge tone="brand">En cours</Badge>}
            {annule && <Badge>Annulé</Badge>}
            {r.statut === "fait" && !aFaire && <Badge tone="ok">Fait</Badge>}
            {aFaire && <Badge tone="warn">Compte rendu à faire</Badge>}
          </div>
          <h3 className={cx("mt-0.5 font-medium leading-snug line-clamp-2", annule && "line-through")}>{titreRdv(r, bien, r.type === "visite" ? [] : contacts)}</h3>
          {lieu && (
            <p className="mt-0.5 flex items-start gap-1 text-xs text-muted">
              <MapPin size={12} className="mt-0.5 shrink-0" />
              <span className="line-clamp-1">{lieu}</span>
            </p>
          )}
          {(r.avisClient || suiteKey || r.suite) && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {r.avisClient && (
                <span className="inline-flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={12} className={n <= r.avisClient! ? "fill-gold text-gold" : "text-line"} />
                  ))}
                </span>
              )}
              {suiteKey ? <Badge tone={SUITE[suiteKey].tone}>{SUITE[suiteKey].label}</Badge> : r.suite ? <Badge>{r.suite}</Badge> : null}
            </div>
          )}
        </div>
      </div>

      {contacts.length > 0 && (
        <ul className="px-3.5 sm:px-4 pb-3 space-y-1.5">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5">
              <Avatar text={initiales(c)} className="!size-7 text-[10px]" />
              <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1 text-sm font-medium truncate hover:text-accent">
                {nomComplet(c)}
              </Link>
              {c.tel && (
                <a href={telHref(c.tel)} className="grid place-items-center size-9 rounded-lg text-muted hover:bg-surface-2 hover:text-accent" aria-label={`Appeler ${nomComplet(c)}`}>
                  <Phone size={16} />
                </a>
              )}
              {c.tel && (
                <a href={waHref(c.tel)} target="_blank" rel="noreferrer" className="grid place-items-center size-9 rounded-lg text-muted hover:bg-surface-2 hover:text-accent" aria-label="WhatsApp">
                  <MessageCircle size={16} />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar border-t border-line bg-surface-2/40 px-2.5 py-2">
        {r.type === "visite" && !annule && (
          <button onClick={onCompteRendu} className={cx("btn-sm btn shrink-0", aFaire ? "bg-brand text-white hover:bg-brand-light" : "btn-ghost")}>
            <ClipboardCheck size={14} /> {r.compteRendu || r.avisClient ? "Voir le compte rendu" : "Compte rendu"}
          </button>
        )}
        {lieu && r.type !== "appel" && (
          <a href={mapsHref(lieu)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm shrink-0">
            <Navigation size={14} /> Itinéraire
          </a>
        )}
        <button onClick={() => telechargerIcs(r, bien, contacts)} className="btn-ghost btn-sm shrink-0">
          <CalendarPlus size={14} /> Ajouter à mon agenda
        </button>
        {contacts.length > 0 && !annule && new Date(r.debut).getTime() > Date.now() && (
          <button onClick={() => setConfirm(true)} className="btn-ghost btn-sm shrink-0">
            <Send size={14} /> Confirmer au client
          </button>
        )}
        {r.statut === "prevu" && r.type !== "visite" && new Date(r.debut).getTime() < Date.now() && (
          <button onClick={() => update("rdvs", r.id, { statut: "fait" })} className="btn-ghost btn-sm shrink-0">
            <CircleCheck size={14} /> Fait
          </button>
        )}
        {r.statut === "prevu" && (
          <button onClick={() => update("rdvs", r.id, { statut: "annule" })} className="btn-ghost btn-sm shrink-0 text-muted">
            <Ban size={14} /> Annuler
          </button>
        )}
        {annule && (
          <button onClick={() => update("rdvs", r.id, { statut: "prevu" })} className="btn-ghost btn-sm shrink-0">
            <RotateCcw size={14} /> Rétablir
          </button>
        )}
        <button onClick={onEdit} className="btn-ghost btn-sm shrink-0 ml-auto">
          <Pencil size={14} /> Modifier
        </button>
      </div>

      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} rdv={r} bien={bien} contacts={contacts} />
    </article>
  );
}

/** Message de confirmation prêt à envoyer (SMS, WhatsApp, mail) — sans durée. */
function ConfirmSheet({ open, onClose, rdv, bien, contacts }: { open: boolean; onClose: () => void; rdv: RdvExt; bien?: Bien; contacts: Contact[] }) {
  const [copie, setCopie] = useState<string>();
  return (
    <Sheet open={open} onClose={onClose} title="Confirmer au client">
      <div className="space-y-4">
        {contacts.map((c) => {
          const txt = texteConfirmation(rdv, bien, c);
          return (
            <div key={c.id} className="space-y-2">
              <div className="text-sm font-medium">{nomComplet(c)}</div>
              <pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 font-sans text-sm leading-relaxed">{txt}</pre>
              <div className="flex flex-wrap gap-2">
                {c.tel && (
                  <a href={smsHref(c.tel, txt)} className="btn-secondary btn-sm">
                    SMS
                  </a>
                )}
                {c.tel && (
                  <a href={waHref(c.tel, txt)} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                    WhatsApp
                  </a>
                )}
                {c.email && (
                  <a href={mailHref(c.email, `Confirmation de notre rendez-vous du ${dateCourte(rdv.debut)} à ${heure(rdv.debut)}`, txt)} className="btn-secondary btn-sm">
                    E-mail
                  </a>
                )}
                <button
                  className="btn-ghost btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(txt);
                      setCopie(c.id);
                      setTimeout(() => setCopie(undefined), 1800);
                    } catch {}
                  }}
                >
                  {copie === c.id ? "Copié ✓" : "Copier"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
