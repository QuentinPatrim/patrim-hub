"use client";

import { useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { Badge, Card, Tabs, cx } from "@/components/ui";
import { eur } from "@/lib/format";
import {
  MOIS,
  bilan,
  commissionDe,
  lignes,
  majuscule,
  nomMois,
  delais,
  parAnnee,
  prevu,
  previsionnel,
  projection,
  type Prevu,
  type Donnees,
  type LigneMois,
  TYPE_DOSSIER,
  type VenteRevenu,
} from "./revenus";

/* Cartes de la page « Mes revenus ». */

const s = (n: number) => (n > 1 ? "s" : "");
const pourcent = (x: number) => `${Math.round(x * 100)} %`;
const court = (n: number) => (n < 1000 ? String(Math.round(n)) : `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: n < 10000 ? 1 : 0 })}k`);
const dateFr = (ymd?: string) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

function Chiffre({ label, valeur, detail, accent }: { label: string; valeur: string; detail?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2/70 px-3 py-2.5 ring-1 ring-inset ring-line/60">
      <div className="truncate text-[11px] font-medium text-muted">{label}</div>
      <div className={cx("mt-1 truncate font-serif text-xl font-semibold leading-tight tabular-nums sm:text-2xl", accent && "text-accent")}>{valeur}</div>
      {detail && <div className="mt-0.5 text-[11px] leading-snug text-muted">{detail}</div>}
    </div>
  );
}

/* ---------- L'année en un coup d'œil ---------- */

export function AnneeCard({ d, auj }: { d: Donnees; auj: string }) {
  const b = bilan(d, auj);
  const base = d.contrat.base;
  const evol = b.evolution;
  return (
    <Card title={`${b.an}, à fin ${MOIS[Number(auj.slice(5, 7)) - 1]}`}>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Chiffre
          label={`Revenus ${base}`}
          valeur={eur(b.total)}
          accent
          detail={evol != null ? <span className={evol >= 0 ? "text-ok" : "text-danger"}>{`${evol >= 0 ? "+" : ""}${Math.round(evol * 100)} % vs ${b.an - 1} à date`}</span> : `sur ${b.moisEcoules} mois`}
        />
        <Chiffre
          label="Commissions"
          valeur={eur(b.commissions)}
          detail={b.evolutionCommissions != null ? <span className={b.evolutionCommissions >= 0 ? "text-ok" : "text-danger"}>{`${b.evolutionCommissions >= 0 ? "+" : ""}${Math.round(b.evolutionCommissions * 100)} % vs ${b.an - 1} à date`}</span> : `${b.moisAvecCommission} mois avec commission`}
        />
        <Chiffre label="Moyenne par mois" valeur={b.moyenne != null ? eur(b.moyenne) : "—"} detail={b.meilleur ? `record : ${eur(b.meilleur.total)} en ${MOIS[Number(b.meilleur.mois.slice(5, 7)) - 1]}` : undefined} />
        <Chiffre label="Part variable" valeur={b.partVariable != null ? pourcent(b.partVariable) : "—"} detail={`fixe ${eur(b.fixe)}`} />
      </div>
      {b.fixeManquant > 0 && (
        <p className="mt-3 text-xs text-warn">
          Ton fixe manque sur {b.fixeManquant} mois : renseigne les périodes de ton contrat pour avoir tes vrais revenus.
        </p>
      )}
    </Card>
  );
}

/* ---------- Objectif et fin d'année ---------- */

export function ObjectifCard({ d, auj, onContrat }: { d: Donnees; auj: string; onContrat: () => void }) {
  const p = projection(d, auj);
  const b = bilan(d, auj);
  const avance = p.objectif ? Math.min(1, p.commissionsRealisees / p.objectif) : 0;
  const avecVenir = p.objectif ? Math.min(1, (p.commissionsRealisees + p.commissionsAVenir) / p.objectif) : 0;
  return (
    <Card title={`Objectif ${p.an}`} action={<button className="btn-ghost btn-sm" onClick={onContrat}>{p.objectif ? "Modifier" : "Fixer"}</button>}>
      {p.objectif ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-serif text-2xl font-semibold tabular-nums">{eur(p.commissionsRealisees)}</span>
            <span className="text-sm text-muted">sur {eur(p.objectif)} de commissions</span>
          </div>
          <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line/60" role="img" aria-label={`${pourcent(avance)} de l'objectif`}>
            <div className="absolute inset-y-0 left-0 bg-accent/25" style={{ width: `${avecVenir * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${avance * 100}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>{pourcent(avance)} atteint</span>
            {p.commissionsAVenir > 0 && <span>{pourcent(avecVenir)} avec les ventes en cours</span>}
          </div>
          {p.reste ? (
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                Il reste <b className="tabular-nums">{eur(p.reste)}</b>, soit <b className="tabular-nums">{eur(p.rythme)}</b> par mois d&apos;ici décembre.
              </li>
              {p.ventesNecessaires != null && (
                <li className="text-muted">
                  À ta commission moyenne sur une vente ({eur(b.commissionMoyenneVente)}), c&apos;est environ {p.ventesNecessaires} vente{s(p.ventesNecessaires)} à acter, ou {eur(p.honorairesNecessaires)} d&apos;honoraires {d.contrat.honorairesTTC ? "TTC" : "HT"} signés chez le notaire.
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-4 text-sm font-medium text-ok">Objectif atteint, bravo&nbsp;!</p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted">Fixe-toi un objectif de commissions pour l&apos;année : tu verras ce qu&apos;il reste à faire chaque mois.</p>
      )}
      <div className="mt-4 rounded-xl bg-surface-2/70 px-3 py-2.5 text-sm ring-1 ring-inset ring-line/60">
        <div className="text-[11px] font-medium text-muted">Fin d&apos;année estimée</div>
        <div className="mt-0.5 font-serif text-xl font-semibold tabular-nums">{eur(p.atterrissage)}</div>
        <div className="text-[11px] leading-snug text-muted">
          {eur(p.realise)} déjà perçus{p.fixeRestant ? ` + ${eur(p.fixeRestant)} de fixe` : ""}
          {p.commissionsAVenir ? ` + ${eur(p.commissionsAVenir)} de ventes en cours` : ""}, sans nouvelle vente.
        </div>
      </div>
    </Card>
  );
}

/* ---------- Mois par mois ---------- */

export function GraphiqueCard({ d, auj }: { d: Donnees; auj: string }) {
  const toutes = lignes(d, auj);
  const annees = [...new Set(toutes.map((l) => Number(l.mois.slice(0, 4))))].sort();
  const anCourant = Number(auj.slice(0, 4));
  const [choix, setChoix] = useState(anCourant);
  const an = annees.includes(choix) ? choix : annees[annees.length - 1] ?? anCourant;
  const donnees = Array.from({ length: 12 }, (_, i) => {
    const m = `${an}-${String(i + 1).padStart(2, "0")}`;
    return toutes.find((l) => l.mois === m) ?? ({ mois: m, fixe: 0, commissions: 0, primes: 0, ik: 0, autres: 0, total: 0, ventes: [], fixeConnu: false } satisfies LigneMois);
  });
  const max = Math.max(1, ...donnees.map((m) => m.total));
  const actuel = an === anCourant ? Number(auj.slice(5, 7)) - 1 : undefined;

  return (
    <Card title={annees.length > 1 ? "Mois par mois" : `Mois par mois, ${an}`}>
      {annees.length > 1 && <Tabs value={String(an)} onChange={(v) => setChoix(Number(v))} items={annees.map((a) => ({ value: String(a), label: String(a) }))} />}
      <div className="flex items-end gap-1 border-b border-line pt-5">
        {donnees.map((m, i) => {
          const variable = m.commissions + m.primes;
          const autre = m.fixe + m.ik + m.autres;
          const titre = m.total ? `${majuscule(nomMois(m.mois))} : ${eur(m.total)}${variable ? `, dont ${eur(variable)} de variable` : ""}` : `${majuscule(nomMois(m.mois))} : rien`;
          return (
            <div key={m.mois} role="img" aria-label={titre} title={titre} className="flex h-32 min-w-0 flex-1 items-end justify-center">
              {m.total > 0 && (
                <div className="relative flex w-full max-w-7 flex-col justify-end" style={{ height: `${Math.max(4, (m.total / max) * 100)}%` }}>
                  {variable > 0 && <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-accent">{court(m.total)}</span>}
                  {variable > 0 && <div className="w-full rounded-t-md bg-accent" style={{ height: `${(variable / m.total) * 100}%` }} />}
                  {autre > 0 && <div className={cx("w-full bg-fg/15", !variable && "rounded-t-md", i === actuel && "bg-fg/25")} style={{ height: `${(autre / m.total) * 100}%` }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {donnees.map((m, i) => (
          <span key={m.mois} className={cx("flex-1 text-center text-[10px] text-muted", i === actuel && "font-bold text-fg")}>
            {MOIS[i][0].toUpperCase()}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-fg/15" /> Fixe et indemnités
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent" /> Commissions et primes
        </span>
      </div>
    </Card>
  );
}

/* ---------- Chiffres marquants ---------- */

export function ReperesCard({ d, auj }: { d: Donnees; auj: string }) {
  const b = bilan(d, auj);
  const c = d.contrat;
  const pour1000 = (c.honorairesTTC ? 1000 / (1 + c.tva) : 1000) * c.taux;
  const ans = parAnnee(d, auj);
  return (
    <Card title="Tes repères">
      <div className="grid grid-cols-2 gap-2">
        <Chiffre label="Depuis le début" valeur={eur(b.depuisDebut)} detail={`dont ${eur(b.commissionsDepuisDebut)} de commissions`} />
        <Chiffre label="Commission moyenne" valeur={b.moyenneCommissions != null ? eur(b.moyenneCommissions) : "—"} detail="par mois où tu en touches" />
        <Chiffre label="Mois payés" valeur={String(b.moisDepuisDebut)} detail={`soit ${eur(b.moisDepuisDebut ? b.depuisDebut / b.moisDepuisDebut : 0)} par mois en moyenne`} />
        <Chiffre label="1 000 € d'honoraires" valeur={eur(pour1000)} detail={`te rapportent (${Math.round(c.taux * 100)} % du HT)`} />
      </div>
      {ans.length > 0 && (
        <ul className="mt-4 divide-y divide-line/70 rounded-xl border border-line/70">
          {ans.map((a) => (
            <li key={a.an} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="font-semibold">{a.an}</div>
                <div className="text-[11px] text-muted">
                  {a.mois} mois · {eur(a.mois ? a.total / a.mois : 0)} / mois
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-serif font-semibold tabular-nums">{eur(a.total)}</div>
                <div className="text-[11px] text-muted tabular-nums">{eur(a.variable)} variable</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Ventes ---------- */

function LigneVente({ v, d, auj, onOuvrir }: { v: VenteRevenu; d: Donnees; auj: string; onOuvrir: (v: VenteRevenu) => void }) {
  const com = commissionDe(v, d.contrat);
  const attendue = v.statut !== "acte";
  const retard = attendue && v.dateActe && v.dateActe < auj;
  const type = v.type ?? "vente";
  const quand =
    v.statut === "acte"
      ? v.moisPaie
        ? `Payée en ${nomMois(v.moisPaie)}`
        : `Acte du ${dateFr(v.dateActe)}`
      : v.dateActe
        ? `${type === "vente" ? "Acte prévu" : "Prévue"} le ${dateFr(v.dateActe)}${retard ? ", à confirmer" : ""}`
        : `${type === "vente" ? "Acte estimé" : "Estimée"} en ${nomMois(prevu(v, d.contrat, auj).mois)}`;
  return (
    <li>
      <button onClick={() => onOuvrir(v)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{v.libelle}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {type !== "vente" && <Badge>{TYPE_DOSSIER[type]}</Badge>}
            {attendue && type === "vente" && <Badge tone={v.statut === "compromis" ? "brand" : "neutral"}>{v.statut === "compromis" ? "Compromis" : "Offre"}</Badge>}
            <span className={cx(retard && "text-warn")}>{quand}</span>
            {v.partage > 1 && <span>· partagée à {v.partage}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cx("whitespace-nowrap font-serif text-[15px] font-semibold tabular-nums", attendue && "text-muted")}>{eur(com)}</div>
          {v.honoraires != null && <div className="text-[11px] text-muted tabular-nums">sur {eur(v.honoraires)}</div>}
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

export function VentesCard({ d, auj, onOuvrir, onAjouter }: { d: Donnees; auj: string; onOuvrir: (v: VenteRevenu) => void; onAjouter: () => void }) {
  const [tout, setTout] = useState(false);
  const quand = (v: VenteRevenu) => v.moisPaie ?? v.dateActe ?? "";
  const enCours = d.ventes.filter((v) => v.statut !== "acte").sort((a, b) => (quand(a) || "9").localeCompare(quand(b) || "9"));
  const actees = d.ventes.filter((v) => v.statut === "acte").sort((a, b) => quand(b).localeCompare(quand(a)));
  const visibles = tout ? actees : actees.slice(0, 5);
  return (
    <Card title="Mes dossiers" pad={false} action={<button className="btn-ghost btn-sm" onClick={onAjouter}>Ajouter</button>}>
      {!d.ventes.length ? (
        <p className="card-pad !pt-3 text-sm text-muted">Aucun dossier pour l&apos;instant : ajoute tes ventes, locations et mises en gestion pour suivre tes commissions.</p>
      ) : (
        <div className="pb-2">
          {enCours.length > 0 && (
            <>
              <div className="eyebrow px-4 pb-1 pt-3 sm:px-5">En cours</div>
              <ul className="divide-y divide-line/70">
                {enCours.map((v) => (
                  <LigneVente key={v.id} v={v} d={d} auj={auj} onOuvrir={onOuvrir} />
                ))}
              </ul>
            </>
          )}
          {actees.length > 0 && (
            <>
              <div className="eyebrow px-4 pb-1 pt-3 sm:px-5">Encaissés</div>
              <ul className="divide-y divide-line/70">
                {visibles.map((v) => (
                  <LigneVente key={v.id} v={v} d={d} auj={auj} onOuvrir={onOuvrir} />
                ))}
              </ul>
              {actees.length > visibles.length && (
                <button className="btn-ghost btn-sm mx-4 mt-1 sm:mx-5" onClick={() => setTout(true)}>
                  Voir les {actees.length} dossiers
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- Prévisionnel ---------- */

const moisCourt = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");

function LignePrevu({ p, onOuvrir }: { p: Prevu; onOuvrir: (v: VenteRevenu) => void }) {
  const v = p.v;
  const type = v.type ?? "vente";
  const quand = p.depasse
    ? `${v.dateActe ? `Acte prévu le ${dateFr(v.dateActe)}` : "Date estimée passée"}, à confirmer`
    : p.estime
      ? v.dateCompromis
        ? `Compromis du ${dateFr(v.dateCompromis)}, acte estimé`
        : v.dateOffre
          ? `Offre du ${dateFr(v.dateOffre)}, acte estimé`
          : "Acte estimé"
      : v.moisPaie
        ? "Mois de paie choisi"
        : `Acte prévu le ${dateFr(v.dateActe)}`;
  return (
    <li>
      <button onClick={() => onOuvrir(v)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{v.libelle}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {type !== "vente" ? <Badge>{TYPE_DOSSIER[type]}</Badge> : <Badge tone={v.statut === "offre" ? "neutral" : "brand"}>{v.statut === "offre" ? "Sous offre" : "Compromis"}</Badge>}
            <span className={cx(p.depasse && "text-warn")}>{quand}</span>
            {v.id.startsWith("hub:") && <span>· fiche du bien</span>}
          </div>
        </div>
        <div className={cx("shrink-0 whitespace-nowrap text-right font-serif text-[15px] font-semibold tabular-nums", v.statut === "offre" && "text-muted")}>
          {p.commission != null ? eur(p.commission) : <span className="font-sans text-xs font-normal text-warn">Honoraires ?</span>}
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </button>
    </li>
  );
}

export function PrevisionnelCard({ d, auj, onOuvrir }: { d: Donnees; auj: string; onOuvrir: (v: VenteRevenu) => void }) {
  const p = previsionnel(d, auj);
  const dl = delais(d.contrat);
  const max = Math.max(1, ...p.mois.map((m) => m.total));
  const n = p.mois.length;
  const commissions = p.compromis + p.offres;
  return (
    <Card title="Prévisionnel" pad={false}>
      <div className="card-pad !pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Chiffre label={`Sur ${n} mois`} valeur={eur(p.total)} accent detail={`soit ${eur(p.total / n)} par mois`} />
          <Chiffre
            label="Commissions attendues"
            valeur={eur(commissions)}
            detail={p.offres > 0 ? `dont ${eur(p.offres)} encore sous offre` : p.prevus.length ? "toutes en compromis" : "aucune vente en cours"}
          />
        </div>

        <div className="mt-5 flex items-end gap-1.5 border-b border-line">
          {p.mois.map((m) => {
            const sur = m.dejaPercu + m.compromis;
            const titre = `${majuscule(nomMois(m.mois))} : ${eur(m.total)}${m.compromis + m.offres ? `, dont ${eur(m.compromis + m.offres)} de commissions attendues` : ""}`;
            return (
              <div key={m.mois} role="img" aria-label={titre} title={titre} className="flex h-32 min-w-0 flex-1 items-end justify-center">
                {m.total > 0 && (
                  <div className="relative flex w-full max-w-9 flex-col justify-end" style={{ height: `${Math.max(4, (m.total / max) * 100)}%` }}>
                    {(sur > 0 || m.offres > 0) && (
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-accent">{court(m.total)}</span>
                    )}
                    {m.offres > 0 && <div className="w-full rounded-t-md bg-accent/35" style={{ height: `${(m.offres / m.total) * 100}%` }} />}
                    {sur > 0 && <div className={cx("w-full bg-accent", !m.offres && "rounded-t-md")} style={{ height: `${(sur / m.total) * 100}%` }} />}
                    {m.fixe > 0 && <div className={cx("w-full bg-fg/15", !sur && !m.offres && "rounded-t-md")} style={{ height: `${(m.fixe / m.total) * 100}%` }} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1.5" aria-hidden>
          {p.mois.map((m, i) => (
            <span key={m.mois} className={cx("min-w-0 flex-1 truncate text-center text-[10px] text-muted", i === 0 && "font-bold text-fg")}>
              {moisCourt(m.mois)}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-fg/15" /> Fixe et indemnités
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-accent" /> Compromis
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-accent/35" /> Sous offre
          </span>
        </div>
      </div>

      {p.prevus.length > 0 ? (
        <div className="pb-2">
          {p.mois
            .filter((m) => m.prevus.length)
            .map((m) => (
              <div key={m.mois}>
                <div className="flex items-baseline justify-between gap-2 px-4 pb-1 pt-3 sm:px-5">
                  <span className="eyebrow">{majuscule(nomMois(m.mois))}</span>
                  <span className="text-xs tabular-nums text-muted">{eur(m.total)} au total</span>
                </div>
                <ul className="divide-y divide-line/70">
                  {m.prevus.map((x) => (
                    <LignePrevu key={x.v.id} p={x} onOuvrir={onOuvrir} />
                  ))}
                </ul>
              </div>
            ))}
          {p.prevus.some((x) => x.mois > p.mois[n - 1].mois) && (
            <>
              <div className="eyebrow px-4 pb-1 pt-3 sm:px-5">Plus tard</div>
              <ul className="divide-y divide-line/70">
                {p.prevus
                  .filter((x) => x.mois > p.mois[n - 1].mois)
                  .map((x) => (
                    <LignePrevu key={x.v.id} p={x} onOuvrir={onOuvrir} />
                  ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <p className="card-pad !pt-0 text-sm text-muted">
          Aucune vente en cours pour l&apos;instant. Dès qu&apos;un de tes biens passe sous offre dans le Hub, ou que tu ajoutes un dossier en cours, sa commission apparaît ici au mois probable de l&apos;acte.
        </p>
      )}
      <p className="card-pad !pt-1 text-[11px] leading-relaxed text-muted">
        Sans date d&apos;acte, on compte {dl.acte} mois entre compromis et acte{dl.compromis ? `, et ${dl.compromis} mois entre l'offre et le compromis` : ""} (modifiable dans « Mon contrat »). Une offre peut encore tomber : elle est en clair.
        {p.sansMontant > 0 && ` ${p.sansMontant} vente${s(p.sansMontant)} sans honoraires connus ne ${p.sansMontant > 1 ? "sont" : "est"} pas comptée${s(p.sansMontant)}.`}
      </p>
    </Card>
  );
}

/* ---------- Historique des mois ---------- */

export function HistoriqueCard({ d, auj, onPointer }: { d: Donnees; auj: string; onPointer: (mois: string) => void }) {
  const [tout, setTout] = useState(false);
  const ls = lignes(d, auj).reverse();
  const visibles = tout ? ls : ls.slice(0, 6);
  if (!ls.length) return null;
  return (
    <Card title="Historique" pad={false}>
      <ul className="divide-y divide-line/70 pb-2">
        {visibles.map((l) => {
          const ecart = l.pointe?.verse != null ? l.pointe.verse - l.total : undefined;
          return (
            <li key={l.mois}>
              <button onClick={() => onPointer(l.mois)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {majuscule(nomMois(l.mois))}
                    {l.pointe ? <Badge tone="ok">Pointé</Badge> : null}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {[l.fixeConnu ? `fixe ${eur(l.fixe)}` : "fixe à compléter", l.commissions && `commission ${eur(l.commissions)}`, l.primes && `primes ${eur(l.primes)}`, l.ik && `IK ${eur(l.ik)}`, l.autres && `autres ${eur(l.autres)}`].filter(Boolean).join(" · ")}
                  </div>
                  {ecart != null && Math.abs(ecart) >= 1 && <div className="text-[11px] text-warn">Versé : {eur(l.pointe!.verse)} ({ecart > 0 ? "+" : ""}{eur(ecart)})</div>}
                </div>
                <div className={cx("shrink-0 font-serif text-[15px] font-semibold tabular-nums", l.commissions + l.primes > 0 && "text-accent")}>{eur(l.total)}</div>
                <Pencil size={14} className="shrink-0 text-muted" />
              </button>
            </li>
          );
        })}
      </ul>
      {ls.length > visibles.length && (
        <button className="btn-ghost btn-sm mx-4 mb-3 sm:mx-5" onClick={() => setTout(true)}>
          Voir les {ls.length} mois
        </button>
      )}
    </Card>
  );
}
