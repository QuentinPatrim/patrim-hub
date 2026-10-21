"use client";

import { Calculator, ChevronRight, ClipboardList, Handshake, Plus, Search, Send, Target } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, DpeBadge, Empty, PageHeader, Stat, Tabs, cx } from "@/components/ui";
import { STATUT_ESTIM, STATUTS, asPlus, resumeBien, type StatutEstim } from "@/components/estimations/shared";
import { dateCourte, eurK, nomComplet } from "@/lib/format";
import { useCollection } from "@/lib/store";

type Filtre = "tous" | StatutEstim;

export default function EstimationsPage() {
  const { items } = useCollection("estimations");
  const { items: contacts } = useCollection("contacts");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const counts = useMemo(() => {
    const c: Record<StatutEstim, number> = { a_faire: 0, envoyee: 0, mandat: 0, perdue: 0 };
    items.forEach((e) => (c[e.statut] = (c[e.statut] ?? 0) + 1));
    return c;
  }, [items]);

  const remises = counts.envoyee + counts.mandat + counts.perdue;
  const taux = remises ? counts.mandat / remises : null;
  const enJeu = items.filter((e) => e.statut === "a_faire" || e.statut === "envoyee").reduce((s, e) => s + (e.prixConseille ?? e.resultat?.median ?? 0), 0);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((e) => filtre === "tous" || e.statut === filtre)
      .filter((e) => {
        if (!s) return true;
        const c = e.proprietaireId ? byId.get(e.proprietaireId) : undefined;
        return [e.adresse, e.ville, asPlus(e).quartier, c?.nom, c?.prenom].filter(Boolean).join(" ").toLowerCase().includes(s);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [items, filtre, q, byId]);

  return (
    <div>
      <PageHeader
        title="Estimations"
        subtitle="Avis de valeur fondés sur les ventes réelles du secteur."
        actions={
          <>
            <Link href="/simulateur" className="btn-secondary">
              <Calculator size={16} /> Simulateur
            </Link>
            <Link href="/estimations/nouvelle" className="btn-primary">
              <Plus size={16} /> Nouvelle estimation
            </Link>
          </>
        }
      />

      {items.length > 0 && (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 animate-fade-up">
        <Stat label="À présenter" value={counts.a_faire} icon={<ClipboardList size={16} />} tone="warn" hint="Avis à remettre" />
        <Stat label="Avis remis" value={counts.envoyee} icon={<Send size={16} />} hint="En attente de décision" />
        <Stat label="Mandats" value={counts.mandat} icon={<Handshake size={16} />} tone="ok" hint={`${counts.perdue} perdue${counts.perdue > 1 ? "s" : ""}`} />
        <Stat
          label="Transformation"
          value={taux == null ? "—" : `${Math.round(taux * 100)} %`}
          icon={<Target size={16} />}
          hint={remises ? `${counts.mandat} mandat${counts.mandat > 1 ? "s" : ""} sur ${remises} avis remis` : "Dès le premier avis remis"}
        />
      </div>
      )}

      {items.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs<Filtre>
            value={filtre}
            onChange={setFiltre}
            items={[{ value: "tous", label: "Toutes", count: items.length }, ...STATUTS.map((s) => ({ value: s, label: STATUT_ESTIM[s].label, count: counts[s] }))]}
          />
          <div className="relative sm:ml-auto sm:w-64">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Adresse, propriétaire…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      )}

      {items.length > 0 && enJeu > 0 && (
        <p className="mt-3 text-xs text-muted">
          Valeur des biens en cours de décision : <span className="font-semibold text-fg">{eurK(enJeu)}</span>
        </p>
      )}

      <div className={items.length ? "mt-4" : ""}>
        {items.length === 0 ? (
          <div className="card">
            <Empty
              icon={<Calculator size={22} />}
              title="Aucune estimation pour le moment"
              text="Lancez une estimation chez le propriétaire : adresse, surface, et les ventes réelles du quartier s'affichent en quelques secondes."
              action={
                <Link href="/estimations/nouvelle" className="btn-primary">
                  <Plus size={16} /> Nouvelle estimation
                </Link>
              }
            />
          </div>
        ) : list.length === 0 ? (
          <div className="card">
            <Empty icon={<Search size={20} />} title="Aucune estimation ici" text="Changez de filtre ou de recherche." />
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((e, i) => {
              const c = e.proprietaireId ? byId.get(e.proprietaireId) : undefined;
              const p = asPlus(e);
              const prix = e.prixConseille ?? e.resultat?.median;
              return (
                <li key={e.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                  <Link href={`/estimations/${e.id}`} className="card card-pad card-hover group flex gap-4 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge tone={STATUT_ESTIM[e.statut].tone}>{STATUT_ESTIM[e.statut].label}</Badge>
                        <span className="text-[11px] text-muted">{dateCourte(e.createdAt)}</span>
                        <span className="ml-auto">
                          <DpeBadge value={e.dpe} />
                        </span>
                      </div>
                      <div className="mt-2 truncate font-medium">{e.adresse.split(",")[0] || e.adresse}</div>
                      <div className="truncate text-xs text-muted">
                        {[resumeBien(p), p.quartier || e.ville].filter(Boolean).join(" · ")}
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div className={cx("truncate text-xs", c ? "text-fg/80" : "text-muted")}>{c ? nomComplet(c) : "Propriétaire non renseigné"}</div>
                        <div className="text-right">
                          <div className="font-serif text-xl font-semibold tabular-nums leading-none">{prix ? eurK(prix) : "—"}</div>
                          {e.resultat && (
                            <div className="mt-1 text-[10px] text-muted tabular-nums">
                              {eurK(e.resultat.bas)} – {eurK(e.resultat.haut)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="hidden self-center text-muted transition group-hover:translate-x-0.5 sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
