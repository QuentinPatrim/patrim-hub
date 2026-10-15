"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Mail, MessageCircle } from "lucide-react";
import { Sheet, cx } from "@/components/ui";
import { mailHref, waHref } from "@/components/biens/utils";

/** Lien qui ouvre un brouillon dans Gmail (rien n'est envoyé : le message reste à relire). */
export const gmailHref = (to?: string, subject?: string, body?: string) =>
  "https://mail.google.com/mail/?" +
  ["view=cm", "fs=1", to && "to=" + encodeURIComponent(to), subject && "su=" + encodeURIComponent(subject), body && "body=" + encodeURIComponent(body)].filter(Boolean).join("&");

/**
 * Feuille « Préparer un mail » : objet et texte modifiables, puis ouverture
 * d'un brouillon dans l'appli Mail du téléphone ou dans Gmail. Jamais d'envoi
 * automatique. `onPrepare` est appelé quand le brouillon est ouvert ou copié.
 */
export function BrouillonMail({
  open,
  onClose,
  titre = "Préparer un mail",
  to,
  tel,
  sujet: sujet0,
  corps: corps0,
  onPrepare,
  avant,
}: {
  open: boolean;
  onClose: () => void;
  titre?: string;
  to?: string;
  tel?: string;
  sujet: string;
  corps: string;
  onPrepare?: (canal: "mail" | "gmail" | "copie" | "whatsapp") => void;
  avant?: React.ReactNode;
}) {
  const [sujet, setSujet] = useState(sujet0);
  const [corps, setCorps] = useState(corps0);
  const [copie, setCopie] = useState(false);

  useEffect(() => {
    if (open) {
      setSujet(sujet0);
      setCorps(corps0);
      setCopie(false);
    }
  }, [open, sujet0, corps0]);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(`${sujet}\n\n${corps}`);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
      onPrepare?.("copie");
    } catch {}
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Mail size={16} className="text-accent" /> {titre}
        </span>
      }
      footer={
        <div className="flex w-full flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <div className={cx("grid gap-2 sm:flex", tel ? "grid-cols-3" : "grid-cols-2")}>
            <button className="btn-secondary btn-sm !h-10" onClick={copier}>
              {copie ? <Check size={14} /> : <Copy size={14} />} {copie ? "Copié" : "Copier"}
            </button>
            {tel && (
              <a className="btn-secondary btn-sm !h-10" href={waHref(tel, corps)} target="_blank" rel="noreferrer" onClick={() => onPrepare?.("whatsapp")}>
                <MessageCircle size={14} /> WhatsApp
              </a>
            )}
            <a className="btn-secondary btn-sm !h-10" href={gmailHref(to, sujet, corps)} target="_blank" rel="noreferrer" onClick={() => onPrepare?.("gmail")}>
              <Mail size={14} /> Gmail
            </a>
          </div>
          <a className="btn-primary !h-11" href={mailHref(to, sujet, corps)} onClick={() => onPrepare?.("mail")}>
            <Mail size={15} /> Ouvrir le brouillon
          </a>
        </div>
      }
    >
      {avant}
      <div className="space-y-3">
        <div>
          <span className="label">À</span>
          <div className="input flex items-center text-sm text-muted">{to || "Pas d'adresse e-mail : vous pourrez la saisir dans le brouillon"}</div>
        </div>
        <label className="block">
          <span className="label">Objet</span>
          <input className="input" value={sujet} onChange={(e) => setSujet(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea className="input min-h-[40dvh] text-sm leading-relaxed" value={corps} onChange={(e) => setCorps(e.target.value)} />
        </label>
        <p className="text-xs text-muted">Rien n&apos;est envoyé d&apos;ici : le brouillon s&apos;ouvre dans votre messagerie pour relecture.</p>
      </div>
    </Sheet>
  );
}
