"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge, Card, Tabs, cx } from "@/components/ui";
import { SOURCE, STATUT_BIEN, eur } from "@/lib/format";
import type { Bien } from "@/lib/types";
import { dateTexte } from "@/components/vente/vente";
import {
  MOIS,
  activite,
  annee,
  anneesDe,
  bilan,
  kEur,
  mois,
  origines,
  parMois,
  transformation,
  ventes,
  type Activite,
  type Donnees,
  type LigneOrigine,
  type MoisHonoraires,
  type Vente,
} from "./chiffres";

/* Cartes de la page « Mes chiffres ». */

const s = (n: number) => (n > 1 ? "s" : "");
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const pourcent = (x: number) => `${Math.round(x * 100)} %`;
/** « 7,5k » au-dessus des barres du graphique. */
const court = (n: number) => (n < 1000 ? String(Math.round(n)) : `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: n < 10000 ? 1 : 0 })}k`);

function Chiffre({ label, valeur, detail, accent }: { label: string; valeur: string; detail: string; accent?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2/70 px-3 py-2.5 ring-1 ring-inset ring-line/60">
      <div className="truncate text-[11px] font-medium text-muted">{label}</div>
      <div className={cx("mt-1 truncate font-serif text-xl font-semibold leading-tight tabular-nums sm:text-2xl", accent && "text-accent")}>{valeur}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted">{detail}</div>
    </div>
  );
}

/* ---------- Honoraires ---------- */

export function HonorairesCard({ biens, auj }: { biens: Bien[]; auj: string }) {
  const anCourant = Number(auj.slice(0, 4));
  const [choix, setChoix] = useState(anCourant);
  const b = bilan(biens, auj);
  const vs = ventes(biens, auj);
  const annees = anneesDe(vs, auj);
  const an = annees.includes(choix) ? choix : anCourant;
  const donnees = parMois(vs, an);
  const max = Math.max(...donnees.map((m) => m.signe + m.prevu));

  return (
    <Card title="Honoraires">
      <div className="grid grid-cols-3 gap-2">
        <Chiffre label="Encaissés" valeur={kEur(b.encaisses)} detail={b.actes ? `${b.actes} acte${s(b.actes)} en ${anCourant}` : `aucun acte en ${anCourant}`} accent />
        <Chiffre label="À venir" valeur={kEur(b.aVenir)} detail={b.enCours ? `${b.enCours} vente${s(b.enCours)} en cours` : "aucune vente en cours"} />
        <Chiffre label="Portefeuille" valeur={kEur(b.portefeuille)} detail={`${b.mandats} bien${s(b.mandats)} en vente`} />
      </div>
      {b.sansMontant > 0 && (
        <p className="mt-2 text-xs text-muted">
          {b.sansMontant} bien{s(b.sansMontant)} sans honoraires connus&nbsp;: ajoutez les honoraires, ou le prix et le net vendeur, sur {b.sansMontant > 1 ? "leur" : "sa"} fiche.
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Mois par mois{annees.length < 2 ? `, ${an}` : ""}</h3>
        {annees.length > 1 && <Tabs value={String(an)} onChange={(v) => setChoix(Number(v))} items={annees.map((a) => ({ value: String(a), label: String(a) }))} />}
      </div>
      {max > 0 ? (
        <Graphique donnees={donnees} max={max} actuel={an === anCourant ? Number(auj.slice(5, 7)) - 1 : undefined} />
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-5 text-center text-xs leading-relaxed text-muted">
          Les honoraires s&apos;affichent ici mois par mois, dès qu&apos;une date d&apos;acte est saisie dans le suivi de la vente.
        </p>
      )}
    </Card>
  );
}

function Graphique({ donnees, max, actuel }: { donnees: MoisHonoraires[]; max: number; actuel?: number }) {
  return (
    <div className="mt-2">
      <div className="flex items-end gap-1 border-b border-line pt-5">
        {donnees.map((m) => {
          const total = m.signe + m.prevu;
          const titre = total ? `${majuscule(MOIS[m.mois])} : ${[m.signe && `${eur(m.signe)} encaissés`, m.prevu && `${eur(m.prevu)} prévus`].filter(Boolean).join(", ")}` : `${majuscule(MOIS[m.mois])} : aucun acte`;
          return (
            <div key={m.mois} role="img" aria-label={titre} title={titre} className="flex h-28 min-w-0 flex-1 items-end justify-center">
              {total > 0 && (
                <div className="relative flex w-full max-w-7 flex-col justify-end" style={{ height: `${Math.max(4, (total / max) * 100)}%` }}>
                  <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums text-muted">{court(total)}</span>
                  {m.prevu > 0 && <div className="w-full rounded-t-md bg-accent/20 ring-1 ring-inset ring-accent/30" style={{ height: `${(m.prevu / total) * 100}%` }} />}
                  {m.signe > 0 && <div className={cx("w-full bg-accent", !m.prevu && "rounded-t-md")} style={{ height: `${(m.signe / total) * 100}%` }} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {donnees.map((m) => (
          <span key={m.mois} className={cx("flex-1 text-center text-[10px] text-muted", m.mois === actuel && "font-bold text-fg")}>
            {MOIS[m.mois][0].toUpperCase()}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent" /> Acte signé
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-accent/20 ring-1 ring-inset ring-accent/30" /> Acte prévu
        </span>
      </div>
    </div>
  );
}

/* ---------- Ventes ---------- */

function texteActe(v: Vente, auj: string) {
  if (!v.acte) return "Date de l'acte à compléter";
  if (v.etat === "signee") return `Acte signé le ${dateTexte(v.acte, auj)}`;
  if (v.acte === auj) return "Acte aujourd'hui";
  return v.acte > auj ? `Acte prévu le ${dateTexte(v.acte, auj)}` : `Acte prévu le ${dateTexte(v.acte, auj)}, à confirmer`;
}

function LigneVente({ v, auj }: { v: Vente; auj: string }) {
  const statut = STATUT_BIEN[v.b.statut];
  return (
    <li>
      <Link href={`/biens/${v.b.id}/vente`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{v.b.titre || v.b.adresse}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {v.etat === "enCours" && <Badge tone={statut.tone}>{statut.label}</Badge>}
            <span className={cx(v.acte && !(v.etat === "enCours" && v.acte < auj) ? "text-muted" : "text-warn")}>{texteActe(v, auj)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="whitespace-nowrap font-serif text-[15px] font-semibold tabular-nums">{v.honoraires != null ? eur(v.honoraires) : "—"}</div>
          {v.honoraires == null && <div className="text-[11px] text-warn">honoraires à compléter</div>}
        </div>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>
    </li>
  );
}

function Groupe({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow px-4 pb-1 pt-3 sm:px-5">{titre}</div>
      <ul className="divide-y divide-line/70">{children}</ul>
    </div>
  );
}

const SIGNEES_VISIBLES = 6;

export function VentesCard({ biens, auj }: { biens: Bien[]; auj: string }) {
  const [tout, setTout] = useState(false);
  const vs = ventes(biens, auj);
  const enCours = vs.filter((v) => v.etat === "enCours").sort((x, y) => (x.acte ?? "9").localeCompare(y.acte ?? "9"));
  const aDater = vs.filter((v) => v.etat === "aDater");
  const signees = vs.filter((v) => v.etat === "signee").sort((x, y) => (y.acte ?? "").localeCompare(x.acte ?? ""));

  if (!vs.length)
    return (
      <Card title="Ventes">
        <p className="text-sm text-muted">
          Aucune vente en cours pour l&apos;instant. Quand une offre est acceptée, le bien passe «&nbsp;Sous offre&nbsp;» et apparaît ici avec ses honoraires et la date de l&apos;acte.
        </p>
      </Card>
    );

  return (
    <Card title="Ventes" pad={false}>
      <div className="pb-2">
        {enCours.length > 0 && (
          <Groupe titre="En cours">
            {enCours.map((v) => (
              <LigneVente key={v.b.id} v={v} auj={auj} />
            ))}
          </Groupe>
        )}
        {aDater.length > 0 && (
          <Groupe titre="Vendus, date de l'acte à saisir">
            {aDater.map((v) => (
              <LigneVente key={v.b.id} v={v} auj={auj} />
            ))}
          </Groupe>
        )}
        {signees.length > 0 && (
          <Groupe titre="Actes signés">
            {(tout ? signees : signees.slice(0, SIGNEES_VISIBLES)).map((v) => (
              <LigneVente key={v.b.id} v={v} auj={auj} />
            ))}
          </Groupe>
        )}
        {signees.length > SIGNEES_VISIBLES && (
          <button type="button" onClick={() => setTout(!tout)} className="btn-ghost btn-sm mx-2.5 mt-1 sm:mx-3.5">
            {tout ? "Réduire" : `Voir les ${signees.length} actes signés`}
          </button>
        )}
      </div>
    </Card>
  );
}

/* ---------- Activité ---------- */

type Vue = "mois" | "precedent" | "annee";

const TUILES: { cle: Exclude<keyof Activite, "exclusifs" | "actes">; label: string }[] = [
  { cle: "estimations", label: "Estimations" },
  { cle: "mandats", label: "Mandats signés" },
  { cle: "acquereurs", label: "Nouveaux acquéreurs" },
  { cle: "visites", label: "Visites" },
  { cle: "offres", label: "Offres" },
  { cle: "compromis", label: "Compromis" },
];

export function ActiviteCard({ d, auj, maintenant }: { d: Donnees; auj: string; maintenant: Date }) {
  const [vue, setVue] = useState<Vue>("mois");
  const an = Number(auj.slice(0, 4));
  const [m0, m1, m2] = [mois(auj, 0), mois(auj, -1), mois(auj, -2)];
  const a = activite(d, vue === "mois" ? m0 : vue === "precedent" ? m1 : annee(an), maintenant);
  // Comparaison : le mois d'avant ; pour l'année, la moyenne par mois écoulé.
  const avant = vue === "annee" ? undefined : vue === "mois" ? { nom: m1.nom, a: activite(d, m1, maintenant) } : { nom: m2.nom, a: activite(d, m2, maintenant) };
  const moisEcoules = Number(auj.slice(5, 7));
  const repere = (cle: keyof Activite) =>
    avant ? `${majuscule(avant.nom)} : ${avant.a[cle]}` : a[cle] ? `${(a[cle] / moisEcoules).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} par mois` : "";
  const plus: Partial<Record<keyof Activite, string>> = {
    mandats: a.exclusifs ? `dont ${a.exclusifs} en exclusivité` : undefined,
    compromis: a.actes ? `${a.actes} acte${s(a.actes)} signé${s(a.actes)}` : undefined,
  };

  return (
    <Card title="Activité">
      <Tabs
        value={vue}
        onChange={setVue}
        items={[
          { value: "mois", label: majuscule(m0.nom) },
          { value: "precedent", label: majuscule(m1.nom) },
          { value: "annee", label: String(an) },
        ]}
      />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TUILES.map(({ cle, label }) => (
          <div key={cle} className="min-w-0 rounded-xl bg-surface-2/70 px-3 py-2.5 ring-1 ring-inset ring-line/60">
            <div className="truncate text-[11px] font-medium text-muted">{label}</div>
            <div className="mt-1 font-serif text-2xl font-semibold leading-none tabular-nums">{a[cle]}</div>
            {plus[cle] && <div className="mt-1 text-[11px] font-medium text-accent">{plus[cle]}</div>}
            <div className="mt-1 min-h-[14px] text-[11px] leading-snug text-muted">{repere(cle)}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Visites&nbsp;: celles de l&apos;agenda. Estimations&nbsp;: rendez-vous de l&apos;agenda ou estimations faites dans le Hub. Offres&nbsp;: celles rédigées dans le Hub. Compromis et actes&nbsp;: les dates du suivi de la
        vente.
      </p>
    </Card>
  );
}

/* ---------- Transformation ---------- */

export function TransformationCard({ d, maintenant }: { d: Donnees; maintenant: Date }) {
  const t = transformation(d, maintenant);
  const lignes = [
    {
      label: "De la visite à l'offre",
      valeur: t.visiteurs ? pourcent(t.offrants / t.visiteurs) : "—",
      texte: !t.visiteurs
        ? "Aucune visite d'un nouvel acquéreur dans l'agenda."
        : t.offrants
          ? `${t.offrants} acquéreur${s(t.offrants)} sur ${t.visiteurs} ayant visité ${t.offrants > 1 ? "ont" : "a"} fait une offre.`
          : `Aucun des ${t.visiteurs} acquéreur${s(t.visiteurs)} ayant visité n'a fait d'offre.`,
    },
    {
      label: "De l'estimation au mandat",
      valeur: t.estimations ? pourcent(t.mandatsObtenus / t.estimations) : "—",
      texte: t.estimations
        ? `${t.mandatsObtenus} mandat${s(t.mandatsObtenus)} sur ${t.estimations} estimation${s(t.estimations)} faite${s(t.estimations)} dans le Hub.`
        : "Pas encore d'estimation faite dans le Hub : le taux se calculera avec les prochaines.",
    },
    {
      label: "Délai de vente",
      valeur: t.delai != null ? `${t.delai} j` : "—",
      texte:
        t.delai != null
          ? `En moyenne entre la mise en vente et l'accord (offre acceptée ou avant-contrat), sur ${t.ventesDelai} vente${s(t.ventesDelai)}.`
          : "Se calcule avec la date du mandat et celle de l'avant-contrat, saisie dans le suivi de la vente.",
    },
    {
      label: "Exclusivité",
      valeur: t.mandatsEnCours ? pourcent(t.exclusifs / t.mandatsEnCours) : "—",
      texte: !t.mandatsEnCours
        ? "Aucun mandat en cours."
        : t.exclusifs
          ? `${t.exclusifs} mandat${s(t.exclusifs)} en cours sur ${t.mandatsEnCours} ${t.exclusifs > 1 ? "sont" : "est"} en exclusivité.`
          : `Aucun des ${t.mandatsEnCours} mandat${s(t.mandatsEnCours)} en cours n'est en exclusivité.`,
    },
  ];

  return (
    <Card title="Transformation">
      <p className="text-xs text-muted">Sur les 12 derniers mois, d&apos;après le Hub.</p>
      <ul className="mt-1 divide-y divide-line/70">
        {lignes.map((l) => (
          <li key={l.label} className="flex items-start gap-3 py-3 last:pb-0">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{l.label}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{l.texte}</p>
            </div>
            <div className="shrink-0 whitespace-nowrap font-serif text-2xl font-semibold tabular-nums">{l.valeur}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------- Origine des acquéreurs ---------- */

function suite(l: LigneOrigine) {
  return [
    l.visite ? `${l.visite} ${l.visite > 1 ? "ont" : "a"} visité` : "aucune visite",
    l.offre ? `${l.offre} ${l.offre > 1 ? "ont" : "a"} fait une offre` : "aucune offre",
    l.vente ? `${l.vente} ${l.vente > 1 ? "ont" : "a"} acheté` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function OrigineCard({ d, maintenant }: { d: Donnees; maintenant: Date }) {
  const lignes = origines(d, maintenant);
  const total = lignes.reduce((t, l) => ({ contacts: t.contacts + l.contacts, visite: t.visite + l.visite, offre: t.offre + l.offre }), { contacts: 0, visite: 0, offre: 0 });
  const max = Math.max(1, ...lignes.map((l) => l.contacts));

  return (
    <Card title="Origine des acquéreurs">
      {!lignes.length ? (
        <p className="text-sm text-muted">Aucun nouvel acquéreur sur les 12 derniers mois.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            Sur les 12 derniers mois&nbsp;: {total.contacts} {total.contacts > 1 ? "nouveaux acquéreurs" : "nouvel acquéreur"}.{" "}
            {majuscule(total.visite ? `${total.visite} ${total.visite > 1 ? "ont" : "a"} visité` : "aucun n'a visité")},{" "}
            {total.offre ? `${total.offre} ${total.offre > 1 ? "ont" : "a"} fait une offre` : "aucun n'a fait d'offre"}.
          </p>
          <ul className="mt-3 space-y-3.5">
            {lignes.map((l) => (
              <li key={l.source ?? "-"}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className={cx("truncate font-medium", !l.source && "text-muted")}>{l.source ? SOURCE[l.source] : "Origine non renseignée"}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{l.contacts}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand to-coral" style={{ width: `${(l.contacts / max) * 100}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted">{suite(l)}</div>
              </li>
            ))}
          </ul>
          {lignes.some((l) => !l.source) && <p className="mt-3 text-xs text-muted">L&apos;origine se choisit sur la fiche du contact.</p>}
        </>
      )}
    </Card>
  );
}
