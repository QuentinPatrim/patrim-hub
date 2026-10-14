"use client";

import { Flame, Mail, MessageCircle, MessageSquareText, Phone } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cx } from "@/components/ui";
import type { Contact } from "@/lib/types";
import { mailHref, smsHref, telHref, waHref } from "./helpers";

/* Petits éléments visuels du module Contacts. */

const CHALEUR_LABEL = { 1: "Froid", 2: "Tiède", 3: "Chaud" } as const;

export function Flames({ value, size = 14, className }: { value?: 1 | 2 | 3; size?: number; className?: string }) {
  const v = value ?? 0;
  return (
    <span className={cx("inline-flex items-center", className)} title={v ? CHALEUR_LABEL[v as 1 | 2 | 3] : "Chaleur non renseignée"} aria-label={v ? `Chaleur : ${CHALEUR_LABEL[v as 1 | 2 | 3]}` : undefined}>
      {[1, 2, 3].map((i) => (
        <Flame key={i} size={size} strokeWidth={2} className={cx("-ml-0.5 first:ml-0 transition-colors", i <= v ? "text-coral fill-coral/25" : "text-line")} />
      ))}
    </span>
  );
}

/** Sélecteur de chaleur (1 à 3 flammes), re-cliquer la même valeur l'efface. */
export function FlamesPicker({ value, onChange }: { value?: 1 | 2 | 3; onChange: (v: 1 | 2 | 3 | undefined) => void }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-surface-2 p-1 gap-0.5">
      {([1, 2, 3] as const).map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(value === i ? undefined : i)}
          className={cx("h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1 transition", value === i ? "bg-surface shadow-sm text-fg" : "text-muted hover:text-fg")}
        >
          <Flames value={i} size={12} />
          <span className="hidden sm:inline">{CHALEUR_LABEL[i]}</span>
        </button>
      ))}
    </div>
  );
}

function ActionBtn({ href, label, children, onClick, external, size = "sm" }: { href?: string; label: string; children: ReactNode; onClick?: (e: MouseEvent) => void; external?: boolean; size?: "sm" | "md" }) {
  const cls = cx(
    "grid place-items-center rounded-xl border border-line bg-surface transition active:scale-95",
    size === "md" ? "size-11" : "size-10",
    href ? "text-fg hover:bg-surface-2 hover:border-accent/30 hover:text-accent" : "text-line pointer-events-none"
  );
  if (!href)
    return (
      <span className={cls} aria-label={`${label} (indisponible)`} title={`${label} : coordonnée manquante`}>
        {children}
      </span>
    );
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className={cls}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
    </a>
  );
}

/** Boutons rapides : appeler, SMS, WhatsApp, mail. */
export function QuickActions({ contact, size = "sm", onAction }: { contact: Contact; size?: "sm" | "md"; onAction?: (kind: "appel" | "sms" | "whatsapp" | "mail") => void }) {
  const ic = size === "md" ? 19 : 17;
  return (
    <div className="flex items-center gap-1.5">
      <ActionBtn size={size} label="Appeler" href={telHref(contact.tel)} onClick={() => onAction?.("appel")}>
        <Phone size={ic} />
      </ActionBtn>
      <ActionBtn size={size} label="SMS" href={smsHref(contact.tel)} onClick={() => onAction?.("sms")}>
        <MessageSquareText size={ic} />
      </ActionBtn>
      <ActionBtn size={size} label="WhatsApp" href={waHref(contact.tel)} external onClick={() => onAction?.("whatsapp")}>
        <MessageCircle size={ic} />
      </ActionBtn>
      <ActionBtn size={size} label="Mail" href={mailHref(contact.email)} onClick={() => onAction?.("mail")}>
        <Mail size={ic} />
      </ActionBtn>
    </div>
  );
}

/** Pastille de toggle (oui / non) */
export function Toggle({ checked, onChange, label, hint }: { checked?: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start gap-3 rounded-xl px-1 py-2 text-left">
      <span className={cx("mt-0.5 relative inline-flex h-6 w-10 shrink-0 rounded-full transition", checked ? "bg-brand" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted leading-relaxed">{hint}</span>}
      </span>
    </button>
  );
}

/** Puce sélectionnable */
export function PickChip({ active, onClick, children, className }: { active?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition active:scale-[.97]",
        active ? "bg-brand border-brand text-white shadow-sm" : "bg-surface border-line text-fg/80 hover:border-accent/40",
        className
      )}
    >
      {children}
    </button>
  );
}
