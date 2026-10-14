"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { cx, Field } from "@/components/ui";
import { TYPE_BIEN } from "@/lib/format";
import { TOULOUSE_QUARTIERS } from "@/lib/toulouseQuartiers";
import type { BienType, Criteres } from "@/lib/types";
import { PickChip, Toggle } from "./bits";
import { normalize } from "./helpers";

const TYPES: BienType[] = ["appartement", "maison", "terrain", "parking", "local", "immeuble"];
const AUTRES_SECTEURS = ["Toulouse", "Balma", "L'Union", "Saint-Orens", "Ramonville", "Tournefeuille", "Blagnac", "Colomiers", "Castanet", "Quint-Fonsegrives", "Montrabé", "Labège"];

/** Champ numérique tolérant (vide = undefined, espaces et "k" acceptés). */
export function NumInput({ value, onChange, placeholder, suffix, className }: { value?: number; onChange: (v?: number) => void; placeholder?: string; suffix?: string; className?: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  const shown = txt ?? (value != null ? value.toLocaleString("fr-FR") : "");
  return (
    <div className={cx("relative", className)}>
      <input
        inputMode="numeric"
        className={cx("input", suffix && "pr-10")}
        value={shown}
        placeholder={placeholder}
        onChange={(e) => {
          setTxt(e.target.value);
          onChange(parseNum(e.target.value));
        }}
        onBlur={() => setTxt(null)}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

export function parseNum(s?: string | number | null): number | undefined {
  if (s == null) return undefined;
  if (typeof s === "number") return isNaN(s) ? undefined : s;
  let t = s.toLowerCase().replace(/\s| | |€|eur/g, "").replace(",", ".");
  let mult = 1;
  if (/k$/.test(t)) {
    mult = 1000;
    t = t.slice(0, -1);
  } else if (/m$/.test(t) && !/m2$|m²$/.test(t)) {
    mult = 1_000_000;
    t = t.slice(0, -1);
  }
  t = t.replace(/m2$|m²$/, "");
  if (!t) return undefined;
  const n = parseFloat(t);
  return isNaN(n) ? undefined : Math.round(n * mult);
}

export function QuartiersInput({ value, onChange }: { value?: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const list = value ?? [];
  const sugg = useMemo(() => {
    const all = [...TOULOUSE_QUARTIERS.map((x) => x.name), ...AUTRES_SECTEURS];
    const s = normalize(q);
    return all.filter((n) => !list.includes(n) && (!s || normalize(n).includes(s))).slice(0, s ? 8 : 14);
  }, [q, list]);
  const add = (n: string) => {
    const v = n.trim();
    if (v && !list.includes(v)) onChange([...list, v]);
    setQ("");
  };
  return (
    <div>
      {list.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {list.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full bg-accent/10 text-accent text-xs font-medium border border-accent/20">
              {n}
              <button type="button" className="grid place-items-center size-6 rounded-full hover:bg-accent/15" onClick={() => onChange(list.filter((x) => x !== n))} aria-label={`Retirer ${n}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          className="input"
          value={q}
          placeholder="Ajouter un quartier ou une commune…"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(sugg[0] && q ? sugg[0] : q);
            }
          }}
        />
        {q && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(q)} className="absolute right-1.5 top-1/2 -translate-y-1/2 btn-ghost btn-sm !px-2" aria-label="Ajouter">
            <Plus size={15} />
          </button>
        )}
      </div>
      {focus && sugg.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:flex-wrap sm:overflow-visible">
          {sugg.map((n) => (
            <button
              key={n}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(n)}
              className="shrink-0 h-8 px-3 rounded-full border border-dashed border-line text-xs text-fg/80 hover:border-accent/50 hover:text-accent"
            >
              + {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Éditeur des critères de recherche (complet ou réduit à l'essentiel). */
export function CriteresEditor({ value, onChange, compact }: { value?: Criteres; onChange: (v: Criteres) => void; compact?: boolean }) {
  const k = value ?? {};
  const set = (p: Partial<Criteres>) => onChange({ ...k, ...p });
  const toggleType = (t: BienType) => {
    const cur = k.types ?? [];
    set({ types: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  };
  return (
    <div className="space-y-4">
      <div>
        <span className="label">Type de bien</span>
        <div className="flex flex-wrap gap-1.5">
          {(compact ? TYPES.slice(0, 3) : TYPES).map((t) => (
            <PickChip key={t} active={k.types?.includes(t)} onClick={() => toggleType(t)}>
              {TYPE_BIEN[t]}
            </PickChip>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!compact && (
          <Field label="Budget min.">
            <NumInput value={k.budgetMin} onChange={(v) => set({ budgetMin: v })} suffix="€" placeholder="—" />
          </Field>
        )}
        <Field label="Budget max." className={compact ? "col-span-2" : undefined}>
          <NumInput value={k.budgetMax} onChange={(v) => set({ budgetMax: v })} suffix="€" placeholder="ex. 320 000" />
        </Field>
        <Field label="Surface min.">
          <NumInput value={k.surfaceMin} onChange={(v) => set({ surfaceMin: v })} suffix="m²" placeholder="—" />
        </Field>
        <Field label="Pièces min.">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set({ piecesMin: k.piecesMin === n ? undefined : n })}
                className={cx("h-10 flex-1 rounded-xl border text-sm font-medium transition", k.piecesMin === n ? "bg-brand border-brand text-white" : "border-line bg-surface hover:border-accent/40")}
              >
                {n}
                {n === 5 ? "+" : ""}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div>
        <span className="label">Quartiers / secteurs</span>
        <QuartiersInput value={k.quartiers} onChange={(v) => set({ quartiers: v })} />
      </div>
      {!compact && (
        <>
          <div className="grid gap-0.5 sm:grid-cols-2">
            <Toggle checked={k.exterieur} onChange={(v) => set({ exterieur: v || undefined })} label="Extérieur indispensable" hint="Balcon, terrasse ou jardin" />
            <Toggle checked={k.parking} onChange={(v) => set({ parking: v || undefined })} label="Stationnement" hint="Parking, box ou garage" />
            <Toggle checked={k.ascenseur} onChange={(v) => set({ ascenseur: v || undefined })} label="Ascenseur" hint="Au-delà du 1er étage" />
            <Toggle checked={k.investissement} onChange={(v) => set({ investissement: v || undefined })} label="Investissement locatif" />
          </div>
          <Field label="Autres souhaits">
            <textarea className="input" rows={2} value={k.remarques ?? ""} onChange={(e) => set({ remarques: e.target.value || undefined })} placeholder="Calme, proche métro, pas de rez-de-chaussée…" />
          </Field>
        </>
      )}
    </div>
  );
}
