"use client";

import Link from "next/link";
import { Send, TrendingDown } from "lucide-react";
import { BIEN_DISPONIBLE } from "@/lib/matching";
import { dateCourte, eur } from "@/lib/format";
import { baisseEnCours, baisseRecente, type BienBaisse } from "./baisse";

/** Sous le prix, en haut de la fiche : la baisse pas encore annoncée à tout le monde. */
export function BaisseEnTete({ b, restants }: { b: BienBaisse; restants: number }) {
  const baisse = baisseRecente(b);
  if (!baisse || !restants || !BIEN_DISPONIBLE(b)) return null;
  return (
    <Link href={`/biens/${b.id}/baisse`} className="mt-1.5 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
      <TrendingDown size={15} className="shrink-0" />
      {baisse.de ? <span className="font-normal text-muted line-through">{eur(baisse.de)}</span> : null}
      Prévenir {restants} acquéreur{restants > 1 ? "s" : ""}
    </Link>
  );
}

/** Dans « Prix & mandat » : la baisse en cours et qui a été prévenu, ou le lien pour en annoncer une. */
export function BaisseFiche({ b, restants }: { b: BienBaisse; restants: number }) {
  if (!BIEN_DISPONIBLE(b)) return null;
  const baisse = baisseEnCours(b);
  const lien = `/biens/${b.id}/baisse`;
  if (!baisse)
    return (
      <Link href={lien} className="btn-ghost btn-sm mt-2 w-full text-muted">
        <TrendingDown size={14} /> Annoncer une baisse de prix
      </Link>
    );
  const prevenus = Object.keys(baisse.prevenus ?? {}).length;
  return (
    <div className="mt-3 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <TrendingDown size={15} className="shrink-0 text-accent" />
        {baisse.de ? <span className="whitespace-nowrap text-muted line-through">{eur(baisse.de)}</span> : null}
        <span className="whitespace-nowrap font-semibold">{eur(baisse.a)}</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">
        Baisse du {dateCourte(baisse.date)}
        {prevenus ? ` · ${prevenus} acquéreur${prevenus > 1 ? "s" : ""} prévenu${prevenus > 1 ? "s" : ""}` : ""}
      </div>
      <Link href={lien} className={`${restants ? "btn-primary" : "btn-secondary"} btn-sm mt-2 w-full`}>
        <Send size={14} /> {restants ? `Prévenir ${restants} acquéreur${restants > 1 ? "s" : ""}` : prevenus ? "Voir les acquéreurs prévenus" : "Voir les acquéreurs"}
      </Link>
    </div>
  );
}
