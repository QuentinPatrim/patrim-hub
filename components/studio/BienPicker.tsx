"use client";

import { Building2, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, cx, DpeBadge, Empty, Sheet } from "@/components/ui";
import { eur, STATUT_BIEN } from "@/lib/format";
import type { Bien } from "@/lib/types";
import { bienLigne } from "./shared";

export function BienThumb({ bien, className }: { bien?: Bien; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = bien?.photos?.[0];
  return (
    <span className={cx("relative grid place-items-center shrink-0 overflow-hidden rounded-xl bg-brand", className ?? "size-14")}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/emblem.png" alt="" className="size-full object-cover opacity-90" />
      )}
    </span>
  );
}

const ORDRE: Bien["statut"][] = ["en_vente", "mandat_signe", "sous_offre", "compromis", "vendu", "estimation", "retire"];

export function BienPicker({ biens, value, onChange }: { biens: Bien[]; value?: Bien; onChange: (b: Bien) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return biens
      .filter((b) => !s || [b.titre, b.quartier, b.ville, b.ref, b.adresse].some((x) => x?.toLowerCase().includes(s)))
      .sort((a, b) => ORDRE.indexOf(a.statut) - ORDRE.indexOf(b.statut) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }, [biens, q]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group card w-full flex items-center gap-3 p-3 sm:p-3.5 text-left transition hover:shadow-glow animate-fade-up"
        aria-label="Choisir le bien"
      >
        <BienThumb bien={value} className="size-14 sm:size-16" />
        <div className="min-w-0 flex-1">
          {value ? (
            <>
              <div className="flex items-center gap-2">
                <span className="font-serif text-[17px] sm:text-lg font-semibold truncate">{value.titre || "Bien sans titre"}</span>
              </div>
              <div className="text-xs text-muted truncate">{bienLigne(value)}</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-sm font-semibold">{eur(value.prix)}</span>
                <DpeBadge value={value.dpe} />
                <Badge tone={STATUT_BIEN[value.statut].tone}>{STATUT_BIEN[value.statut].label}</Badge>
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">Choisir un bien</div>
              <div className="text-xs text-muted">Pour créer annonces, visuels et vidéo</div>
            </>
          )}
        </div>
        <span className="hidden sm:inline text-xs text-muted group-hover:text-fg">Changer</span>
        <ChevronRight size={18} className="text-muted shrink-0" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Choisir un bien">
        {biens.length ? (
          <>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input autoFocus className="input pl-9" placeholder="Titre, quartier, référence…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="space-y-1.5">
              {list.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => {
                      onChange(b);
                      setOpen(false);
                    }}
                    className={cx("w-full flex items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-surface-2", value?.id === b.id && "bg-accent/5 ring-1 ring-accent/30")}
                  >
                    <BienThumb bien={b} className="size-12" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{b.titre || "Bien sans titre"}</div>
                      <div className="text-xs text-muted truncate">{bienLigne(b)}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-semibold">{eur(b.prix)}</div>
                      <Badge tone={STATUT_BIEN[b.statut].tone} className="mt-0.5">
                        {STATUT_BIEN[b.statut].label}
                      </Badge>
                    </div>
                  </button>
                </li>
              ))}
              {!list.length && <li className="py-8 text-center text-sm text-muted">Aucun bien ne correspond.</li>}
            </ul>
          </>
        ) : (
          <Empty
            icon={<Building2 size={22} />}
            title="Aucun bien pour l'instant"
            text="Ajoutez votre premier bien pour générer son kit de diffusion."
            action={
              <Link href="/biens" className="btn-primary">
                Ajouter un bien
              </Link>
            }
          />
        )}
      </Sheet>
    </>
  );
}
