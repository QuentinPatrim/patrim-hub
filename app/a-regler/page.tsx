"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardCheck, ListChecks, Lock, Search } from "lucide-react";
import { Badge, Empty, PageHeader, Tabs, cx } from "@/components/ui";
import { PointAVerifier } from "@/components/biens/DossierBlock";
import { CATEGORIES, basculerPoint, categorie, clePoint, dossierDe, reglesDe, type Categorie } from "@/components/biens/dossier";
import { AlertesMandats } from "@/components/mandats/AlertesMandats";
import { STATUTS_ACTIFS, alertesMandats, nomBien, registre } from "@/components/mandats/registre";
import { LienAvenant } from "@/components/avenant/LienAvenant";
import { pointAvenant } from "@/components/avenant/avenant";
import { getAll, useCollection } from "@/lib/store";
import { STATUT_BIEN } from "@/lib/format";
import type { Bien, BienStatut } from "@/lib/types";

/* « À régler » : tous les points « à vérifier » des dossiers des biens réunis sur une page,
   à cocher une fois réglés, plus les mandats à régulariser. */

type Filtre = "tous" | Categorie;

const ORDRE_CATEGORIES: Categorie[] = ["proprietaires", "mandat", "prix", "copropriete", "diagnostics", "bien", "autre"];
// Les ventes engagées d'abord (le notaire attend un dossier complet), les biens retirés ou vendus en dernier.
// Ordre fixe : cocher un point ne fait pas bouger les cartes.
const PRIORITE: Record<BienStatut, number> = { compromis: 0, sous_offre: 0, en_vente: 1, mandat_signe: 1, estimation: 2, retire: 3, vendu: 3 };

interface Point {
  texte: string;
  cle: string;
  cat: Categorie;
  regle?: string;
}

export default function ARegler() {
  const { items: biens, update } = useCollection("biens");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [voirRegles, setVoirRegles] = useState(false);
  // Points cochés pendant la visite : ils restent affichés (barrés) pour pouvoir annuler d'un geste.
  const [gardes, setGardes] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const groupes = useMemo(
    () =>
      biens
        .map((bien) => {
          const regles = reglesDe(bien);
          const points: Point[] = (dossierDe(bien)?.aVerifier ?? []).map((texte) => {
            const cle = clePoint(texte);
            return { texte, cle, cat: categorie(texte), regle: regles[cle] };
          });
          return { bien, points, ouverts: points.filter((p) => !p.regle).length };
        })
        .filter((g) => g.points.length)
        .sort((x, y) => PRIORITE[x.bien.statut] - PRIORITE[y.bien.statut] || y.points.length - x.points.length || nomBien(x.bien).localeCompare(nomBien(y.bien))),
    [biens]
  );
  const alertes = useMemo(() => alertesMandats(registre(biens)), [biens]);

  const total = groupes.reduce((s, g) => s + g.points.length, 0);
  const ouverts = groupes.reduce((s, g) => s + g.ouverts, 0);
  const parCategorie = useMemo(() => {
    const c: Partial<Record<Categorie, number>> = {};
    groupes.forEach((g) => g.points.forEach((p) => !p.regle && (c[p.cat] = (c[p.cat] ?? 0) + 1)));
    return c;
  }, [groupes]);

  const visibles = groupes
    .map((g) => ({ ...g, points: g.points.filter((p) => (filtre === "tous" || p.cat === filtre) && (voirRegles || !p.regle || gardes.has(g.bien.id + p.cle))) }))
    .filter((g) => g.points.length);

  function basculer(bien: Bien, texte: string) {
    const frais = getAll("biens").find((b) => b.id === bien.id) ?? bien;
    const regles = reglesDe(frais);
    const cle = clePoint(texte);
    if (!regles[cle]) setGardes((s) => new Set(s).add(bien.id + cle));
    update(bien.id, { pointsRegles: basculerPoint(regles, texte) } as Partial<Bien>);
  }

  const tabs = [
    { value: "tous" as Filtre, label: "Tout", count: ouverts },
    ...ORDRE_CATEGORIES.filter((c) => parCategorie[c] || c === filtre).map((c) => ({ value: c as Filtre, label: CATEGORIES[c], count: parCategorie[c] ?? 0 })),
  ];
  const pct = total ? Math.round(((total - ouverts) / total) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="À régler"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} className="shrink-0" /> Les points à vérifier dans les dossiers des biens, à cocher une fois réglés.
          </span>
        }
      />

      {!ready ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {total > 0 && (
            <section className="card card-pad animate-fade-up">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="font-serif text-3xl font-semibold tabular-nums leading-none">{ouverts}</div>
                  <div className="mt-1.5 text-sm text-muted">
                    point{ouverts > 1 ? "s" : ""} à régler sur {total}, dans {groupes.filter((g) => g.ouverts).length} dossier{groupes.filter((g) => g.ouverts).length > 1 ? "s" : ""}
                  </div>
                </div>
                <div className="text-right text-sm font-semibold text-ok tabular-nums">{pct} % réglés</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-ok transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
            </section>
          )}

          <AlertesMandats alertes={alertes} lienRegistre />

          {total === 0 ? (
            <div className="card">
              <Empty
                icon={<ListChecks size={22} />}
                title="Rien à vérifier"
                text="Les points à vérifier apparaissent ici quand les dossiers des biens sont importés depuis les Réglages."
                action={
                  <Link href="/reglages" className="btn-secondary">
                    Ouvrir les réglages
                  </Link>
                }
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Tabs value={filtre} onChange={setFiltre} items={tabs} />
                <label className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 text-sm text-muted">
                  <input type="checkbox" className="size-5 accent-accent" checked={voirRegles} onChange={(e) => setVoirRegles(e.target.checked)} />
                  Afficher les points réglés
                </label>
              </div>

              {!visibles.length ? (
                <div className="card">
                  {ouverts === 0 && !voirRegles ? (
                    <Empty
                      icon={<ClipboardCheck size={22} />}
                      title="Tout est réglé"
                      text="Tous les points des dossiers sont vérifiés. Bravo !"
                      action={
                        <button className="btn-secondary" onClick={() => setVoirRegles(true)}>
                          Revoir les points réglés
                        </button>
                      }
                    />
                  ) : (
                    <Empty
                      icon={<Search size={22} />}
                      title="Rien dans cette catégorie"
                      text="Tous les points de cette catégorie sont réglés."
                      action={
                        <button className="btn-secondary" onClick={() => setFiltre("tous")}>
                          Voir tous les points
                        </button>
                      }
                    />
                  )}
                </div>
              ) : (
                visibles.map(({ bien, points, ouverts: reste }, i) => (
                  <section key={bien.id} className="card animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                    <Link href={`/biens/${bien.id}`} className="group flex items-center gap-3 px-4 pt-4 pb-1 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{nomBien(bien)}</span>
                        <span className={cx("block text-xs", reste ? "text-muted" : "text-ok")}>
                          {reste ? `${reste} point${reste > 1 ? "s" : ""} à régler` : "Tout est réglé"}
                          {bien.mandat?.numero ? ` · mandat n°${bien.mandat.numero}` : ""}
                        </span>
                      </span>
                      <Badge tone={STATUT_BIEN[bien.statut].tone} className="shrink-0">
                        {STATUT_BIEN[bien.statut].label}
                      </Badge>
                      <ChevronRight size={16} className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
                    </Link>
                    <ul className="px-4 pb-2 sm:px-5">
                      {points.map((p, j) => (
                        <PointAVerifier
                          key={`${p.cle}-${j}`}
                          texte={p.texte}
                          regle={p.regle}
                          onBasculer={() => basculer(bien, p.texte)}
                          action={pointAvenant(p.texte) && STATUTS_ACTIFS.includes(bien.statut) ? <LienAvenant bienId={bien.id} /> : undefined}
                        />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
