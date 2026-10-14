"use client";

/* Petits composants partagés de PATRIM Hub. Tout le design passe par ici
   et par les classes .card / .btn-* / .input / .chip de globals.css. */

import clsx from "clsx";
import { ChevronLeft, X } from "lucide-react";
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
  return <span className={clsx("inline-flex items-center gap-1 rounded-full border px-2 h-[22px] text-[11px] font-semibold tracking-[-0.005em] whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-6 sm:mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div className="min-w-0">
        {back ? (
          <Link href={back} className="-ml-1 mb-2 inline-flex items-center gap-1 h-8 pl-1 pr-2.5 rounded-full text-xs font-medium text-muted hover:text-fg hover:bg-fg/[0.05] transition">
            <ChevronLeft size={16} /> Retour
          </Link>
        ) : (
          <span aria-hidden className="mb-3 block h-[3px] w-7 rounded-full bg-coral" />
        )}
        <h1 className="h-title truncate">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted text-pretty">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 [&>*]:min-w-0">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 px-4 sm:px-5 pt-4 sm:pt-5 min-h-[44px]">
          <h2 className="h-section">{title}</h2>
          {action}
        </header>
      )}
      <div className={clsx(pad && "card-pad", title && pad && "!pt-3")}>{children}</div>
    </section>
  );
}

const STAT_TONE = {
  brand: "bg-accent/10 text-accent ring-accent/15",
  ok: "bg-ok/10 text-ok ring-ok/15",
  warn: "bg-warn/10 text-warn ring-warn/20",
};

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: "brand" | "ok" | "warn" }) {
  return (
    <div className="card p-4 sm:p-5 relative overflow-hidden min-w-0">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted leading-snug">{label}</span>
        {icon && <span className={clsx("grid place-items-center size-8 shrink-0 rounded-xl ring-1 ring-inset [&>svg]:size-4", STAT_TONE[tone ?? "brand"])}>{icon}</span>}
      </div>
      <div className="mt-3 font-serif text-[26px] sm:text-[30px] leading-none font-semibold tracking-tight tabular-nums truncate">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted leading-snug">{hint}</div>}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 sm:py-16 px-6 animate-fade-up">
      {icon && (
        <div className="relative mt-3 mb-9 grid place-items-center">
          <span aria-hidden className="absolute size-24 rounded-full bg-accent/[0.04] ring-1 ring-accent/[0.06]" />
          <span aria-hidden className="absolute size-[68px] rounded-full bg-accent/[0.06] ring-1 ring-accent/10" />
          <span className="relative grid place-items-center size-12 rounded-2xl bg-gradient-to-b from-brand-light to-brand text-white shadow-btn [&>svg]:size-[22px]">{icon}</span>
        </div>
      )}
      <div className="font-serif text-xl font-semibold tracking-tight">{title}</div>
      {text && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted text-pretty">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
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
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div className={clsx("relative w-full bg-surface border border-line/80 shadow-2xl rounded-t-[28px] sm:rounded-3xl max-h-[92dvh] flex flex-col animate-sheet-up", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <div aria-hidden className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-line" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 sm:pt-5 pb-3 border-b border-line/70">
          <div className="font-serif text-lg font-semibold tracking-tight min-w-0 truncate">{title}</div>
          <button onClick={onClose} className="grid place-items-center size-9 shrink-0 rounded-full bg-surface-2 text-muted hover:text-fg transition" aria-label="Fermer">
            <X size={17} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-line/70 flex justify-end gap-2 bg-surface rounded-b-[inherit]">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto no-scrollbar rounded-full border border-line/70 bg-surface-2/80 p-1 w-full sm:w-auto max-w-full">
      {items.map((it) => {
        const on = value === it.value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.value)}
            className={clsx(
              "inline-flex shrink-0 items-center gap-1.5 h-8 px-3.5 rounded-full text-xs font-semibold whitespace-nowrap transition duration-200",
              on ? "bg-surface text-fg shadow-[0_1px_2px_rgb(var(--shadow)/0.08),0_2px_8px_-2px_rgb(var(--shadow)/0.1)] ring-1 ring-line/70" : "text-muted hover:text-fg"
            )}
          >
            {it.label}
            {it.count != null && (
              <span className={clsx("min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[10px] tabular-nums", on ? "bg-accent/10 text-accent" : "bg-fg/[0.06] text-muted")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Avatar({ text, className }: { text: string; className?: string }) {
  return <span className={clsx("grid place-items-center size-9 shrink-0 rounded-full bg-gradient-to-br from-brand-light to-brand-dark text-white text-xs font-semibold tracking-wide ring-2 ring-surface shadow-xs", className)}>{text}</span>;
}

export function DpeBadge({ value }: { value?: string }) {
  if (!value) return null;
  const colors: Record<string, string> = { A: "#009c6d", B: "#52b153", C: "#78bd76", D: "#f4e70f", E: "#f0b50f", F: "#eb8235", G: "#d7221f" };
  return (
    <span className="inline-grid place-items-center size-6 rounded-md text-[11px] font-bold text-white shadow-xs ring-1 ring-inset ring-black/10" style={{ background: colors[value] ?? "#999", color: value === "D" ? "#333" : "white" }}>
      {value}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block size-4 rounded-full border-2 border-current border-r-transparent animate-spin", className)} />;
}
