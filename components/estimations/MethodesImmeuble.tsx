"use client";

/* Les trois approches de valeur d'un immeuble, avec le détail lot par lot.
   Modifiables pendant l'estimation (décote, rendement), en lecture sur la fiche. */

import { Card, Field, cx } from "@/components/ui";
import { eur } from "@/lib/format";
import { Nombre } from "./controls";
import { pctTexte, typeLotLabel, type ParamsImmeuble, type ResultatImmeuble } from "./immeuble";

export function MethodesImmeuble({ r, p, onParams, rayonBloc }: { r: ResultatImmeuble; p: ParamsImmeuble; onParams?: (x: Partial<ParamsImmeuble>) => void; rayonBloc?: number }) {
  const lignes = [
    {
      t: "Par les lots",
      v: r.parLots,
      d: r.sommeLots ? `Somme des lots ${eur(r.sommeLots)}, moins ${Math.round(p.decote * 100)} % de décote de vente en bloc` : "Lots à chiffrer",
    },
    {
      t: "Par le rendement",
      v: r.parRendement,
      d: r.loyers ? `Loyers ${eur(r.loyers)} par an à ${pctTexte(p.rendement)} brut` : "Aucun loyer saisi",
    },
    {
      t: "Immeubles vendus en bloc",
      v: r.parBlocs,
      d: r.parBlocs
        ? `${r.nbBlocs} ventes${rayonBloc ? ` à moins de ${rayonBloc >= 1000 ? `${(rayonBloc / 1000).toLocaleString("fr-FR")} km` : `${rayonBloc} m`}` : ""}, médiane ${r.blocM2?.toLocaleString("fr-FR")} €/m²`
        : r.nbBlocs === 1
          ? "Une seule vente : pas assez pour conclure"
          : "Aucune vente d'immeuble entier retrouvée",
    },
  ];
  return (
    <>
      <Card title="Les trois approches">
        <ul className="divide-y divide-line text-sm">
          {lignes.map((l) => (
            <li key={l.t} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className={cx("font-medium", !l.v && "text-muted")}>{l.t}</span>
                <span className="block text-[11px] text-muted">{l.d}</span>
              </span>
              <span className={cx("shrink-0 font-semibold tabular-nums", !l.v && "text-muted")}>{l.v ? eur(l.v) : "—"}</span>
            </li>
          ))}
          {r.travaux > 0 && (
            <li className="flex justify-between gap-3 py-2.5 text-[12px] text-muted">
              <span>Travaux à prévoir, déduits de chaque approche</span>
              <span className="tabular-nums">− {eur(r.travaux)}</span>
            </li>
          )}
          <li className="flex justify-between gap-3 py-2.5">
            <span className="font-medium">Valeur retenue (moyenne)</span>
            <span className="font-semibold tabular-nums text-accent">{eur(r.central)}</span>
          </li>
          {r.rendementBrut != null && (
            <li className="flex justify-between gap-3 py-2.5 text-[12px] text-muted">
              <span>Rendement sur cette valeur</span>
              <span className="tabular-nums">
                {pctTexte(r.rendementBrut)} brut{r.rendementNet != null && p.chargesAnnuelles ? ` · ${pctTexte(r.rendementNet)} net de charges` : ""}
              </span>
            </li>
          )}
        </ul>
        {onParams && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <Field label="Décote de vente en bloc" hint="Souvent 10 à 20 %">
              <Nombre value={Math.round(p.decote * 100)} onChange={(v) => onParams({ decote: Math.min(40, Math.max(0, v ?? 0)) / 100 })} unit="%" />
            </Field>
            <Field label="Rendement brut attendu" hint="Toulouse : 5,5 à 7,5 %">
              <Nombre value={Math.round(p.rendement * 1000) / 10} onChange={(v) => v && onParams({ rendement: Math.min(15, Math.max(2, v)) / 100 })} unit="%" decimal />
            </Field>
          </div>
        )}
      </Card>

      <Card title={`Valeur lot par lot (${r.lots.length})`}>
        <ul className="divide-y divide-line text-sm">
          {r.lots.map((v) => (
            <li key={v.lot.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="font-medium">{v.lot.nom}</span>
                <span className="text-muted">
                  {" "}
                  · {typeLotLabel(v.lot.type)}
                  {v.lot.surface ? ` · ${v.lot.surface.toLocaleString("fr-FR")} m²` : ""}
                  {v.lot.loue ? " · loué" : " · libre"}
                </span>
                <span className={cx("block text-[11px]", v.aChiffrer ? "text-warn" : "text-muted")}>{v.detail}</span>
              </span>
              <span className={cx("shrink-0 font-semibold tabular-nums", !v.valeur && "text-muted")}>{v.valeur ? eur(v.valeur) : "—"}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
