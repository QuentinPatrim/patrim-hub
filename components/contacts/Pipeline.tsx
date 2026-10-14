"use client";

import { AlarmClock, ArrowRightLeft, Check, GripVertical, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Avatar, cx, Empty, Sheet } from "@/components/ui";
import { dateCourte, ETAPE, eurK, initiales, nomComplet, today } from "@/lib/format";
import { update } from "@/lib/store";
import type { Contact, EtapeAcquereur } from "@/lib/types";
import { Flames } from "./bits";
import { criteresResume, ETAPES, relanceEnRetard, sortByRelance } from "./helpers";

const DOT: Record<EtapeAcquereur, string> = {
  nouveau: "bg-sky-500",
  qualifie: "bg-muted",
  visite: "bg-warn",
  offre: "bg-accent",
  compromis: "bg-brand",
  gagne: "bg-ok",
  perdu: "bg-line",
};

export function Pipeline({ contacts, onNew }: { contacts: Contact[]; onNew: () => void }) {
  const acq = useMemo(() => contacts.filter((c) => c.roles?.includes("acquereur")), [contacts]);
  const cols = useMemo(() => {
    const m = Object.fromEntries(ETAPES.map((e) => [e, [] as Contact[]])) as Record<EtapeAcquereur, Contact[]>;
    acq.forEach((c) => m[c.etape ?? "nouveau"].push(c));
    ETAPES.forEach((e) => m[e].sort(sortByRelance));
    return m;
  }, [acq]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<EtapeAcquereur | null>(null);
  const [moving, setMoving] = useState<Contact | null>(null);
  // Glisser-déposer seulement avec une souris (sur mobile : menu « Passer à… »)
  const [canDrag, setCanDrag] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setCanDrag(mq.matches);
    const on = () => setCanDrag(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const move = (id: string, etape: EtapeAcquereur) => {
    const c = acq.find((x) => x.id === id);
    if (!c || (c.etape ?? "nouveau") === etape) return;
    update("contacts", id, {
      etape,
      historique: [{ date: new Date().toISOString(), type: "note" as const, texte: `Étape : ${ETAPE[c.etape ?? "nouveau"].label} → ${ETAPE[etape].label}` }, ...(c.historique ?? [])],
    });
  };

  if (!acq.length)
    return (
      <div className="card">
        <Empty
          icon={<Users size={22} />}
          title="Aucun acquéreur pour l'instant"
          text="Ajoutez un acquéreur ou collez un lead reçu par mail : il apparaîtra dans la colonne « Nouveau »."
          action={
            <button className="btn-primary" onClick={onNew}>
              Ajouter un acquéreur
            </button>
          }
        />
      </div>
    );

  return (
    <>
      <p className="mb-3 text-xs text-muted">
        {canDrag ? "Glissez-déposez une carte pour changer son étape." : "Faites défiler les étapes de côté. Touchez « Passer à… » pour avancer un dossier."}
      </p>
      <div className="-mx-4 sm:-mx-6 lg:mx-0 overflow-x-auto snap-x snap-mandatory scroll-px-4 pb-3">
        <div className="flex gap-3 px-4 sm:px-6 lg:px-0 w-max">
          {ETAPES.map((e) => {
            const list = cols[e];
            const total = list.reduce((s, c) => s + (c.criteres?.budgetMax ?? 0), 0);
            return (
              <section
                key={e}
                onDragOver={(ev: DragEvent) => {
                  if (!dragId) return;
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "move";
                  if (over !== e) setOver(e);
                }}
                onDragLeave={(ev) => {
                  if (!(ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node)) setOver((o) => (o === e ? null : o));
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const id = ev.dataTransfer.getData("text/plain") || dragId;
                  if (id) move(id, e);
                  setDragId(null);
                  setOver(null);
                }}
                className={cx(
                  "snap-start shrink-0 w-[82vw] max-w-[320px] sm:w-[300px] lg:w-[264px] rounded-2xl border bg-surface-2/60 flex flex-col transition",
                  over === e ? "border-accent/60 bg-accent/5 ring-2 ring-accent/15" : "border-line"
                )}
              >
                <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
                  <span className={cx("size-2 rounded-full", DOT[e])} />
                  <h3 className="text-sm font-semibold">{ETAPE[e].label}</h3>
                  <span className="rounded-full bg-surface px-1.5 text-[11px] font-semibold text-muted border border-line">{list.length}</span>
                  {total > 0 && <span className="ml-auto text-[11px] text-muted">{eurK(total)}</span>}
                </header>
                <div className="flex-1 space-y-2 px-2 pb-2 min-h-[120px] max-h-[62dvh] lg:max-h-[68vh] overflow-y-auto">
                  {list.map((c) => (
                    <PipeCard
                      key={c.id}
                      c={c}
                      dragging={dragId === c.id}
                      draggable={canDrag}
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onMove={() => setMoving(c)}
                    />
                  ))}
                  {!list.length && (
                    <div className={cx("grid place-items-center h-24 rounded-xl border border-dashed text-xs text-muted", over === e ? "border-accent/50" : "border-line")}>
                      {dragId ? "Déposer ici" : "Aucun dossier"}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <Sheet open={!!moving} onClose={() => setMoving(null)} title={moving ? `Passer ${nomComplet(moving)} à…` : ""}>
        {moving && (
          <div className="grid gap-1.5 pb-2">
            {ETAPES.map((e) => {
              const cur = (moving.etape ?? "nouveau") === e;
              return (
                <button
                  key={e}
                  onClick={() => {
                    move(moving.id, e);
                    setMoving(null);
                  }}
                  className={cx("flex items-center gap-3 h-12 px-3 rounded-xl border text-sm font-medium transition text-left", cur ? "border-accent/40 bg-accent/5" : "border-line hover:bg-surface-2")}
                >
                  <span className={cx("size-2.5 rounded-full", DOT[e])} />
                  {ETAPE[e].label}
                  {cur && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-accent">
                      <Check size={14} /> Étape actuelle
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </>
  );
}

function PipeCard({ c, dragging, draggable, onDragStart, onDragEnd, onMove }: { c: Contact; dragging: boolean; draggable: boolean; onDragStart: () => void; onDragEnd: () => void; onMove: () => void }) {
  const retard = relanceEnRetard(c);
  const jour = c.dateRelance === today();
  const resume = criteresResume(c.criteres);
  return (
    <div
      draggable={draggable}
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/plain", c.id);
        ev.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cx(
        "group rounded-xl border border-line bg-surface shadow-sm transition  hover:border-accent/30",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40 rotate-1 scale-[.98]"
      )}
    >
      <Link href={`/contacts/${c.id}`} className="block p-3 pb-2" draggable={false}>
        <div className="flex items-center gap-2.5">
          <Avatar text={initiales(c)} className="size-8 text-[11px]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{nomComplet(c)}</div>
            <Flames value={c.chaleur} size={11} />
          </div>
          {draggable && <GripVertical size={16} className="text-line group-hover:text-muted shrink-0" />}
        </div>
        {resume && <p className="mt-2 line-clamp-2 text-xs text-muted">{resume}</p>}
      </Link>
      <div className="flex items-center gap-2 border-t border-line px-3 py-1.5">
        {c.dateRelance ? (
          <span className={cx("flex items-center gap-1 text-[11px] font-medium", retard ? "text-danger" : jour ? "text-warn" : "text-muted")}>
            <AlarmClock size={12} /> {jour ? "Aujourd'hui" : dateCourte(c.dateRelance)}
          </span>
        ) : (
          <span className="text-[11px] text-muted">Pas de relance</span>
        )}
        <button onClick={onMove} className="ml-auto flex items-center gap-1 h-9 -mr-1.5 px-2 rounded-lg text-[11px] font-medium text-accent hover:bg-accent/5">
          <ArrowRightLeft size={13} /> Passer à…
        </button>
      </div>
    </div>
  );
}
