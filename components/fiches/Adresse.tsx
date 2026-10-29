"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { cx, Field } from "@/components/ui";

/* Adresse en trois champs (rue, code postal, ville), avec les adresses
   proposées pendant la frappe et la ville trouvée d'après le code postal.
   Les propositions viennent de la Base adresse nationale (service public,
   appelé depuis le navigateur du client : rien ne passe par le Hub). */

export interface PartsAdresse {
  rue?: string;
  cp?: string;
  ville?: string;
}

interface Proposition {
  rue: string;
  cp: string;
  ville: string;
  label: string;
}

const SOURCES = ["https://data.geopf.fr/geocodage/search", "https://api-adresse.data.gouv.fr/search/"];

async function chercher(q: string, signal: AbortSignal): Promise<Proposition[]> {
  // Résultats d'abord autour de Toulouse, sans exclure le reste de la France
  const params = `?q=${encodeURIComponent(q)}&index=address&autocomplete=1&limit=5&lat=43.6&lon=1.44`;
  for (const src of SOURCES) {
    try {
      const r = await fetch(src + params, { signal, referrerPolicy: "no-referrer" });
      if (!r.ok) continue;
      const j = (await r.json()) as { features?: { properties?: Record<string, string> }[] };
      return (j.features ?? [])
        .map((f) => f.properties ?? {})
        .filter((p) => p.postcode && p.city)
        .map((p) => ({ rue: p.name || p.street || "", cp: p.postcode, ville: p.city, label: p.label || `${p.name}, ${p.postcode} ${p.city}` }));
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
    }
  }
  return [];
}

async function communes(cp: string): Promise<string[]> {
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${cp}&fields=nom`, { referrerPolicy: "no-referrer" });
    if (!r.ok) return [];
    const j = (await r.json()) as { nom?: string }[];
    return [...new Set(j.map((c) => c.nom).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "fr"));
  } catch {
    return [];
  }
}

export function ChampsAdresse({ label, value, onChange, hint, placeholder = "Numéro et nom de la rue" }: { label: string; value: PartsAdresse; onChange: (v: PartsAdresse) => void; hint?: string; placeholder?: string }) {
  const [props, setProps] = useState<Proposition[]>([]);
  const [focus, setFocus] = useState(false);
  const [villes, setVilles] = useState<string[]>([]);
  const tape = useRef(false);
  const dernierCp = useRef(value.cp ?? "");

  // Propositions d'adresses pendant la frappe
  useEffect(() => {
    const q = value.rue?.trim() ?? "";
    if (!tape.current || q.length < 4) return setProps([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      chercher([q, value.cp, value.ville].filter(Boolean).join(" "), ctrl.signal)
        .then(setProps)
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.rue]);

  // Code postal complet : la ville se remplit (ou se choisit s'il y en a plusieurs)
  useEffect(() => {
    const cp = value.cp ?? "";
    if (!/^\d{5}$/.test(cp) || cp === dernierCp.current) return;
    dernierCp.current = cp;
    let actif = true;
    communes(cp).then((liste) => {
      if (!actif) return;
      if (liste.length === 1) {
        setVilles([]);
        if (value.ville !== liste[0]) onChange({ ...value, ville: liste[0] });
      } else setVilles(liste.filter((v) => v !== value.ville));
    });
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cp]);

  const choisir = (p: Proposition) => {
    tape.current = false;
    dernierCp.current = p.cp;
    setProps([]);
    setVilles([]);
    onChange({ rue: p.rue, cp: p.cp, ville: p.ville });
  };

  return (
    <div className="space-y-3">
      <Field label={label} hint={hint}>
        <input
          className="input !h-12 !text-base"
          value={value.rue ?? ""}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          onChange={(e) => {
            tape.current = true;
            onChange({ ...value, rue: e.target.value });
          }}
        />
      </Field>
      {focus && props.length > 0 && (
        <ul className="-mt-1 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg" role="listbox">
          {props.map((p) => (
            <li key={p.label}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisir(p)}
                className="flex min-h-12 w-full items-center gap-3 border-b border-line/60 px-4 py-2.5 text-left text-sm last:border-0 hover:bg-surface-2"
              >
                <MapPin size={15} className="shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.rue}</span>
                  <span className="block text-xs text-muted">
                    {p.cp} {p.ville}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[7.5rem_1fr] gap-3">
        <Field label="Code postal">
          <input
            className="input !h-12 !text-base tabular-nums"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={value.cp ?? ""}
            onChange={(e) => onChange({ ...value, cp: e.target.value.replace(/\D/g, "").slice(0, 5) })}
          />
        </Field>
        <Field label="Ville">
          <input className="input !h-12 !text-base" autoComplete="address-level2" value={value.ville ?? ""} onChange={(e) => onChange({ ...value, ville: e.target.value })} />
        </Field>
      </div>
      {villes.length > 0 && (
        <div className="-mt-1 flex flex-wrap gap-2">
          {villes.slice(0, 8).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setVilles([]);
                onChange({ ...value, ville: v });
              }}
              className={cx("min-h-10 rounded-full border border-line bg-surface px-3.5 text-sm text-fg/80 transition active:scale-[.97]")}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
