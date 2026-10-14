"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Plus, Sunrise } from "lucide-react";
import { Empty, PageHeader, Sheet, Tabs, cx } from "@/components/ui";
import { RdvCard } from "@/components/agenda/RdvCard";
import { RdvForm, type RdvInitial } from "@/components/agenda/RdvForm";
import { CompteRenduSheet } from "@/components/agenda/CompteRenduSheet";
import { RDV_DOT, crAFaire, finDe, jourDe, lundiDe, titreRdv, type RdvExt } from "@/components/agenda/utils";
import { useCollection } from "@/lib/store";
import { addDays, dateCourte, dateLongue, heure, today } from "@/lib/format";
import type { Bien, Contact } from "@/lib/types";

type Vue = "jour" | "avenir" | "semaine" | "passes";

export default function AgendaPage() {
  return (
    <Suspense fallback={<div className="skeleton h-40" />}>
      <Agenda />
    </Suspense>
  );
}

function Agenda() {
  const { items: rdvsRaw } = useCollection("rdvs");
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const params = useSearchParams();
  const router = useRouter();
  const [vue, setVue] = useState<Vue>("jour");
  const [form, setForm] = useState<RdvInitial | null>(null);
  const [crId, setCrId] = useState<string>();
  const [detailId, setDetailId] = useState<string>();
  const [ready, setReady] = useState(false);
  const [, tick] = useState(0);

  const rdvs = rdvsRaw as RdvExt[];
  const bienOf = useMemo(() => new Map(biens.map((b) => [b.id, b])), [biens]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const contactsOf = (r: RdvExt) => (r.contactIds ?? []).map((id) => contactMap.get(id)).filter(Boolean) as Contact[];

  // Rafraîchit l'affichage (rdv en cours, marqueur « maintenant ») chaque minute
  useEffect(() => {
    setReady(true);
    const t = setInterval(() => tick((x) => x + 1), 60000);
    return () => clearInterval(t);
  }, []);

  // Liens entrants : ?nouveau=1&bien=…&contact=…&type=… ou ?rdv=…
  useEffect(() => {
    if (params.get("nouveau")) {
      setForm({ bienId: params.get("bien") ?? undefined, contactIds: params.get("contact") ? [params.get("contact")!] : [], type: (params.get("type") as RdvInitial["type"]) ?? "visite", jour: params.get("jour") ?? undefined });
      router.replace("/agenda");
    } else if (params.get("rdv")) {
      setDetailId(params.get("rdv")!);
      router.replace("/agenda");
    } else if (params.get("vue")) {
      setVue(params.get("vue") as Vue);
    }
  }, [params, router]);

  const now = Date.now();
  const tdy = today();
  const tries = useMemo(() => [...rdvs].sort((a, b) => a.debut.localeCompare(b.debut)), [rdvs]);
  const duJour = tries.filter((r) => jourDe(r.debut) === tdy);
  const aVenir = tries.filter((r) => finDe(r).getTime() >= now && r.statut !== "annule");
  const passes = tries.filter((r) => finDe(r).getTime() < now && jourDe(r.debut) >= addDays(tdy, -90)).reverse();
  const aFaire = tries.filter(crAFaire).reverse();

  const card = (r: RdvExt, fromDetail?: boolean) => (
    <RdvCard
      key={r.id}
      rdv={r}
      bien={r.bienId ? bienOf.get(r.bienId) : undefined}
      contacts={contactsOf(r)}
      onEdit={() => {
        if (fromDetail) setDetailId(undefined);
        setForm(r);
      }}
      onCompteRendu={() => {
        if (fromDetail) setDetailId(undefined);
        setCrId(r.id);
      }}
      showDate={fromDetail}
    />
  );

  const prochain = aVenir.find((r) => new Date(r.debut).getTime() > now);
  const subtitle = ready ? cap(dateLongue(tdy)) + (duJour.length ? ` · ${duJour.length} rendez-vous` : "") : " ";

  return (
    <div>
      <PageHeader
        title="Agenda"
        subtitle={subtitle}
        actions={
          <button className="btn-primary" onClick={() => setForm({ jour: tdy })}>
            <Plus size={16} /> Nouveau rendez-vous
          </button>
        }
      />

      {aFaire.length > 0 && (
        <section className="mb-5 rounded-2xl border border-warn/25 bg-warn/[0.07] p-3.5 sm:p-4 animate-fade-up">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck size={16} className="text-warn" />
            {aFaire.length} compte{aFaire.length > 1 ? "s" : ""} rendu{aFaire.length > 1 ? "s" : ""} de visite à faire
          </div>
          <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
            {aFaire.slice(0, 8).map((r) => (
              <button key={r.id} onClick={() => setCrId(r.id)} className="shrink-0 max-w-[240px] rounded-xl border border-line bg-surface px-3 py-2 text-left hover:border-accent/40 transition">
                <div className="text-[11px] text-muted">
                  {dateCourte(r.debut)} · {heure(r.debut)}
                </div>
                <div className="text-sm font-medium truncate">{titreRdv(r, r.bienId ? bienOf.get(r.bienId) : undefined, contactsOf(r))}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mb-5">
        <Tabs
          value={vue}
          onChange={setVue}
          items={[
            { value: "jour", label: "Aujourd'hui", count: duJour.length },
            { value: "avenir", label: "À venir", count: aVenir.length },
            { value: "semaine", label: "Semaine" },
            { value: "passes", label: "Passés" },
          ]}
        />
      </div>

      {!ready ? (
        <div className="space-y-3">
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
        </div>
      ) : vue === "jour" ? (
        duJour.length ? (
          <Timeline items={duJour} render={(r) => card(r)} now={now} showNow />
        ) : (
          <div className="card">
            <Empty
              icon={<Sunrise size={22} />}
              title="Rien de prévu aujourd'hui"
              text={prochain ? `Prochain rendez-vous : ${dateLongue(prochain.debut)} à ${heure(prochain.debut)}.` : "Une bonne journée pour prospecter ou relancer vos acquéreurs."}
              action={
                <button className="btn-primary" onClick={() => setForm({ jour: tdy })}>
                  <Plus size={16} /> Planifier un rendez-vous
                </button>
              }
            />
          </div>
        )
      ) : vue === "avenir" ? (
        aVenir.length ? (
          <Grouped items={aVenir.slice(0, 120)} render={(r) => card(r)} />
        ) : (
          <div className="card">
            <Empty icon={<CalendarDays size={22} />} title="Aucun rendez-vous à venir" action={<button className="btn-primary" onClick={() => setForm({ jour: tdy })}><Plus size={16} /> Planifier</button>} />
          </div>
        )
      ) : vue === "semaine" ? (
        <Semaine rdvs={tries} bienOf={bienOf} onOpen={setDetailId} onNew={(jour) => setForm({ jour })} />
      ) : passes.length ? (
        <Grouped items={passes} render={(r) => card(r)} />
      ) : (
        <div className="card">
          <Empty icon={<CalendarDays size={22} />} title="Aucun rendez-vous passé" text="Les visites réalisées et leurs comptes rendus apparaîtront ici." />
        </div>
      )}

      <RdvForm open={!!form} onClose={() => setForm(null)} initial={form ?? undefined} />
      <CompteRenduSheet rdv={rdvs.find((r) => r.id === crId)} onClose={() => setCrId(undefined)} />
      <DetailSheet id={detailId} rdvs={rdvs} onClose={() => setDetailId(undefined)} render={(r) => card(r, true)} />
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function libelleJour(ymd: string) {
  const t = today();
  if (ymd === t) return "Aujourd'hui";
  if (ymd === addDays(t, 1)) return "Demain";
  if (ymd === addDays(t, -1)) return "Hier";
  return cap(dateLongue(ymd));
}

/** Liste groupée par jour, chaque jour en timeline. */
function Grouped({ items, render }: { items: RdvExt[]; render: (r: RdvExt) => ReactNode }) {
  const groups = useMemo(() => {
    const m = new Map<string, RdvExt[]>();
    items.forEach((r) => {
      const k = jourDe(r.debut);
      m.set(k, [...(m.get(k) ?? []), r]);
    });
    return [...m.entries()];
  }, [items]);
  return (
    <div className="space-y-6">
      {groups.map(([jour, list]) => (
        <section key={jour}>
          <h2 className="sticky top-14 lg:top-0 z-10 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 mb-2 bg-bg/90 backdrop-blur text-sm font-semibold flex items-baseline gap-2">
            {libelleJour(jour)}
            {jour === today() || jour === addDays(today(), 1) || jour === addDays(today(), -1) ? <span className="text-xs font-normal text-muted">{dateLongue(jour)}</span> : null}
            <span className="ml-auto text-xs font-normal text-muted">{list.length}</span>
          </h2>
          <Timeline items={list} render={render} now={Date.now()} />
        </section>
      ))}
    </div>
  );
}

/** Timeline verticale : heure à gauche, fil, carte. */
function Timeline({ items, render, now, showNow }: { items: RdvExt[]; render: (r: RdvExt) => ReactNode; now: number; showNow?: boolean }) {
  const idxNow = showNow ? items.findIndex((r) => new Date(r.debut).getTime() > now) : -1;
  return (
    <ol className="relative">
      {items.map((r, i) => (
        <li key={r.id} className="relative">
          {showNow && i === idxNow && i > 0 && <NowMarker />}
          <div className="grid grid-cols-[48px_1fr] sm:grid-cols-[64px_1fr] gap-2 sm:gap-3 pb-3 animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
            <div className="relative pt-3.5 text-right">
              <div className={cx("text-sm font-semibold tabular-nums", r.statut === "annule" && "line-through text-muted")}>{heure(r.debut)}</div>
              <div className="text-[11px] text-muted tabular-nums">{heure(finDe(r).toISOString())}</div>
            </div>
            <div className="relative pl-4 sm:pl-5">
              <span className="absolute left-0 top-0 bottom-[-12px] w-px bg-line" aria-hidden />
              <span className={cx("absolute -left-[5px] top-[18px] size-[11px] rounded-full ring-4 ring-bg", RDV_DOT[r.type])} aria-hidden />
              {render(r)}
            </div>
          </div>
        </li>
      ))}
      {showNow && idxNow === -1 && items.length > 0 && <NowMarker />}
    </ol>
  );
}

function NowMarker() {
  return (
    <div className="grid grid-cols-[48px_1fr] sm:grid-cols-[64px_1fr] gap-2 sm:gap-3 items-center pb-3">
      <div className="text-right text-[11px] font-semibold text-coral tabular-nums">{heure(new Date().toISOString())}</div>
      <div className="relative h-px bg-coral/70">
        <span className="absolute -left-[4px] -top-[4px] size-[9px] rounded-full bg-coral" />
      </div>
    </div>
  );
}

/** Vue semaine : 7 colonnes (défilement horizontal sur mobile). */
function Semaine({ rdvs, bienOf, onOpen, onNew }: { rdvs: RdvExt[]; bienOf: Map<string, Bien>; onOpen: (id: string) => void; onNew: (jour: string) => void }) {
  const [lundi, setLundi] = useState(() => lundiDe(today()));
  const scroller = useRef<HTMLDivElement>(null);
  const jours = Array.from({ length: 7 }, (_, i) => addDays(lundi, i));
  const tdy = today();

  useEffect(() => {
    const el = scroller.current?.querySelector<HTMLElement>("[data-today]");
    if (el && scroller.current) scroller.current.scrollTo({ left: el.offsetLeft - 16, behavior: "smooth" });
  }, [lundi]);

  const parJour = useMemo(() => {
    const m = new Map<string, RdvExt[]>();
    rdvs.forEach((r) => {
      const k = jourDe(r.debut);
      if (k >= lundi && k <= addDays(lundi, 6)) m.set(k, [...(m.get(k) ?? []), r]);
    });
    return m;
  }, [rdvs, lundi]);
  const total = [...parJour.values()].reduce((s, l) => s + l.filter((r) => r.statut !== "annule").length, 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button className="btn-secondary !px-2.5" onClick={() => setLundi(addDays(lundi, -7))} aria-label="Semaine précédente">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold">
            {dateCourte(lundi)} – {dateCourte(addDays(lundi, 6))}
          </div>
          <div className="text-[11px] text-muted">
            {total} rendez-vous{lundiDe(tdy) === lundi ? " cette semaine" : ""}
          </div>
        </div>
        {lundiDe(tdy) !== lundi && (
          <button className="btn-ghost btn-sm" onClick={() => setLundi(lundiDe(tdy))}>
            Aujourd&apos;hui
          </button>
        )}
        <button className="btn-secondary !px-2.5" onClick={() => setLundi(addDays(lundi, 7))} aria-label="Semaine suivante">
          <ChevronRight size={18} />
        </button>
      </div>

      <div ref={scroller} className="-mx-4 px-4 sm:mx-0 sm:px-0 flex md:grid md:grid-cols-7 gap-2 overflow-x-auto md:overflow-visible snap-x snap-mandatory no-scrollbar pb-2">
        {jours.map((j) => {
          const list = parJour.get(j) ?? [];
          const isToday = j === tdy;
          const d = new Date(j + "T12:00:00");
          return (
            <div key={j} data-today={isToday ? "" : undefined} className={cx("snap-start shrink-0 w-[44%] min-w-[150px] md:w-auto md:min-w-0 rounded-2xl border p-2 flex flex-col min-h-[260px]", isToday ? "border-accent/40 bg-accent/[0.04]" : "border-line bg-surface")}>
              <div className="flex items-center justify-between px-1 pb-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted">{d.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                  <div className={cx("mt-0.5 grid place-items-center size-8 rounded-full text-sm font-semibold", isToday ? "bg-brand text-white" : "")}>{d.getDate()}</div>
                </div>
                <button onClick={() => onNew(j)} className="grid place-items-center size-9 rounded-lg text-muted hover:bg-surface-2 hover:text-accent" aria-label="Ajouter un rendez-vous ce jour">
                  <Plus size={16} />
                </button>
              </div>
              <div className="space-y-1.5 flex-1">
                {list.map((r) => {
                  const b = r.bienId ? bienOf.get(r.bienId) : undefined;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onOpen(r.id)}
                      className={cx(
                        "w-full rounded-xl border border-line bg-surface px-2 py-1.5 text-left hover:border-accent/40 transition",
                        r.statut === "annule" && "opacity-50 line-through",
                        crAFaire(r) && "border-warn/40"
                      )}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold tabular-nums">
                        <span className={cx("size-1.5 rounded-full shrink-0", RDV_DOT[r.type])} />
                        {heure(r.debut)}
                      </div>
                      <div className="text-xs leading-snug line-clamp-2">{titreRdv(r, b)}</div>
                    </button>
                  );
                })}
                {!list.length && <div className="h-full min-h-[60px] grid place-items-center text-[11px] text-muted/60">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailSheet({ id, rdvs, onClose, render }: { id?: string; rdvs: RdvExt[]; onClose: () => void; render: (r: RdvExt) => ReactNode }) {
  const r = rdvs.find((x) => x.id === id);
  return (
    <Sheet open={!!r} onClose={onClose} title={r ? `${cap(dateLongue(r.debut))} · ${heure(r.debut)}` : ""}>
      {r && <div className="-mx-1">{render(r)}</div>}
    </Sheet>
  );
}
