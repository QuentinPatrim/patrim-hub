"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileDown, Link2, Mail, MessageCircle, MessageSquare, Send, Share2 } from "lucide-react";
import { Sheet, Spinner, cx } from "@/components/ui";
import { Toggle } from "@/components/contacts/bits";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { marquerPropose } from "@/components/biens/AcquereursCompatibles";
import { gmailHref } from "@/components/matching/BrouillonMail";
import { mailHref, smsHref, waHref } from "@/components/biens/utils";
import { AGENCE } from "@/components/documents/charte";
import { useCollection } from "@/lib/store";
import { ficheDepuisBien, lienFiche, type BienPartage } from "./fiche";
import type { Contact } from "@/lib/types";

/**
 * « Envoyer la fiche » : prépare un lien vers une jolie fiche du bien (ou le PDF),
 * puis un message prêt à partir par WhatsApp, SMS ou e-mail. Rien n'est envoyé tout seul.
 */
export function EnvoyerFiche({ open, onClose, bien, vendeurs }: { open: boolean; onClose: () => void; bien: BienPartage; vendeurs: Contact[] }) {
  const { items: contacts } = useCollection("contacts");
  const [dest, setDest] = useState<string[]>([]);
  const [adresse, setAdresse] = useState(false);
  const [lien, setLien] = useState<string>();
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [texte, setTexte] = useState("");
  const [copie, setCopie] = useState(false);

  const c = contacts.find((x) => x.id === dest[0]);
  const fiche = useMemo(() => ficheDepuisBien(bien, vendeurs, { adresse }), [bien, vendeurs, adresse]);
  const photosLocales = (bien.photos ?? []).length > fiche.photos.length;

  useEffect(() => {
    if (!open) return;
    setLien(undefined);
    setErreur(undefined);
  }, [open, adresse]);

  useEffect(() => {
    const bonjour = c ? `Bonjour ${c.prenom || [c.civilite, c.nom].filter(Boolean).join(" ")},` : "Bonjour,";
    setTexte(
      [
        bonjour,
        "",
        `Comme convenu, voici la fiche du bien « ${fiche.titre} »${fiche.prix ? ` proposé à ${Math.round(fiche.prix).toLocaleString("fr-FR")} € honoraires inclus` : ""} :`,
        lien ?? "[le lien apparaîtra ici]",
        "",
        "Je reste à votre disposition pour organiser une visite ou répondre à vos questions.",
        "",
        `${AGENCE.conseiller} – PATRIM`,
        AGENCE.conseillerTel,
      ].join("\n")
    );
  }, [c, fiche.titre, fiche.prix, lien]);

  const preparer = async () => {
    setCharge(true);
    setErreur(undefined);
    try {
      setLien(await lienFiche(bien, fiche));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le lien n'a pas pu être créé.");
    } finally {
      setCharge(false);
    }
  };

  const envoye = () => {
    if (c) marquerPropose(bien, c);
  };
  const sujet = `${fiche.titre}${fiche.ref ? ` (réf. ${fiche.ref})` : ""} – PATRIM`;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
      envoye();
    } catch {}
  };
  const partager = async () => {
    try {
      await navigator.share({ title: sujet, text: texte });
      envoye();
    } catch {}
  };
  const peutPartager = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Send size={16} className="text-accent" /> Envoyer la fiche
        </span>
      }
    >
      <div className="space-y-5">
        <div>
          <span className="label">À qui ? (facultatif)</span>
          <ContactPicker value={dest} onChange={setDest} role="acquereur" max={1} placeholder="Choisir un acquéreur ou un client…" />
        </div>

        <Toggle checked={adresse} onChange={setAdresse} label="Mettre l'adresse exacte" hint={adresse ? "La rue apparaît sur la fiche." : "Seuls le quartier et la ville apparaissent (conseillé avant la visite)."} />

        {photosLocales && <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">Seules les photos en ligne (site PATRIM, portails) sont reprises sur la fiche.</p>}

        <div className="grid grid-cols-2 gap-2">
          <Link href={`/imprimer/fiche/${bien.id}${adresse ? "?adresse=1" : ""}`} className="btn-secondary !h-12">
            <FileDown size={16} /> Fiche en PDF
          </Link>
          <button className={cx(lien ? "btn-secondary" : "btn-primary", "!h-12")} onClick={preparer} disabled={charge}>
            {charge ? <Spinner /> : lien ? <Check size={16} /> : <Link2 size={16} />} {lien ? "Lien prêt" : "Créer le lien"}
          </button>
        </div>
        {erreur && <p className="text-sm text-danger">{erreur}</p>}

        {lien && (
          <div className="space-y-3 animate-fade-up">
            <a href={lien} target="_blank" rel="noreferrer" className="block truncate rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-xs text-accent">
              {lien}
            </a>
            <label className="block">
              <span className="label">Message</span>
              <textarea className="input min-h-[190px] text-sm" value={texte} onChange={(e) => setTexte(e.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              {c?.tel && (
                <a className="btn-primary !h-11" href={waHref(c.tel, texte)} target="_blank" rel="noreferrer" onClick={envoye}>
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
              {c?.tel && (
                <a className="btn-secondary !h-11" href={smsHref(c.tel, texte)} onClick={envoye}>
                  <MessageSquare size={16} /> SMS
                </a>
              )}
              <a className={cx(c?.tel ? "btn-secondary" : "btn-primary", "!h-11")} href={mailHref(c?.email, sujet, texte)} onClick={envoye}>
                <Mail size={16} /> E-mail
              </a>
              <a className="btn-secondary !h-11" href={gmailHref(c?.email, sujet, texte)} target="_blank" rel="noreferrer" onClick={envoye}>
                <Mail size={16} /> Gmail
              </a>
              <button className="btn-secondary !h-11" onClick={copier}>
                {copie ? <Check size={16} /> : <Copy size={16} />} {copie ? "Copié" : "Copier"}
              </button>
              {peutPartager && (
                <button className="btn-secondary !h-11" onClick={partager}>
                  <Share2 size={16} /> Partager
                </button>
              )}
            </div>
            <p className="text-xs text-muted">Rien n&apos;est envoyé d&apos;ici : le message s&apos;ouvre dans l&apos;appli choisie pour relecture. {c ? "Le bien sera noté « proposé » sur sa fiche." : ""}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
