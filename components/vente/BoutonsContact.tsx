"use client";

import { Mail, MessageCircle, MessageSquareText, Phone } from "lucide-react";
import { smsHref, telHref, waHref } from "@/components/biens/utils";
import type { Contact } from "@/lib/types";
import type { Canal, Message } from "./messages";

/** SMS, WhatsApp et appel ouvrent l'appli du téléphone ; « Mail » ouvre un brouillon à relire. */
export function BoutonsContact({ c, m, onPoint, onMail }: { c: Contact; m: Message; onPoint: (canal: Canal) => void; onMail: () => void }) {
  const bouton = "btn-secondary !h-12 flex-1 flex-col !gap-0.5 !px-1 text-[11px]";
  return (
    <div className="mt-2.5 flex gap-1.5">
      {c.tel && (
        <a href={smsHref(c.tel, m.sms)} onClick={() => onPoint("sms")} className={bouton}>
          <MessageSquareText size={16} /> SMS
        </a>
      )}
      {c.tel && (
        <a href={waHref(c.tel, m.sms)} target="_blank" rel="noreferrer" onClick={() => onPoint("whatsapp")} className={bouton}>
          <MessageCircle size={16} /> WhatsApp
        </a>
      )}
      <button type="button" onClick={onMail} className={bouton}>
        <Mail size={16} /> Mail
      </button>
      {c.tel && (
        <a href={telHref(c.tel)} onClick={() => onPoint("appel")} className={bouton}>
          <Phone size={16} /> Appeler
        </a>
      )}
    </div>
  );
}
