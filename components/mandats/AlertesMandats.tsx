"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, ShieldAlert } from "lucide-react";
import { cx } from "@/components/ui";
import type { AlerteMandat } from "./registre";

/** Carte des alertes du registre des mandats. `lienRegistre` : affichée hors du registre (page « À régler »). */
export function AlertesMandats({ alertes, lienRegistre }: { alertes: AlerteMandat[]; lienRegistre?: boolean }) {
  if (!alertes.length) return null;
  return (
    <section className="card card-pad animate-fade-up">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h-section flex items-center gap-2">
          <ShieldAlert size={16} className="text-danger" /> Mandats à régulariser
        </h2>
        {lienRegistre && (
          <Link href="/mandats" className="link shrink-0 text-xs">
            Registre <ArrowRight size={13} />
          </Link>
        )}
      </div>
      <ul className="mt-1 divide-y divide-line/70">
        {alertes.map((a) => {
          const href = a.bienIds.length === 1 ? `/biens/${a.bienIds[0]}` : lienRegistre ? "/mandats" : undefined;
          const texte = (
            <>
              <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", a.niveau === "danger" ? "bg-danger" : "bg-warn")} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium break-words">{a.titre}</span>
                {a.detail && <span className="mt-0.5 block text-xs text-muted break-words">{a.detail}</span>}
              </span>
            </>
          );
          return (
            <li key={a.code + a.bienIds.join()}>
              {href ? (
                <Link href={href} className="group flex items-start gap-3 py-3">
                  {texte}
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
                </Link>
              ) : (
                <div className="flex items-start gap-3 py-3">{texte}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
