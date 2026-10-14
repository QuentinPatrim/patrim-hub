"use client";

/* Petits éléments d'interface propres au Studio et à l'Assistant. */

import { Check } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui";

/** Message bref affiché en haut de l'écran ("Copié", "Enregistré"…). */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  const node = msg ? (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+68px)] lg:top-6 z-[70] flex justify-center px-4">
      <div className="animate-fade-up flex items-center gap-2 rounded-full bg-ink px-4 h-10 text-sm font-medium text-white shadow-2xl">
        <Check size={16} className="text-coral" /> {msg}
      </div>
    </div>
  ) : null;
  return { toast, node };
}

/** Zone de texte qui grandit avec son contenu. */
export function AutoTextarea({ className, value, minRows = 3, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  };
  useLayoutEffect(resize, [value]);
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return <textarea ref={ref} rows={minRows} value={value} className={cx("input resize-none", className)} {...rest} />;
}

/** Interrupteur simple. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2.5 min-h-10 text-left" title={hint}>
      <span className={cx("relative h-6 w-10 rounded-full transition", checked ? "bg-brand" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="text-sm">
        {label}
        {hint && <span className="block text-[11px] text-muted leading-tight">{hint}</span>}
      </span>
    </button>
  );
}

/** Choix segmenté (pastilles). */
export function Segmented<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; hint?: string }[]; className?: string }) {
  return (
    <div className={cx("flex flex-wrap gap-1.5", className)}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          title={it.hint}
          onClick={() => onChange(it.value)}
          className={cx(
            "h-9 px-3.5 rounded-full border text-xs font-medium transition",
            value === it.value ? "border-brand bg-brand text-white shadow-sm" : "border-line bg-surface text-fg/80 hover:bg-surface-2"
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Compte les "[À compléter …]" d'un texte. */
export const aCompleter = (t: string) => (t.match(/\[À compléter[^\]]*\]/gi) ?? []).length;
