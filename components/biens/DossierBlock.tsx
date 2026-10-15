"use client";

import { Fragment, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, Eye, EyeOff, Lock, TriangleAlert } from "lucide-react";
import { cx } from "@/components/ui";
import { dateCourte } from "@/lib/format";
import { mailHref, telHref } from "./utils";
import { LIGNES_DOSSIER, clePoint, dossierVide, type DossierBien, type PointsRegles } from "./dossier";

/* Bloc « Dossier » de la fiche d'un bien : copropriété, syndic, notaire, diagnostics, occupation…
   Masqué par défaut, comme le bloc vendeur (l'écran peut être vu pendant une visite). */

const LIEN = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:\+33\s?|0)[1-9](?:[ .-]?\d{2}){4})/g;

/** Téléphones et adresses e-mail cliquables dans un texte. */
export function avecLiens(texte: string): ReactNode {
  const out: ReactNode[] = [];
  let dernier = 0;
  for (const m of texte.matchAll(LIEN)) {
    const i = m.index ?? 0;
    if (i > dernier) out.push(texte.slice(dernier, i));
    out.push(
      <a key={i} href={m[1] ? mailHref(m[1]) : telHref(m[2])} className="text-accent underline-offset-2 hover:underline">
        {m[0]}
      </a>
    );
    dernier = i + m[0].length;
  }
  if (dernier < texte.length) out.push(texte.slice(dernier));
  return out.map((x, i) => <Fragment key={i}>{x}</Fragment>);
}

/** Un point « à vérifier », avec sa case à cocher quand il peut être marqué réglé. */
export function PointAVerifier({ texte, regle, onBasculer, action }: { texte: string; regle?: string; onBasculer?: () => void; action?: ReactNode }) {
  return (
    <li className={cx("flex items-start", onBasculer ? "gap-1" : "gap-2")}>
      {onBasculer ? (
        <button
          type="button"
          onClick={onBasculer}
          aria-pressed={!!regle}
          aria-label={regle ? "Remettre à vérifier" : "Marquer comme réglé"}
          className={cx("-ml-2 grid size-10 shrink-0 place-items-center rounded-xl transition active:scale-95", regle ? "text-ok" : "text-warn hover:text-fg")}
        >
          {regle ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        </button>
      ) : (
        <span className="mt-2 size-1 shrink-0 rounded-full bg-current opacity-50" />
      )}
      <div className={cx("min-w-0 flex-1 text-sm", onBasculer && "py-2.5")}>
        <span className={cx("break-words", regle && "text-muted line-through decoration-muted/50")}>{avecLiens(texte)}</span>
        {regle && <span className="mt-0.5 block text-xs text-ok">Réglé le {dateCourte(regle)}</span>}
        {!regle && action && <span className="mt-1.5 block">{action}</span>}
      </div>
    </li>
  );
}

function Liste({ titre, items }: { titre: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="text-xs font-semibold text-muted">{titre}</div>
      <ul className="mt-1.5 space-y-1 text-sm">
        {items.map((x) => (
          <PointAVerifier key={x} texte={x} />
        ))}
      </ul>
    </div>
  );
}

/** Points « à vérifier » du dossier. Un point coché reste en place jusqu'à la prochaine visite de la page
    (pour pouvoir annuler d'un geste), puis rejoint les points réglés. */
function AVerifier({ points, regles, onBasculer, actionPoint }: { points: string[]; regles: PointsRegles; onBasculer?: (texte: string) => void; actionPoint?: (texte: string) => ReactNode }) {
  const [gardes, setGardes] = useState<Set<string>>(() => new Set());
  const [voirRegles, setVoirRegles] = useState(false);
  const ouverts = points.filter((p) => !regles[clePoint(p)]).length;
  const affiches = points.filter((p) => !regles[clePoint(p)] || gardes.has(clePoint(p)));
  const caches = points.filter((p) => regles[clePoint(p)] && !gardes.has(clePoint(p)));
  const basculer =
    onBasculer &&
    ((p: string) => {
      if (!regles[clePoint(p)]) setGardes((s) => new Set(s).add(clePoint(p)));
      onBasculer(p);
    });
  return (
    <div className={cx("mt-3 rounded-xl p-3", ouverts ? "bg-warn/10" : "bg-ok/10")}>
      <div className={cx("flex items-center gap-1.5 text-xs font-semibold", ouverts ? "text-warn" : "text-ok")}>
        {ouverts ? <TriangleAlert size={13} /> : <CheckCircle2 size={13} />}
        {ouverts ? `À vérifier · ${ouverts}` : "Tous les points sont réglés"}
      </div>
      {affiches.length > 0 && (
        <ul className="mt-1">
          {affiches.map((p) => (
            <PointAVerifier key={p} texte={p} regle={regles[clePoint(p)]} onBasculer={basculer && (() => basculer(p))} action={actionPoint?.(p)} />
          ))}
        </ul>
      )}
      {caches.length > 0 && (
        <>
          <button type="button" onClick={() => setVoirRegles(!voirRegles)} className="mt-1 min-h-10 text-xs font-medium text-muted hover:text-fg">
            {voirRegles ? "Masquer les points réglés" : `Voir ${caches.length === 1 ? "le point réglé" : `les ${caches.length} points réglés`}`}
          </button>
          {voirRegles && (
            <ul className="animate-fade-up">
              {caches.map((p) => (
                <PointAVerifier key={p} texte={p} regle={regles[clePoint(p)]} onBasculer={basculer && (() => basculer(p))} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function DossierBlock({
  dossier,
  regles = {},
  onBasculer,
  actionPoint,
}: {
  dossier?: DossierBien;
  regles?: PointsRegles;
  onBasculer?: (texte: string) => void;
  /** Raccourci affiché sous un point encore à régler (ex. « Préparer l'avenant »). */
  actionPoint?: (texte: string) => ReactNode;
}) {
  const [show, setShow] = useState(false);
  if (!dossier || dossierVide(dossier)) return null;
  const lignes = LIGNES_DOSSIER.filter(([k]) => dossier[k]);
  const ouverts = dossier.aVerifier?.filter((p) => !regles[clePoint(p)]).length ?? 0;
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide">
          <Lock size={13} /> Dossier · confidentiel
        </div>
        <button onClick={() => setShow(!show)} className="btn-ghost btn-sm !px-2 text-muted" aria-label={show ? "Masquer" : "Afficher"}>
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {show ? (
        <div className="mt-2 animate-fade-up">
          {lignes.length > 0 && (
            <dl>
              {lignes.map(([k, label]) => (
                <div key={k} className="py-2 border-b border-line/70 last:border-0">
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-line break-words">{avecLiens(String(dossier[k]))}</dd>
                </div>
              ))}
            </dl>
          )}
          {!!dossier.precisions?.length && <Liste titre="Précisions" items={dossier.precisions} />}
          {!!dossier.evenements?.length && <Liste titre="Historique" items={dossier.evenements} />}
          {!!dossier.aVerifier?.length && <AVerifier points={dossier.aVerifier} regles={regles} onBasculer={onBasculer} actionPoint={actionPoint} />}
        </div>
      ) : (
        <button onClick={() => setShow(true)} className="mt-2 text-left text-sm text-muted">
          {[
            lignes.slice(0, 3).map(([, l]) => l.toLowerCase()).join(", "),
            ouverts ? `${ouverts} point${ouverts > 1 ? "s" : ""} à vérifier` : dossier.aVerifier?.length ? "tout est vérifié" : "",
          ]
            .filter(Boolean)
            .join(" · ")
            .replace(/^./, (c) => c.toUpperCase())}{" "}
          · toucher pour afficher
        </button>
      )}
    </section>
  );
}
