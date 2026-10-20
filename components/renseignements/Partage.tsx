"use client";

import { useState } from "react";
import { Check, Copy, Mail, MessageCircle, MessageSquareText, Share2 } from "lucide-react";

/* Envoi d'un lien de fiche de renseignements : partage du téléphone, SMS,
   WhatsApp, mail ou copie. Rien n'est envoyé tout seul : l'appli du
   téléphone s'ouvre avec le message prêt. Pas d'accès au store ici (utilisé
   aussi sur la page publique). */

const chiffres = (t?: string) => (t ?? "").replace(/[^\d+]/g, "");
const intl = (t?: string) => {
  const d = chiffres(t).replace(/^\+/, "");
  return d.startsWith("0") ? "33" + d.slice(1) : d;
};

export function PartageLien({ texte, sujet, tel, email, url }: { texte: string; sujet: string; tel?: string; email?: string; url: string }) {
  const [copie, setCopie] = useState(false);
  const peutPartager = typeof navigator !== "undefined" && "share" in navigator;
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      window.prompt("Copiez le lien :", url);
    }
  };
  const btn = "btn-secondary !h-12 !justify-start gap-3";
  return (
    <div className="space-y-2">
      {peutPartager && (
        <button type="button" className="btn-primary w-full !h-12" onClick={() => navigator.share({ title: sujet, text: texte }).catch(() => {})}>
          <Share2 size={17} /> Envoyer le lien
        </button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a className={btn} href={`sms:${chiffres(tel)}?&body=${encodeURIComponent(texte)}`}>
          <MessageSquareText size={17} className="text-accent" /> SMS
        </a>
        <a className={btn} href={`https://wa.me/${intl(tel)}?text=${encodeURIComponent(texte)}`} target="_blank" rel="noreferrer noopener">
          <MessageCircle size={17} className="text-accent" /> WhatsApp
        </a>
        <a className={btn} href={`mailto:${email ?? ""}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(texte)}`}>
          <Mail size={17} className="text-accent" /> Mail
        </a>
        <button type="button" className={btn} onClick={copier}>
          {copie ? <Check size={17} className="text-ok" /> : <Copy size={17} className="text-accent" />} {copie ? "Copié" : "Copier"}
        </button>
      </div>
    </div>
  );
}
