"use client";

import Link from "next/link";
import { BedDouble, Camera, Clock, DoorOpen, Layers, Ruler, Users } from "lucide-react";
import { Badge, DpeBadge, cx } from "@/components/ui";
import type { Bien } from "@/lib/types";
import { STATUT_BIEN, eur, m2 } from "@/lib/format";
import { BienCover } from "./BienVisual";
import { joursDepuis, prixM2 } from "./utils";

export function BienCard({ bien: b, matches, index = 0 }: { bien: Bien; matches: number; index?: number }) {
  const st = STATUT_BIEN[b.statut] ?? STATUT_BIEN.estimation;
  const pm2 = prixM2(b);
  const jours = joursDepuis(b.dateMiseEnVente);
  const actif = b.statut !== "vendu" && b.statut !== "retire";
  return (
    <Link
      href={`/biens/${b.id}`}
      className="group card card-hover overflow-hidden flex flex-col min-w-0 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <BienCover photo={b.photos?.[0]} type={b.type} alt={b.titre} compact className="h-full w-full transition duration-700 ease-out group-hover:scale-[1.04]" />
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/30 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/70 via-black/25 to-transparent pointer-events-none" />
        <div className="absolute left-3 top-3 flex items-center gap-1.5">
          <span className="rounded-full bg-surface shadow-[0_2px_8px_rgba(0,0,0,.18)]">
            <Badge tone={st.tone}>{st.label}</Badge>
          </span>
          {b.mandat?.type === "exclusif" && <span className="rounded-full bg-ink/80 px-2 h-[22px] inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-white">Exclusif</span>}
        </div>
        {b.dpe && (
          <div className="absolute right-3 top-3 shadow-sm rounded-md">
            <DpeBadge value={b.dpe} />
          </div>
        )}
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          <div className="min-w-0 text-white drop-shadow-[0_1px_8px_rgba(0,0,0,.35)]">
            <div className="font-serif text-[26px] font-semibold tracking-tight leading-none tabular-nums">{b.prix ? eur(b.prix) : <span className="font-sans text-sm font-medium text-white/85">Prix à définir</span>}</div>
            {pm2 && <div className="mt-1 text-[11px] font-medium text-white/75 tabular-nums">{eur(pm2)}/m²</div>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {actif && matches > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 h-6 text-[11px] font-semibold text-white shadow ring-1 ring-white/15">
                <Users size={12} /> {matches} acquéreur{matches > 1 ? "s" : ""}
              </span>
            )}
            {(b.photos?.length ?? 0) > 1 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2 h-6 text-[11px] font-medium text-white backdrop-blur">
                <Camera size={12} /> {b.photos!.length}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug line-clamp-1">{b.titre || "Bien sans titre"}</h3>
        <p className="mt-0.5 text-sm text-muted line-clamp-1">
          {[b.quartier, b.adresse, b.ville].filter(Boolean).join(" · ") || "Adresse à compléter"}
        </p>

        <div className="mt-3 mb-3 flex flex-wrap gap-1.5">
          {b.surface != null && (
            <span className="chip">
              <Ruler size={12} /> {m2(b.surface)}
            </span>
          )}
          {b.pieces != null && (
            <span className="chip">
              <DoorOpen size={12} /> {b.pieces} p.
            </span>
          )}
          {b.chambres != null && b.chambres > 0 && (
            <span className="chip">
              <BedDouble size={12} /> {b.chambres} ch.
            </span>
          )}
          {b.etage != null && (
            <span className="chip">
              <Layers size={12} /> {b.etage === 0 ? "RDC" : `${b.etage}e`}
              {b.ascenseur ? " · asc." : ""}
            </span>
          )}
        </div>

        <div className="mt-auto pt-3 border-t border-line/60 flex items-center justify-between text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {jours != null ? (actif ? `En vente depuis ${jours} j` : `Mis en vente il y a ${jours} j`) : `Ajouté le ${new Date(b.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`}
          </span>
          {b.ref && <span className={cx("font-mono text-[11px] text-muted/80")}>{b.ref}</span>}
        </div>
      </div>
    </Link>
  );
}

export function BienCardSkeleton() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[16/10] !rounded-none" />
      <div className="p-4 space-y-2.5">
        <div className="skeleton h-5 w-2/3" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}
