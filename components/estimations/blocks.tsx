"use client";

import { Check, Mail, MessageSquare, Phone, Search, UserPlus, X, RotateCcw, EyeOff } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar, Badge, Field, cx } from "@/components/ui";
import { create, useCollection } from "@/lib/store";
import { dateCourte, eur, eurK, initiales, nomComplet, ROLE } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { Choix, Interrupteur } from "./controls";
import type { Vente } from "./shared";

/* ---------- Fourchette de prix ---------- */

export function Fourchette({ bas, median, haut, conseille, compact }: { bas: number; median: number; haut: number; conseille?: number; compact?: boolean }) {
  const min = Math.min(bas, conseille ?? bas);
  const max = Math.max(haut, conseille ?? haut);
  const span = max - min || 1;
  const pad = span * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const rel = (v: number) => (v - lo) / (hi - lo);
  const pos = (v: number) => `${rel(v) * 100}%`;
  return (
    <div className={cx("w-full", compact ? "pt-6" : "pt-8")}>
      <div className="relative h-3 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-accent/35 via-accent to-accent/35" style={{ left: pos(bas), right: `calc(100% - ${pos(haut)})` }} />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-4 rounded-full border-[3px] border-surface bg-accent shadow" style={{ left: pos(median) }} />
        {conseille != null && conseille > 0 && (
          <div className="absolute bottom-full mb-1.5 h-[26px]" style={{ left: pos(conseille) }}>
            <span className="absolute bottom-0 left-0 h-2 w-px bg-coral" />
            <span
              className={cx(
                "absolute bottom-2 rounded-md bg-coral px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-sm",
                rel(conseille) < 0.2 ? "left-0 -translate-x-1" : rel(conseille) > 0.8 ? "right-0 translate-x-1" : "left-0 -translate-x-1/2"
              )}
            >
              Conseillé {eurK(conseille)}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 text-center">
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wider text-muted">Basse</div>
          <div className="text-sm font-semibold tabular-nums">{eur(bas)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted">Médiane</div>
          <div className="text-sm font-semibold tabular-nums text-accent">{eur(median)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted">Haute</div>
          <div className="text-sm font-semibold tabular-nums">{eur(haut)}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Une vente comparable ---------- */

export function VenteItem({ v, atypique, onToggle, mediane }: { v: Vente; atypique?: boolean; onToggle?: () => void; mediane?: number }) {
  const ecart = mediane ? (v.prixM2 - mediane) / mediane : null;
  return (
    <div className={cx("flex items-stretch gap-3 rounded-2xl border bg-surface p-3 transition", v.exclu ? "border-dashed border-line opacity-55" : "border-line")}>
      <div className={cx("flex w-[78px] shrink-0 flex-col justify-center rounded-xl px-2 text-center", v.exclu ? "bg-surface-2" : "bg-accent/[.07]")}>
        <div className={cx("text-[15px] font-semibold tabular-nums leading-tight", v.exclu ? "line-through text-muted" : "text-accent")}>{v.prixM2.toLocaleString("fr-FR")}</div>
        <div className="text-[10px] text-muted">€/m²</div>
        {ecart != null && !v.exclu && Math.abs(ecart) >= 0.01 && (
          <div className={cx("mt-0.5 text-[10px] font-medium tabular-nums", ecart > 0 ? "text-ok" : "text-warn")}>
            {ecart > 0 ? "+" : ""}
            {Math.round(ecart * 100)} %
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{v.adresse}</div>
            <div className="truncate text-[11px] text-muted">
              {[v.ville, v.distance != null ? `à ${v.distance < 1000 ? `${v.distance} m` : `${(v.distance / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`}` : null].filter(Boolean).join(" · ")}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums">{eurK(v.prix)}</div>
            <div className="text-[11px] text-muted">{dateCourte(v.date)} {v.date?.slice(0, 4)}</div>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="chip">{v.surface.toLocaleString("fr-FR")} m²</span>
          {v.pieces ? <span className="chip">{v.pieces} p.</span> : null}
          {v.terrain ? <span className="chip">Terrain {v.terrain.toLocaleString("fr-FR")} m²</span> : null}
          {v.dependances ? <span className="chip">+ {v.dependances} dépendance{v.dependances > 1 ? "s" : ""}</span> : null}
          {v.source !== "dvf" && <Badge tone="info">{v.source === "agence" ? "Vente agence" : "Annonce"}</Badge>}
          {atypique && !v.exclu && <Badge tone="warn">Atypique</Badge>}
          {onToggle && (
            <button type="button" onClick={onToggle} className={cx("ml-auto btn-sm btn", v.exclu ? "btn-secondary" : "btn-ghost text-muted")}>
              {v.exclu ? (
                <>
                  <RotateCcw size={13} /> Réintégrer
                </>
              ) : (
                <>
                  <EyeOff size={13} /> Écarter
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Propriétaire (lien vers un contact) ---------- */

export function ContactPicker({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const { items: contacts } = useCollection("contacts");
  const [q, setQ] = useState("");
  const [nouveau, setNouveau] = useState(false);
  const selected = contacts.find((c) => c.id === value);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s
      ? contacts.filter((c) => [c.prenom, c.nom, c.tel, c.email].filter(Boolean).join(" ").toLowerCase().includes(s))
      : contacts.filter((c) => c.roles?.some((r) => r === "prospect_vendeur" || r === "vendeur"));
    return base.slice(0, 6);
  }, [contacts, q]);

  if (selected) return <ContactCarte c={selected} onClear={() => onChange(undefined)} />;

  if (nouveau) return <NouveauContact initial={q} onCancel={() => setNouveau(false)} onCreated={(c) => (setNouveau(false), onChange(c.id))} />;

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input pl-9" placeholder="Rechercher un contact…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length > 0 && (
        <div className="divide-y divide-line rounded-xl border border-line overflow-hidden">
          {list.map((c) => (
            <button type="button" key={c.id} onClick={() => onChange(c.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition">
              <Avatar text={initiales(c)} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{nomComplet(c)}</div>
                <div className="truncate text-[11px] text-muted">{[c.roles?.map((r) => ROLE[r]).join(", "), c.tel].filter(Boolean).join(" · ")}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn-secondary w-full" onClick={() => setNouveau(true)}>
        <UserPlus size={16} /> Nouveau propriétaire
      </button>
    </div>
  );
}

export function ContactCarte({ c, onClear, link }: { c: Contact; onClear?: () => void; link?: boolean }) {
  const tel = c.tel?.replace(/[^\d+]/g, "");
  const wa = tel ? tel.replace(/^0/, "33").replace(/^\+/, "") : "";
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex items-center gap-3">
        <Avatar text={initiales(c)} />
        <div className="min-w-0 flex-1">
          {link ? (
            <Link href={`/contacts/${c.id}`} className="block truncate font-medium hover:underline">
              {nomComplet(c)}
            </Link>
          ) : (
            <div className="truncate font-medium">{nomComplet(c)}</div>
          )}
          <div className="truncate text-xs text-muted">{[c.tel, c.email].filter(Boolean).join(" · ") || "Coordonnées à compléter"}</div>
        </div>
        {onClear && (
          <button type="button" onClick={onClear} className="btn-ghost btn-sm !px-2" aria-label="Changer de propriétaire">
            <X size={16} />
          </button>
        )}
      </div>
      {(tel || c.email) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tel && (
            <a href={`tel:${tel}`} className="btn-secondary btn-sm">
              <Phone size={13} /> Appeler
            </a>
          )}
          {tel && (
            <a href={`sms:${tel}`} className="btn-secondary btn-sm">
              <MessageSquare size={13} /> SMS
            </a>
          )}
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
              WhatsApp
            </a>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className="btn-secondary btn-sm">
              <Mail size={13} /> Mail
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function NouveauContact({ initial, onCancel, onCreated }: { initial: string; onCancel: () => void; onCreated: (c: Contact) => void }) {
  const [f, setF] = useState<{ civilite?: "M." | "Mme"; prenom: string; nom: string; tel: string; email: string; optinTel: boolean }>({
    prenom: "",
    nom: initial,
    tel: "",
    email: "",
    optinTel: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.nom.trim() || f.prenom.trim();
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Nouveau propriétaire</div>
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm !px-2" aria-label="Annuler">
          <X size={16} />
        </button>
      </div>
      <Choix value={f.civilite} allowEmpty onChange={(v) => set("civilite", v)} options={[{ value: "Mme", label: "Madame" }, { value: "M.", label: "Monsieur" }]} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Prénom">
          <input className="input" value={f.prenom} onChange={(e) => set("prenom", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Nom">
          <input className="input" value={f.nom} onChange={(e) => set("nom", e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <Field label="Téléphone">
        <input className="input" type="tel" inputMode="tel" value={f.tel} onChange={(e) => set("tel", e.target.value)} />
      </Field>
      <Field label="E-mail">
        <input className="input" type="email" inputMode="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Interrupteur checked={f.optinTel} onChange={(v) => set("optinTel", v)} label="Accepte d'être rappelé par téléphone" hint="Accord préalable obligatoire depuis le 11/08/2026" />
      <button
        type="button"
        className="btn-primary w-full"
        disabled={!ok}
        onClick={() => {
          const c = create("contacts", {
            civilite: f.civilite,
            prenom: f.prenom.trim() || undefined,
            nom: f.nom.trim() || f.prenom.trim(),
            tel: f.tel.trim() || undefined,
            email: f.email.trim() || undefined,
            roles: ["prospect_vendeur"],
            optinTel: f.optinTel,
            dernierContact: new Date().toISOString(),
            historique: [{ date: new Date().toISOString(), type: "note", texte: "Rendez-vous d'estimation." }],
          });
          onCreated(c);
        }}
      >
        <Check size={16} /> Enregistrer le contact
      </button>
    </div>
  );
}
