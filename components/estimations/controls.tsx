"use client";

/* Petits contrôles tactiles du module Estimations. */

import { Minus, Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

/** Choix unique sous forme de pastilles larges (≥ 40 px), pratiques au doigt. */
export function Choix<T extends string | number>({
  value,
  onChange,
  options,
  allowEmpty,
  className,
  size = "md",
}: {
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  options: { value: T; label: ReactNode; hint?: ReactNode }[];
  allowEmpty?: boolean;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            type="button"
            key={String(o.value)}
            aria-pressed={on}
            onClick={() => onChange(on && allowEmpty ? undefined : o.value)}
            className={cx(
              "rounded-xl border px-3.5 text-sm font-medium transition active:scale-[.97]",
              size === "lg" ? "h-12 flex-1 min-w-[120px]" : "h-10",
              on ? "border-accent bg-accent text-white shadow-sm dark:text-bg" : "border-line bg-surface text-fg hover:bg-surface-2"
            )}
          >
            <span className="flex items-center justify-center gap-2">{o.label}</span>
            {o.hint && <span className={cx("block text-[10px] font-normal -mt-0.5", on ? "text-white/80 dark:text-bg/70" : "text-muted")}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Compteur({
  value,
  onChange,
  min = 0,
  max = 99,
  format,
  placeholder = "—",
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  format?: (v: number) => ReactNode;
  placeholder?: string;
}) {
  const v = value;
  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-label="Moins" className="btn-secondary !px-0 size-11 !h-11 rounded-xl" disabled={v == null || v <= min} onClick={() => onChange(v == null ? min : Math.max(min, v - 1))}>
        <Minus size={18} />
      </button>
      <div className="min-w-[88px] text-center text-base font-semibold tabular-nums">{v == null ? <span className="text-muted font-normal">{placeholder}</span> : format ? format(v) : v}</div>
      <button type="button" aria-label="Plus" className="btn-secondary !px-0 size-11 !h-11 rounded-xl" disabled={v != null && v >= max} onClick={() => onChange(v == null ? min : Math.min(max, v + 1))}>
        <Plus size={18} />
      </button>
    </div>
  );
}

export function Interrupteur({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 min-h-12 py-2 text-left hover:bg-surface-2 transition">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
      <span className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-accent" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all", checked ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}

/** Champ numérique avec unité, clavier numérique sur téléphone. */
export function Nombre({
  value,
  onChange,
  unit,
  placeholder,
  decimal,
  className,
  autoFocus,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  unit?: string;
  placeholder?: string;
  decimal?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  const fmt = (v: number | undefined) => (v == null || isNaN(v) ? "" : decimal ? String(v).replace(".", ",") : v.toLocaleString("fr-FR"));
  const parse = (t: string) => {
    const raw = t.replace(/[\s\u202f\u00a0]/g, "").replace(",", ".");
    if (!raw) return undefined;
    const n = decimal ? parseFloat(raw) : parseInt(raw.replace(/\D/g, ""), 10);
    return isNaN(n) ? undefined : n;
  };
  const [txt, setTxt] = useState(() => fmt(value));
  useEffect(() => {
    if (parse(txt) !== value) setTxt(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cx("relative", className)}>
      <input
        className={cx("input tabular-nums", unit && "pr-12")}
        inputMode={decimal ? "decimal" : "numeric"}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={txt}
        onChange={(e) => {
          const t = decimal ? e.target.value.replace(/[^\d,.\s]/g, "") : e.target.value.replace(/[^\d\s\u202f\u00a0]/g, "");
          const n = parse(t);
          setTxt(decimal ? t : fmt(n));
          onChange(n);
        }}
        onBlur={() => setTxt(fmt(parse(txt)))}
      />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span>}
    </div>
  );
}
