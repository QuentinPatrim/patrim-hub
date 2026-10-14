"use client";

import { Check, Copy, ExternalLink, Mail, MessageCircle, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cx, Field, Sheet, Spinner } from "@/components/ui";
import { ask } from "@/lib/ai";
import { dateCourte, eur, heure, nomComplet, RDV_TYPE, TYPE_BIEN } from "@/lib/format";
import { update } from "@/lib/store";
import type { Bien, Contact, Rdv } from "@/lib/types";
import { PickChip } from "./bits";
import { criteresResume, HISTO_LABEL, mailHref, smsHref, waHref } from "./helpers";

export type Canal = "sms" | "mail" | "whatsapp";
export type Objectif = "relance" | "proposition" | "nouvelles" | "avis";

const CANAUX: { v: Canal; label: string; icon: typeof Mail }[] = [
  { v: "sms", label: "SMS", icon: MessageSquareText },
  { v: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { v: "mail", label: "Mail", icon: Mail },
];
const OBJECTIFS: { v: Objectif; label: string; desc: string }[] = [
  { v: "relance", label: "Relance", desc: "Faire le point sur sa recherche et proposer un échange" },
  { v: "proposition", label: "Proposer un bien", desc: "Présenter un bien qui correspond à ses critères" },
  { v: "nouvelles", label: "Prendre des nouvelles", desc: "Garder le lien, sans pression" },
  { v: "avis", label: "Avis après visite", desc: "Recueillir son ressenti après une visite" },
];

/** Uniquement les informations publiques d'un bien (jamais le vendeur, le net vendeur ni les notes internes). */
function bienPublic(b: Bien) {
  return {
    titre: b.titre,
    type: TYPE_BIEN[b.type],
    secteur: [b.quartier, b.ville].filter(Boolean).join(", "),
    prix: b.prix ? `${eur(b.prix)} honoraires inclus` : undefined,
    surface: b.surface ? `${b.surface} m²` : undefined,
    pieces: b.pieces,
    chambres: b.chambres,
    etage: b.etage,
    ascenseur: b.ascenseur,
    exterieur: b.exterieur,
    parking: b.parking,
    dpe: b.dpe,
    pointsForts: b.pointsForts,
    description: b.description?.slice(0, 600),
    lienAnnonce: b.annonceUrl,
  };
}

export function MessageAssistant({
  open,
  onClose,
  contact,
  compatibles,
  biens,
  visites,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
  compatibles: Bien[];
  biens: Bien[];
  visites: Rdv[];
  initial?: { objectif?: Objectif; bienId?: string };
}) {
  const [canal, setCanal] = useState<Canal>(contact.tel ? "sms" : "mail");
  const [objectif, setObjectif] = useState<Objectif>("relance");
  const [bienId, setBienId] = useState<string>("");
  const [visiteId, setVisiteId] = useState<string>("");
  const [consigne, setConsigne] = useState("");
  const [objet, setObjet] = useState("");
  const [texte, setTexte] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [logged, setLogged] = useState(false);

  const visitesFaites = useMemo(() => visites.filter((v) => v.type === "visite" && v.statut !== "annule" && new Date(v.debut).getTime() <= Date.now()).sort((a, b) => b.debut.localeCompare(a.debut)), [visites]);
  const proposables = useMemo(() => {
    const ids = new Set(compatibles.map((b) => b.id));
    const autres = biens.filter((b) => !ids.has(b.id) && (b.statut === "en_vente" || b.statut === "mandat_signe"));
    return [...compatibles, ...autres];
  }, [compatibles, biens]);

  useEffect(() => {
    if (!open) return;
    setObjectif(initial?.objectif ?? "relance");
    setBienId(initial?.bienId ?? compatibles[0]?.id ?? "");
    setVisiteId(visitesFaites[0]?.id ?? "");
    setTexte("");
    setObjet("");
    setErr(null);
    setLogged(false);
    setConsigne("");
    setCanal(contact.tel ? "sms" : "mail");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bien = biens.find((b) => b.id === bienId);
  const visite = visitesFaites.find((v) => v.id === visiteId);
  const bienVisite = visite?.bienId ? biens.find((b) => b.id === visite.bienId) : undefined;

  async function rediger() {
    setBusy(true);
    setErr(null);
    try {
      const histo = (contact.historique ?? [])
        .slice(0, 8)
        .map((h) => `- ${dateCourte(h.date)} · ${HISTO_LABEL[h.type]} : ${h.texte.slice(0, 280)}`)
        .join("\n");
      const ctx = {
        client: { civilite: contact.civilite || undefined, prenom: contact.prenom, nom: contact.nom },
        recherche: criteresResume(contact.criteres) || undefined,
        souhaits: contact.criteres?.remarques,
        dernierContact: contact.dernierContact ? dateCourte(contact.dernierContact) : undefined,
        biensCompatibles: objectif === "relance" || objectif === "nouvelles" ? compatibles.slice(0, 3).map(bienPublic) : undefined,
        bienPropose: objectif === "proposition" && bien ? bienPublic(bien) : undefined,
        visite: objectif === "avis" && visite ? { date: dateCourte(visite.debut), bien: bienVisite ? bienPublic(bienVisite) : visite.titre } : undefined,
      };
      const objTxt = OBJECTIFS.find((o) => o.v === objectif)!.desc;
      const format =
        canal === "mail"
          ? `un mail court (6 à 10 lignes) avec une formule d'appel ("Bonjour Madame X," ou "Bonjour Prénom," si le ton de l'historique est familier) et une signature "Quentin Delsol\nPATRIM – 05 61 99 08 08". Réponds en JSON : {"objet":"…","message":"…"}`
          : canal === "sms"
            ? `un SMS de 2 à 4 phrases maximum (moins de 450 caractères), sans objet, signé "Quentin – PATRIM". Réponds en JSON : {"message":"…"}`
            : `un message WhatsApp de 2 à 5 phrases, naturel, sans emoji excessif (un seul au plus), signé "Quentin – PATRIM". Réponds en JSON : {"message":"…"}`;
      const res = await ask<{ objet?: string; message?: string }>({
        system: `Tu rédiges un message de Quentin Delsol (PATRIM) à un client acquéreur ou vendeur. Objectif : ${objTxt}. Rédige ${format}
Règles : vouvoiement, ton simple et chaleureux, une seule idée claire et une question ou proposition concrète à la fin (créneau d'appel ou de visite). N'invente aucune caractéristique d'un bien : utilise seulement les informations fournies. Ne mentionne jamais le vendeur, sa situation, le prix net vendeur, une offre ou d'autres acquéreurs. Si l'historique montre une info utile (visite, préférence), appuie-toi dessus sans en faire trop.`,
        prompt: `Contexte (JSON) :\n${JSON.stringify(ctx, null, 1)}\n\nHistorique récent :\n${histo || "(aucun)"}${consigne.trim() ? `\n\nConsigne du conseiller : ${consigne.trim()}` : ""}`,
        json: true,
        effort: "low",
      });
      const msg = res.json?.message ?? res.text;
      if (!msg) throw new Error("Pas de message reçu, réessayez.");
      setTexte(msg.trim());
      setObjet(res.json?.objet?.trim() ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "La rédaction a échoué.");
    } finally {
      setBusy(false);
    }
  }

  const href = useMemo(() => {
    if (!texte) return undefined;
    if (canal === "sms") return smsHref(contact.tel, texte);
    if (canal === "whatsapp") return waHref(contact.tel, texte);
    return mailHref(contact.email, objet || "PATRIM", texte);
  }, [canal, texte, objet, contact.tel, contact.email]);

  const coordonneeManquante = canal === "mail" ? !contact.email : !contact.tel;

  function journaliser() {
    if (logged) return;
    const now = new Date().toISOString();
    const label = canal === "whatsapp" ? "WhatsApp" : canal === "sms" ? "SMS" : "Mail";
    const titre = OBJECTIFS.find((o) => o.v === objectif)!.label;
    const patch: Partial<Contact> = {
      dernierContact: now,
      historique: [{ date: now, type: canal === "mail" ? "mail" : "sms", texte: `${label} préparé (${titre.toLowerCase()})${objet ? ` – ${objet}` : ""} :\n${texte}` }, ...(contact.historique ?? [])],
    };
    if (objectif === "proposition" && bien && !(contact.biensProposes ?? []).includes(bien.id)) patch.biensProposes = [...(contact.biensProposes ?? []), bien.id];
    update("contacts", contact.id, patch);
    setLogged(true);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={
        <span className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" /> Message pour {nomComplet(contact)}
        </span>
      }
      footer={
        texte ? (
          <>
            <button
              className="btn-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(canal === "mail" && objet ? `Objet : ${objet}\n\n${texte}` : texte);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  setErr("Copie impossible : sélectionnez le texte à la main.");
                }
              }}
            >
              {copied ? <Check size={16} className="text-ok" /> : <Copy size={16} />} {copied ? "Copié" : "Copier"}
            </button>
            {href ? (
              <a href={href} target={canal === "whatsapp" ? "_blank" : undefined} rel="noreferrer" className="btn-primary flex-1 sm:flex-none" onClick={journaliser}>
                <ExternalLink size={16} /> Ouvrir {canal === "mail" ? "le mail" : canal === "sms" ? "les messages" : "WhatsApp"}
              </a>
            ) : (
              <span className="btn-primary flex-1 sm:flex-none opacity-50">{canal === "mail" ? "E-mail manquant" : "Téléphone manquant"}</span>
            )}
          </>
        ) : (
          <button className="btn-primary w-full sm:w-auto" onClick={rediger} disabled={busy || (objectif === "proposition" && !bien) || (objectif === "avis" && !visite)}>
            {busy ? <Spinner /> : <Sparkles size={16} />} {busy ? "Rédaction…" : "Rédiger le message"}
          </button>
        )
      }
    >
      <div className="space-y-4">
        <div>
          <span className="label">Canal</span>
          <div className="grid grid-cols-3 gap-1.5">
            {CANAUX.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setCanal(v);
                  setTexte("");
                }}
                className={cx("h-11 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition", canal === v ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-accent/40")}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
          {coordonneeManquante && <p className="mt-1.5 text-xs text-warn">{canal === "mail" ? "Pas d'e-mail sur la fiche : vous pourrez seulement copier le texte." : "Pas de téléphone sur la fiche : vous pourrez seulement copier le texte."}</p>}
        </div>

        <div>
          <span className="label">Objectif</span>
          <div className="flex flex-wrap gap-1.5">
            {OBJECTIFS.map((o) => (
              <PickChip
                key={o.v}
                active={objectif === o.v}
                onClick={() => {
                  setObjectif(o.v);
                  setTexte("");
                }}
              >
                {o.label}
              </PickChip>
            ))}
          </div>
        </div>

        {objectif === "proposition" && (
          <Field label="Bien à proposer" hint={compatibles.length ? "Les biens compatibles sont en tête de liste." : undefined}>
            {proposables.length ? (
              <select className="input" value={bienId} onChange={(e) => (setBienId(e.target.value), setTexte(""))}>
                <option value="">Choisir un bien…</option>
                {proposables.map((b) => (
                  <option key={b.id} value={b.id}>
                    {compatibles.includes(b) ? "★ " : ""}
                    {b.titre || b.adresse} · {eur(b.prix)}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-muted">Aucun bien en vente pour l&apos;instant.</p>
            )}
          </Field>
        )}
        {objectif === "avis" && (
          <Field label="Visite concernée">
            {visitesFaites.length ? (
              <select className="input" value={visiteId} onChange={(e) => (setVisiteId(e.target.value), setTexte(""))}>
                {visitesFaites.map((v) => {
                  const b = biens.find((x) => x.id === v.bienId);
                  return (
                    <option key={v.id} value={v.id}>
                      {dateCourte(v.debut)} {heure(v.debut)} · {b?.titre ?? v.titre ?? RDV_TYPE[v.type]}
                    </option>
                  );
                })}
              </select>
            ) : (
              <p className="text-sm text-muted">Aucune visite passée avec ce contact dans l&apos;agenda.</p>
            )}
          </Field>
        )}

        <Field label="Précision (facultatif)">
          <input className="input" value={consigne} onChange={(e) => setConsigne(e.target.value)} placeholder="ex. proposer samedi matin, mentionner la baisse de prix…" />
        </Field>

        {err && <div className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger">{err}</div>}

        {busy && !texte && (
          <div className="space-y-2 rounded-2xl border border-line p-4">
            <div className="skeleton h-3 w-11/12" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-4/5" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        )}

        {texte && (
          <div className="space-y-2 animate-fade-up">
            <div className="flex items-center justify-between">
              <span className="label !mb-0">Brouillon (modifiable)</span>
              <button className="btn-ghost btn-sm" onClick={rediger} disabled={busy}>
                {busy ? <Spinner /> : <RefreshCw size={14} />} Autre version
              </button>
            </div>
            {canal === "mail" && <input className="input font-medium" value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Objet" />}
            <textarea className="input text-[15px] leading-relaxed" rows={canal === "mail" ? 11 : 6} value={texte} onChange={(e) => setTexte(e.target.value)} />
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>Rien n&apos;est envoyé automatiquement : vous relisez et envoyez depuis votre téléphone.</span>
              {canal !== "mail" && <span className="shrink-0 ml-2">{texte.length} car.</span>}
            </div>
            {logged && (
              <div className="flex items-center gap-2 rounded-xl bg-ok/10 px-3 py-2 text-xs text-ok">
                <Check size={14} /> Ajouté à l&apos;historique du contact
              </div>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
