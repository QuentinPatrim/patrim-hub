"use client";

import { Crosshair, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner, cx } from "@/components/ui";
import { adresseIci, chercherAdresses, type Suggestion } from "./shared";

/** Saisie d'adresse avec suggestions (Base Adresse Nationale) et bouton « Je suis sur place ». */
export function AdresseInput({ value, onText, onPick, autoFocus }: { value: string; onText: (t: string) => void; onPick: (s: Suggestion) => void; autoFocus?: boolean }) {
  const [list, setList] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState("");
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 4) {
      setList([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const s = await chercherAdresses(q, ctrl.signal);
        setList(s);
        setOpen(true);
        setErr("");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  const pick = (s: Suggestion) => {
    typed.current = false;
    setOpen(false);
    setList([]);
    onPick(s);
  };

  const locate = () => {
    if (!("geolocation" in navigator)) return setErr("La localisation n'est pas disponible sur cet appareil.");
    setLocating(true);
    setErr("");
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          const s = await adresseIci(p.coords.latitude, p.coords.longitude);
          if (s) pick(s);
          else setErr("Aucune adresse trouvée à cet endroit.");
        } catch (e) {
          setErr((e as Error).message);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setErr("Localisation refusée. Saisissez l'adresse.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="input !h-12 pl-9 pr-9 text-[15px]"
            placeholder="12 rue de Metz, Toulouse"
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => {
              typed.current = true;
              onText(e.target.value);
            }}
            onFocus={() => list.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {loading && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 text-muted" />}
        </div>
        <button type="button" onClick={locate} disabled={locating} className="btn-secondary !h-12 !px-3.5 shrink-0" aria-label="Je suis sur place" title="Je suis sur place">
          {locating ? <Spinner /> : <Crosshair size={18} />}
          <span className="hidden sm:inline">Sur place</span>
        </button>
      </div>
      {err && <p className="mt-1.5 text-[11px] text-danger">{err}</p>}
      {open && list.length > 0 && (
        <div className="liste-suggestions absolute z-20 mt-1.5 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-card animate-fade-up">
          {list.map((s, i) => (
            <button
              type="button"
              key={s.label + i}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              className={cx("flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2 transition", i > 0 && "border-t border-line")}
            >
              <MapPin size={16} className="mt-0.5 shrink-0 text-accent" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{s.rue || s.label}</span>
                <span className="block truncate text-[11px] text-muted">
                  {s.codePostal} {s.ville}
                  {!s.precis && " · adresse approximative"}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
