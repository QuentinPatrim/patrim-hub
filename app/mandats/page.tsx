"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileSignature } from "lucide-react";
import { Badge, Empty, PageHeader, Tabs, cx } from "@/components/ui";
import { AlertesMandats } from "@/components/mandats/AlertesMandats";
import { ETAT_MANDAT, TYPE_MANDAT, alertesMandats, dateMandat, nomBien, registre, type LigneRegistre } from "@/components/mandats/registre";
import { useCollection } from "@/lib/store";
import { STATUT_BIEN } from "@/lib/format";

/* Registre des mandats : numéro, type, dates et échéance de chaque mandat, avec les contrôles
   (numéro en double, mandat expiré alors que le bien est en vente, dates manquantes). */

type Vue = "en_cours" | "tous";

const jours = (n: number) => `${n} jour${n > 1 ? "s" : ""}`;

function periode(l: LigneRegistre) {
  const { debut, fin } = l.bien.mandat ?? {};
  if (debut && fin) return `du ${dateMandat(debut)} au ${dateMandat(fin)}`;
  if (debut) return `depuis le ${dateMandat(debut)}, fin inconnue`;
  if (fin) return `jusqu'au ${dateMandat(fin)}`;
  return "dates à compléter";
}

/** Badges d'une ligne : état du mandat (biens en cours) ou statut du bien, puis les anomalies. */
function Etat({ l }: { l: LigneRegistre }) {
  const e = ETAT_MANDAT[l.etat];
  return (
    <span className="flex flex-wrap gap-1.5">
      {l.actif ? (
        <Badge tone={e.tone}>
          {l.etat === "bientot" ? (l.jours ? `Fin dans ${jours(l.jours)}` : "Finit aujourd'hui") : l.etat === "expire" ? `Expiré depuis ${jours(l.jours ?? 0)}` : e.label}
        </Badge>
      ) : (
        <Badge>{STATUT_BIEN[l.bien.statut].label}</Badge>
      )}
      {l.doublon && <Badge tone="danger">N° en double</Badge>}
      {l.actif && !l.numero && l.etat !== "sans_numero" && <Badge>Sans numéro</Badge>}
    </span>
  );
}

export default function RegistreMandats() {
  const { items: biens } = useCollection("biens");
  const [vue, setVue] = useState<Vue>("en_cours");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const lignes = useMemo(() => registre(biens), [biens]);
  const alertes = useMemo(() => alertesMandats(lignes), [lignes]);
  const actifs = lignes.filter((l) => l.actif);
  const visibles = vue === "tous" ? lignes : actifs;

  return (
    <div>
      <PageHeader
        back="/biens"
        title="Registre des mandats"
        subtitle={lignes.length ? `${actifs.length} mandat${actifs.length > 1 ? "s" : ""} en cours : numéros, dates et échéances.` : "Numéros, dates et échéances de vos mandats."}
      />

      {!ready ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : !lignes.length ? (
        <div className="card">
          <Empty
            icon={<FileSignature size={22} />}
            title="Aucun mandat pour l'instant"
            text="Le numéro, le type et les dates du mandat se saisissent sur la fiche de chaque bien, ou se remplissent tout seuls quand un mandat est marqué signé."
            action={
              <Link href="/biens" className="btn-secondary">
                Voir les biens
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <AlertesMandats alertes={alertes} />

          <Tabs
            value={vue}
            onChange={setVue}
            items={[
              { value: "en_cours", label: "En cours", count: actifs.length },
              { value: "tous", label: "Tous", count: lignes.length },
            ]}
          />

          {!visibles.length ? (
            <div className="card">
              <Empty icon={<FileSignature size={22} />} title="Aucun mandat en cours" action={<button className="btn-secondary" onClick={() => setVue("tous")}>Voir tous les mandats</button>} />
            </div>
          ) : (
            <>
              {/* Téléphone : une carte par mandat */}
              <ul className="space-y-2.5 md:hidden">
                {visibles.map((l) => (
                  <li key={l.bien.id}>
                    <Link href={`/biens/${l.bien.id}`} className="card card-hover flex items-start gap-3 p-3.5 active:scale-[.99]">
                      <span className={cx("grid h-11 min-w-[3.25rem] shrink-0 place-items-center rounded-xl px-2 text-sm font-semibold tabular-nums", l.doublon ? "bg-danger/10 text-danger" : "bg-surface-2 text-fg")}>
                        {l.numero ? `n°${l.numero}` : "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{nomBien(l.bien)}</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          {[l.bien.mandat?.type ? TYPE_MANDAT[l.bien.mandat.type] : "", periode(l)].filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase())}
                        </span>
                        <span className="mt-2 block">
                          <Etat l={l} />
                        </span>
                      </span>
                      <ChevronRight size={16} className="mt-3 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Ordinateur : tableau */}
              <div className="card hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line/70 text-left text-xs text-muted">
                      <th className="px-5 py-3 font-medium">N°</th>
                      <th className="px-3 py-3 font-medium">Bien</th>
                      <th className="px-3 py-3 font-medium">Type</th>
                      <th className="px-3 py-3 font-medium">Début</th>
                      <th className="px-3 py-3 font-medium">Fin</th>
                      <th className="px-5 py-3 font-medium">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((l) => (
                      <tr key={l.bien.id} className="border-b border-line/50 last:border-0 hover:bg-surface-2/50">
                        <td className={cx("px-5 py-3 font-semibold tabular-nums", l.doublon && "text-danger")}>{l.numero ?? "—"}</td>
                        <td className="max-w-[320px] px-3 py-3">
                          <Link href={`/biens/${l.bien.id}`} className="block truncate font-medium hover:underline">
                            {nomBien(l.bien)}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-muted">{l.bien.mandat?.type ? TYPE_MANDAT[l.bien.mandat.type] : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{dateMandat(l.bien.mandat?.debut) || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-muted">{dateMandat(l.bien.mandat?.fin) || "—"}</td>
                        <td className="px-5 py-3">
                          <Etat l={l} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
