"use client";

/* ============================================================
   Avis locatif express — version imprimable (PDF via Ctrl+P).
   Reçoit les données par query params, n'imprime aucun montant
   ni identité de tiers : uniquement le bien, la fourchette et
   le commentaire du conseiller.
   ============================================================ */

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { eur } from "@/lib/format";
import { CONFIANCE_TONE } from "@/components/estimations/shared";
import { Badge } from "@/components/ui";
import { quartierDe } from "@/components/estimations/shared";

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton h-64" />}>
      <Avis />
    </Suspense>
  );
}

function Avis() {
  const p = useSearchParams();
  const g = (k: string) => p.get(k) ?? undefined;
  const adresse = g("adresse") ?? "";
  const ville = g("ville");
  const quartier = g("quartier");
  const type = g("type") === "maison" ? "Maison" : "Appartement";
  const surface = Number(g("surface"));
  const pieces = g("pieces");
  const meuble = g("meuble") === "1";
  const bas = Number(g("bas"));
  const central = Number(g("central"));
  const haut = Number(g("haut"));
  const loyerM2 = Number(g("loyerM2"));
  const confiance = g("confiance");
  const conseille = Number(g("conseille"));
  const commentaire = g("commentaire");
  const date = new Date().toLocaleDateString("fr-FR", { dateStyle: "long" });

  useEffect(() => {
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto max-w-2xl print:max-w-none">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href="/locatives" className="btn-ghost btn-sm">
          <ArrowLeft size={15} /> Retour
        </Link>
        <button type="button" onClick={() => window.print()} className="btn-primary btn-sm">
          <Printer size={15} /> Imprimer / PDF
        </button>
      </div>
      <div className="card card-pad space-y-6 print:border-0 print:shadow-none">
        <div className="space-y-1 border-b border-line pb-4">
          <div className="h-title text-2xl">Avis locatif</div>
          <div className="text-xs text-muted">PATRIM · Toulouse · {date}</div>
        </div>
        <div>
          <div className="text-xs text-muted">Bien concerné</div>
          <div className="font-medium">{adresse}</div>
          <div className="text-sm text-muted">
            {ville}
            {quartier ? ` · quartier ${quartier}` : ""}
          </div>
          <div className="mt-1 text-sm">
            {type}
            {surface ? ` · ${surface.toLocaleString("fr-FR")} m²` : ""}
            {pieces ? ` · ${pieces} pièce${Number(pieces) > 1 ? "s" : ""}` : ""} · location {meuble ? "meublée" : "vide"}
          </div>
        </div>
        {central > 0 && (
          <div>
            <div className="text-xs text-muted">Loyer de marché estimé</div>
            <div className="font-serif text-3xl font-semibold tabular-nums">
              {eur(central)}
              <span className="text-base font-normal text-muted"> / mois hors charges</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              Fourchette : {eur(bas)} – {eur(haut)}
              {loyerM2 > 0 ? ` · ${loyerM2.toLocaleString("fr-FR")} €/m²` : ""}
            </div>
            {confiance && (
              <div className="mt-2">
                <Badge tone={CONFIANCE_TONE[confiance as keyof typeof CONFIANCE_TONE]}>Fiabilité {confiance}</Badge>
              </div>
            )}
            {conseille > 0 && (
              <div className="mt-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                Loyer de présentation conseillé : <span className="font-semibold tabular-nums">{eur(conseille)}</span> / mois
              </div>
            )}
          </div>
        )}
        {commentaire && <div className="whitespace-pre-wrap text-sm leading-relaxed">{commentaire}</div>}
        <div className="border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
          Avis indicatif établi à partir des loyers constatés par l'agence sur le secteur et les références disponibles le jour de sa réalisation. Ce document ne constitue ni une offre de location ni une expertise locative : le loyer définitif dépend de l'état réel du bien le jour de la visite, des pièces justificatives et de la réglementation en vigueur (encadrement des loyers, décence, etc.).
        </div>
      </div>
    </div>
  );
}
