"use client";

import { AlarmClock, ArrowRight, Target } from "lucide-react";
import Link from "next/link";
import { Avatar, Badge, cx } from "@/components/ui";
import { dateCourte, ETAPE, initiales, nomComplet, ROLE, SOURCE, today } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { Flames, QuickActions } from "./bits";
import { criteresResume, relanceEnRetard } from "./helpers";

export function ContactCard({ c, index = 0 }: { c: Contact; index?: number }) {
  const retard = relanceEnRetard(c);
  const jour = c.dateRelance === today();
  const resume = criteresResume(c.criteres);
  const acq = c.roles?.includes("acquereur");
  return (
    <article
      className="card group relative overflow-hidden transition hover:-translate-y-px hover:border-accent/25 animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
    >
      {c.chaleur === 3 && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-coral" aria-hidden />}
      <Link href={`/contacts/${c.id}`} className="block p-4 pb-3">
        <div className="flex items-start gap-3">
          <Avatar text={initiales(c)} className={cx("size-11 text-sm", c.chaleur === 3 && "ring-2 ring-coral/40 ring-offset-2 ring-offset-surface")} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold text-[15px]">{nomComplet(c)}</h3>
              <Flames value={c.chaleur} size={13} className="shrink-0" />
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
              <span>{(c.roles ?? []).map((r) => ROLE[r]).join(" · ") || "Contact"}</span>
              {c.source && (
                <>
                  <span aria-hidden>·</span>
                  <span>{SOURCE[c.source]}</span>
                </>
              )}
              {acq && c.etape && <Badge tone={ETAPE[c.etape].tone} className="ml-0.5">{ETAPE[c.etape].label}</Badge>}
            </div>
          </div>
        </div>
        {resume && (
          <p className="mt-3 flex items-start gap-1.5 text-[13px] text-fg/85">
            <Target size={14} className="mt-0.5 shrink-0 text-muted" />
            <span className="line-clamp-2">{resume}</span>
          </p>
        )}
        {(c.prochaineAction || c.dateRelance) && (
          <div className={cx("mt-2.5 flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px]", retard ? "bg-danger/10" : jour ? "bg-warn/10" : "bg-surface-2")}>
            <AlarmClock size={14} className={cx("shrink-0", retard ? "text-danger" : jour ? "text-warn" : "text-muted")} />
            <span className="min-w-0 flex-1 truncate">{c.prochaineAction || "Relancer"}</span>
            {c.dateRelance && (
              <span className={cx("shrink-0 text-xs font-semibold", retard ? "text-danger" : jour ? "text-warn" : "text-muted")}>
                {jour ? "Aujourd'hui" : dateCourte(c.dateRelance)}
              </span>
            )}
          </div>
        )}
      </Link>
      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-2.5">
        <QuickActions contact={c} />
        <Link href={`/contacts/${c.id}`} className="btn-ghost btn-sm !h-10 !px-2.5 text-muted" aria-label="Ouvrir la fiche">
          <span className="hidden sm:inline">Fiche</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    </article>
  );
}
