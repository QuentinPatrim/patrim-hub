"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronRight, FileSignature, Flame, Calculator, MessageSquare, Phone, Sparkles, UserRoundCheck } from "lucide-react";
import { Avatar, Badge, Card, cx } from "@/components/ui";
import { RDV_TYPE, dateCourte, eurK, heure, ilya, initiales, nomComplet, today, addDays } from "@/lib/format";
import { smsHref, telHref } from "@/components/biens/utils";
import type { Bien, Contact, Estimation, Rdv } from "@/lib/types";

/* ============================================================
   Bloc « Aujourd'hui » de l'accueil : rendez-vous du jour, qui
   rappeler (nouveaux leads, relances prévues, contacts sans suivi
   depuis X jours), échéances de mandat et avis de valeur à relancer.
   ============================================================ */

const CLE_DELAI = "patrim-hub:aujourdhui-delai";
const DELAIS = [7, 14, 30] as const;
/** Délai après remise d'un avis de valeur avant de relancer le propriétaire (repris de Nexus). */
const RELANCE_AVIS_JOURS = 7;

type Raison = { label: string; tone: "danger" | "warn" | "info" | "brand" | "neutral"; rang: number };
const jours = (iso?: string) => (iso ? Math.floor((Date.now() - new Date(iso.length === 10 ? iso + "T12:00:00" : iso).getTime()) / 86400000) : Infinity);
const actif = (c: Contact) => c.etape !== "perdu" && c.etape !== "gagne" && (c.roles?.includes("acquereur") || c.roles?.includes("vendeur") || c.roles?.includes("prospect_vendeur"));
const aEteContacte = (c: Contact) => (c.historique ?? []).some((h) => h.type !== "note");

/** Délai « sans nouvelles » choisi sur ce téléphone (14 jours par défaut). */
export function delaiChoisi() {
  try {
    const v = Number(localStorage.getItem(CLE_DELAI));
    if (DELAIS.includes(v as (typeof DELAIS)[number])) return v;
  } catch {}
  return 14;
}

export function aRappeler(contacts: Contact[], delai: number) {
  const jour = today();
  const out: { c: Contact; raison: Raison }[] = [];
  for (const c of contacts) {
    if (!actif(c)) continue;
    const age = jours(c.createdAt);
    if (age <= 3 && (c.etape ?? "nouveau") === "nouveau" && !aEteContacte(c)) out.push({ c, raison: { label: age === 0 ? "Lead du jour" : `Lead · ${ilya(c.createdAt)}`, tone: "danger", rang: 0 } });
    else if (c.dateRelance && c.dateRelance <= jour) out.push({ c, raison: { label: c.dateRelance < jour ? `Relance du ${dateCourte(c.dateRelance)}` : "Relance prévue aujourd'hui", tone: "warn", rang: 1 } });
    else if (jours(c.dernierContact ?? c.createdAt) >= delai && (!c.dateRelance || c.dateRelance < jour))
      out.push({ c, raison: { label: `Sans nouvelles ${c.dernierContact ? ilya(c.dernierContact) : "depuis la création"}`, tone: "neutral", rang: 2 } });
  }
  return out.sort((a, b) => a.raison.rang - b.raison.rang || (b.c.chaleur ?? 0) - (a.c.chaleur ?? 0) || jours(b.c.dernierContact) - jours(a.c.dernierContact));
}

export function echeancesMandat(biens: Bien[]) {
  const jour = today();
  const limite = addDays(jour, 30);
  return biens
    .filter((b) => ["mandat_signe", "en_vente", "sous_offre"].includes(b.statut) && b.mandat?.fin && b.mandat.fin <= limite && b.mandat.fin >= addDays(jour, -15))
    .sort((a, b) => (a.mandat!.fin! < b.mandat!.fin! ? -1 : 1));
}

export function avisARelancer(estimations: Estimation[]) {
  return estimations.filter((e) => e.statut === "envoyee" && jours(e.updatedAt) >= RELANCE_AVIS_JOURS);
}

export function Aujourdhui({ biens, contacts, rdvs, estimations }: { biens: Bien[]; contacts: Contact[]; rdvs: Rdv[]; estimations: Estimation[] }) {
  const [delai, setDelai] = useState<number>(14);
  const [tout, setTout] = useState(false);
  useEffect(() => setDelai(delaiChoisi()), []);
  const choisirDelai = (v: number) => {
    setDelai(v);
    try {
      localStorage.setItem(CLE_DELAI, String(v));
    } catch {}
  };

  const jour = today();
  const rdvJour = useMemo(
    () => rdvs.filter((r) => r.statut !== "annule" && new Date(r.debut).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) === jour).sort((a, b) => a.debut.localeCompare(b.debut)),
    [rdvs, jour]
  );
  const rappels = useMemo(() => aRappeler(contacts, delai), [contacts, delai]);
  const mandats = useMemo(() => echeancesMandat(biens), [biens]);
  const avis = useMemo(() => avisARelancer(estimations), [estimations]);
  const rappelsVus = tout ? rappels : rappels.slice(0, 6);

  return (
    <Card title="Aujourd'hui" action={<Link href="/agenda" className="link">Agenda <ChevronRight size={14} /></Link>}>
      {/* Rendez-vous */}
      <Section icon={<CalendarDays size={14} />} titre="Rendez-vous" n={rdvJour.length}>
        {rdvJour.length ? (
          <ul className="-my-1">
            {rdvJour.map((r) => {
              const b = biens.find((x) => x.id === r.bienId);
              const c = contacts.find((x) => r.contactIds?.includes(x.id));
              const passe = new Date(r.fin ?? r.debut).getTime() < Date.now();
              return (
                <li key={r.id} className={cx("flex items-center gap-3 py-2", passe && "opacity-60")}>
                  <div className="w-[52px] shrink-0 rounded-xl bg-surface-2 py-1.5 text-center text-[13px] font-semibold tabular-nums">{heure(r.debut)}</div>
                  <div className={cx("w-[3px] self-stretch rounded-full", r.type === "visite" ? "bg-accent" : "bg-line")} />
                  <Link href={`/agenda?rdv=${r.id}`} className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {r.titre || RDV_TYPE[r.type]}
                      {c ? ` · ${nomComplet(c)}` : ""}
                    </div>
                    <div className="text-xs text-muted truncate">{b?.adresse ?? r.lieu ?? ""}</div>
                  </Link>
                  {passe && r.statut === "prevu" && r.type === "visite" ? (
                    <Link href={`/agenda?rdv=${r.id}`} className="btn-secondary btn-sm !h-10 shrink-0">Compte rendu</Link>
                  ) : (
                    c?.tel && (
                      <a href={telHref(c.tel)} className="grid place-items-center size-10 shrink-0 rounded-full bg-ok/10 text-ok hover:bg-ok/15 transition" aria-label="Appeler">
                        <Phone size={16} />
                      </a>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Aucun rendez-vous aujourd&apos;hui.{" "}
            <Link href="/agenda?nouveau=1" className="link">Planifier une visite</Link>
          </p>
        )}
      </Section>

      {/* Qui rappeler */}
      <Section
        icon={<Phone size={14} />}
        titre="Qui rappeler"
        n={rappels.length}
        extra={
          <label className="flex items-center gap-1 text-[11px] text-muted">
            Sans nouvelles depuis
            <select className="h-10 rounded-lg border border-line bg-surface px-1.5 text-[11px] text-fg" value={delai} onChange={(e) => choisirDelai(Number(e.target.value))}>
              {DELAIS.map((d) => (
                <option key={d} value={d}>
                  {d} j
                </option>
              ))}
            </select>
          </label>
        }
      >
        {rappels.length ? (
          <>
            <ul className="-mx-2">
              {rappelsVus.map(({ c, raison }) => (
                <li key={c.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2 transition">
                  <Avatar text={initiales(c)} />
                  <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{nomComplet(c)}</span>
                      {c.chaleur === 3 && <Flame size={13} className="shrink-0 text-danger" aria-label="Chaud" />}
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge tone={raison.tone} className="shrink-0">{raison.label}</Badge>
                      <span className="text-xs text-muted truncate">{c.prochaineAction || (c.criteres?.budgetMax ? `Budget ${eurK(c.criteres.budgetMax)}` : "")}</span>
                    </div>
                  </Link>
                  {c.tel && (
                    <a href={smsHref(c.tel)} className="hidden min-[380px]:grid place-items-center size-10 shrink-0 rounded-full bg-surface-2 text-muted hover:text-fg transition" aria-label="SMS">
                      <MessageSquare size={16} />
                    </a>
                  )}
                  {c.tel && (
                    <a href={telHref(c.tel)} className="grid place-items-center size-10 shrink-0 rounded-full bg-ok/10 text-ok hover:bg-ok/15 transition" aria-label="Appeler">
                      <Phone size={16} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
            {rappels.length > 6 && (
              <button className="btn-ghost btn-sm w-full mt-1" onClick={() => setTout(!tout)}>
                {tout ? "Réduire" : `Voir les ${rappels.length} contacts`}
              </button>
            )}
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <UserRoundCheck size={16} className="text-ok" /> Tout le monde a eu de vos nouvelles.
          </p>
        )}
      </Section>

      {/* Échéances */}
      {(mandats.length > 0 || avis.length > 0) && (
        <Section icon={<FileSignature size={14} />} titre="Échéances" n={mandats.length + avis.length}>
          <ul className="-mx-2">
            {mandats.map((b) => {
              const fin = b.mandat!.fin!;
              const depasse = fin < jour;
              return (
                <li key={b.id}>
                  <Link href={`/biens/${b.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2 transition">
                    <span className={cx("grid place-items-center size-10 shrink-0 rounded-xl", depasse ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn")}>
                      <FileSignature size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{b.titre || b.adresse}</span>
                      <span className="block text-xs text-muted">
                        Mandat {b.mandat?.numero ? `n° ${b.mandat.numero} ` : ""}
                        {depasse ? "échu le" : "jusqu'au"} {dateCourte(fin)} · à renouveler
                      </span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
            {avis.map((e) => (
              <li key={e.id}>
                <Link href={`/estimations/${e.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-2 transition">
                  <span className="grid place-items-center size-10 shrink-0 rounded-xl bg-accent/10 text-accent">
                    <Calculator size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{e.adresse}</span>
                    <span className="block text-xs text-muted">Avis de valeur remis {ilya(e.updatedAt)} · relancer le propriétaire</span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {!rdvJour.length && !rappels.length && !mandats.length && !avis.length && (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Sparkles size={14} className="text-accent" /> Journée calme : un bon moment pour la prospection.
        </p>
      )}
    </Card>
  );
}

function Section({ icon, titre, n, extra, children }: { icon: React.ReactNode; titre: string; n: number; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-3 mt-3 first:border-0 first:pt-0 first:mt-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          <span className="text-accent">{icon}</span> {titre}
          {n > 0 && <span className="grid place-items-center min-w-5 h-5 px-1.5 rounded-full bg-accent/10 text-accent text-[11px] tabular-nums tracking-normal">{n}</span>}
        </h3>
        {extra}
      </div>
      {children}
    </section>
  );
}
