"use client";

/* Petits composants partagés de PATRIM Hub. Tout le design passe par ici
   et par les classes .card / .btn-* / .input / .chip de globals.css. */

import clsx from "clsx";
import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { Tone } from "@/lib/format";

export { clsx as cx };

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  ok: "bg-ok/10 text-ok border-ok/20",
  warn: "bg-warn/10 text-warn border-warn/25",
  danger: "bg-danger/10 text-danger border-danger/20",
  brand: "bg-accent/10 text-accent border-accent/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 h-[22px] text-[11px] font-semibold whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-5 sm:mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="text-xs text-muted hover:text-fg mb-1 inline-block">
            ← Retour
          </Link>
        )}
        <h1 className="h-title truncate">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-4 sm:px-5 pt-4">
          <h2 className="h-section">{title}</h2>
          {action}
        </header>
      )}
      <div className={clsx(pad && "card-pad", title && pad && "pt-3")}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "brand" | "ok" | "warn" }) {
  return (
    <div className="card card-pad relative overflow-hidden">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        {icon && <span className={clsx("grid place-items-center size-8 rounded-xl", tone === "ok" ? "bg-ok/10 text-ok" : tone === "warn" ? "bg-warn/10 text-warn" : "bg-accent/10 text-accent")}>{icon}</span>}
      </div>
      <div className="mt-2 font-serif text-2xl sm:text-[28px] font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      {icon && <div className="mb-3 grid place-items-center size-12 rounded-2xl bg-accent/10 text-accent">{icon}</div>}
      <div className="font-medium">{title}</div>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: ReactNode }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/** Panneau modal : feuille du bas sur mobile, fenêtre centrée sur ordinateur. */
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className={clsx("relative w-full bg-surface border border-line shadow-2xl rounded-t-3xl sm:rounded-2xl max-h-[92dvh] flex flex-col animate-fade-up", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
          <div className="font-semibold">{title}</div>
          <button onClick={onClose} className="btn-ghost btn-sm !px-2" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex justify-end gap-2 safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-xl bg-surface-2 p-1 w-full sm:w-auto">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={clsx("h-8 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition", value === it.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {it.label}
          {it.count != null && <span className="ml-1.5 text-muted">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ text, className }: { text: string; className?: string }) {
  return <span className={clsx("grid place-items-center size-9 shrink-0 rounded-full bg-brand text-white text-xs font-semibold", className)}>{text}</span>;
}

export function DpeBadge({ value }: { value?: string }) {
  if (!value) return null;
  const colors: Record<string, string> = { A: "#009c6d", B: "#52b153", C: "#78bd76", D: "#f4e70f", E: "#f0b50f", F: "#eb8235", G: "#d7221f" };
  return (
    <span className="inline-grid place-items-center size-6 rounded-md text-[11px] font-bold text-white" style={{ background: colors[value] ?? "#999", color: value === "D" ? "#333" : "white" }}>
      {value}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block size-4 rounded-full border-2 border-current border-r-transparent animate-spin", className)} />;
}
