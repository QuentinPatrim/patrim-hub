"use client";

import { Fragment, useState, type ReactNode } from "react";
import { Eye, EyeOff, Lock, TriangleAlert } from "lucide-react";
import { mailHref, telHref } from "./utils";
import { LIGNES_DOSSIER, dossierVide, type DossierBien } from "./dossier";

/* Bloc « Dossier » de la fiche d'un bien : copropriété, syndic, notaire, diagnostics, occupation…
   Masqué par défaut, comme le bloc vendeur (l'écran peut être vu pendant une visite). */

const LIEN = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)|((?:\+33\s?|0)[1-9](?:[ .-]?\d{2}){4})/g;

/** Téléphones et adresses e-mail cliquables dans un texte. */
function avecLiens(texte: string): ReactNode {
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

function Liste({ titre, items, ton }: { titre: string; items: string[]; ton?: "warn" }) {
  return (
    <div className={ton === "warn" ? "mt-3 rounded-xl bg-warn/10 p-3" : "mt-3"}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${ton === "warn" ? "text-warn" : "text-muted"}`}>
        {ton === "warn" && <TriangleAlert size={13} />}
        {titre}
      </div>
      <ul className="mt-1.5 space-y-1 text-sm">
        {items.map((x) => (
          <li key={x} className="flex gap-2">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-current opacity-50" />
            <span className="min-w-0 break-words">{avecLiens(x)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DossierBlock({ dossier }: { dossier?: DossierBien }) {
  const [show, setShow] = useState(false);
  if (!dossier || dossierVide(dossier)) return null;
  const lignes = LIGNES_DOSSIER.filter(([k]) => dossier[k]);
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
          {!!dossier.aVerifier?.length && <Liste titre="À vérifier" items={dossier.aVerifier} ton="warn" />}
        </div>
      ) : (
        <button onClick={() => setShow(true)} className="mt-2 text-left text-sm text-muted">
          {[lignes.slice(0, 3).map(([, l]) => l.toLowerCase()).join(", "), dossier.aVerifier?.length ? `${dossier.aVerifier.length} point${dossier.aVerifier.length > 1 ? "s" : ""} à vérifier` : ""]
            .filter(Boolean)
            .join(" · ")
            .replace(/^./, (c) => c.toUpperCase())}{" "}
          · toucher pour afficher
        </button>
      )}
    </section>
  );
}
