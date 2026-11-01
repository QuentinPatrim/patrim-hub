"use client";

/* Dossier de relocation d'un logement : les 10 étapes de l'agence,
   du préavis à la restitution du dépôt de garantie. */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Check, ChevronDown, ClipboardCopy, FileText, Lock, Phone, Plus, Trash2, Unlock, Wallet } from "lucide-react";
import { Badge, Empty, Field, PageHeader, cx } from "@/components/ui";
import { Toggle } from "@/components/contacts/bits";
import { update, useCollection, useDoc } from "@/lib/store";
import { eur, today } from "@/lib/format";
import { locationDe } from "@/components/location/bienLocation";
import {
  ETAPES,
  GARANTIES,
  PUBS,
  dateSortie,
  echeanceCaution,
  etapesFaites,
  jourJ,
  patchRelocation,
  relocationDe,
  situation,
  totalRetenues,
  type EtapeId,
  type Relocation,
} from "@/components/relocation/relocation";
import { FicheIcs, FicheImmoaccess, LettreCaution, bailDuBien } from "@/components/relocation/Fiches";
import type { Bien } from "@/lib/types";

export default function DossierRelocation() {
  const { id } = useParams<{ id: string }>();
  const { doc: b } = useDoc("biens", id);
  const { items: rdvs } = useCollection("rdvs");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="skeleton h-56 !rounded-3xl" />;
  if (!b) return <Empty title="Logement introuvable" action={<Link className="btn-primary" href="/gestion">Retour à la gestion</Link>} />;
  const r = relocationDe(b);
  if (!r)
    return (
      <div className="space-y-4">
        <PageHeader back={`/biens/${b.id}`} title={b.titre || b.adresse} subtitle="Pas de dossier de relocation pour ce logement." />
        <button className="btn-primary w-full !h-11" onClick={() => update("biens", b.id, patchRelocation(b, { ouverte: today() }, { statut: "preavis" }))}>
          <Plus size={16} /> Ouvrir un dossier de relocation
        </button>
      </div>
    );
  return <Dossier key={b.id} b={b} r={r} rdvs={rdvs} />;
}

function Dossier({ b, r, rdvs }: { b: Bien; r: Relocation; rdvs: Parameters<typeof etapesFaites>[2] }) {
  const auj = today();
  const [d, setD] = useState<Relocation>(r);
  const [ouverte, setOuverte] = useState<EtapeId | null>(null);
  const [fiche, setFiche] = useState<"ics" | "immo" | "lettre" | null>(null);
  useEffect(() => setD(r), [r]);

  const enregistrer = (x: Relocation, extra?: Parameters<typeof patchRelocation>[2]) => update("biens", b.id, patchRelocation(b, x, extra));
  /** Modifie le brouillon ; `sauver` enregistre tout de suite (listes, cases, dates). Les textes s'enregistrent en quittant le champ. */
  const set = (p: Partial<Relocation>, sauver = true) => {
    const x = { ...d, ...p };
    setD(x);
    if (sauver) enregistrer(x);
  };
  const quitter = () => enregistrer(d);

  const faites = etapesFaites(b, d, rdvs, auj);
  const s = situation(d, auj);
  const loyer = locationDe(b)?.loyer;
  const ech = echeanceCaution(d, loyer, auj);
  const cocher = (e: EtapeId) => {
    const etapes = { ...(d.etapes ?? {}) };
    if (etapes[e]) delete etapes[e];
    else etapes[e] = auj;
    set({ etapes });
  };
  const auto = (e: EtapeId) => faites.has(e) && !d.etapes?.[e];

  const contenu: Record<EtapeId, ReactNode> = {
    preavis: (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lettre reçue le">
            <input
              type="date"
              className="input"
              value={d.preavis?.recuLe ?? ""}
              onChange={(e) => {
                const recuLe = e.target.value || undefined;
                set({ preavis: { ...d.preavis, recuLe }, sortie: recuLe ? dateSortie(recuLe, d.preavis?.duree ?? 1) : d.sortie });
              }}
            />
          </Field>
          <Field label="Préavis">
            <select
              className="input"
              value={d.preavis?.duree ?? 1}
              onChange={(e) => {
                const duree = +e.target.value as 1 | 3;
                set({ preavis: { ...d.preavis, duree }, sortie: d.preavis?.recuLe ? dateSortie(d.preavis.recuLe, duree) : d.sortie });
              }}
            >
              <option value={1}>1 mois</option>
              <option value={3}>3 mois</option>
            </select>
          </Field>
        </div>
        <Field label="Libre le (« Vacant le »)">
          <input type="date" className="input" value={d.sortie ?? ""} onChange={(e) => set({ sortie: e.target.value || undefined })} />
        </Field>
        <Toggle checked={!!d.vacant} onChange={(v) => set({ vacant: v || undefined }, true)} label="Le logement est déjà vide" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Locataire sortant">
            <input className="input" value={d.sortant?.nom ?? ""} onChange={(e) => set({ sortant: { ...d.sortant, nom: e.target.value } }, false)} onBlur={quitter} />
          </Field>
          <Field label="Téléphone">
            <input className="input" inputMode="tel" value={d.sortant?.tel ?? ""} onChange={(e) => set({ sortant: { ...d.sortant, tel: e.target.value } }, false)} onBlur={quitter} />
          </Field>
        </div>
        <Field label="E-mail du locataire sortant" hint="Utile pour la lettre de restitution du dépôt de garantie.">
          <input className="input" type="email" value={d.sortant?.email ?? ""} onChange={(e) => set({ sortant: { ...d.sortant, email: e.target.value } }, false)} onBlur={quitter} />
        </Field>
      </>
    ),
    diags: (
      <>
        <Toggle checked={!!d.dpeOk} onChange={(v) => set({ dpeOk: v })} label="DPE et diagnostics obligatoires à jour" hint="Sinon, on mandate le diagnostiqueur." />
        <Field label="Relance / intervention">
          <input className="input" value={d.relanceDpe ?? ""} onChange={(e) => set({ relanceDpe: e.target.value }, false)} onBlur={quitter} placeholder="Ex. intervention prévue le 03/11" />
        </Field>
        <Link href={`/biens/${b.id}/diagnostics`} className="btn-secondary btn-sm !h-10">
          Diagnostics du bien
        </Link>
      </>
    ),
    liste: <Toggle checked={!!d.gli} onChange={(v) => set({ gli: v })} label="Propriétaire assuré en GLI" />,
    pub: (
      <>
        <div className="flex flex-wrap gap-2">
          {PUBS.map((p) => (
            <button key={p.v} className={cx("chip !h-10", d.pub === p.v && "!bg-brand !text-white")} onClick={() => set({ pub: p.v })}>
              {p.label}
            </button>
          ))}
        </div>
        <Link href={`/biens/${b.id}/annonce`} className="btn-secondary btn-sm !h-10">
          Préparer l&apos;annonce à saisir dans ICS
        </Link>
      </>
    ),
    visites: (
      <>
        <Field label="Disponibilités pour les visites">
          <textarea className="input min-h-[64px]" value={d.disponibilites ?? ""} onChange={(e) => set({ disponibilites: e.target.value }, false)} onBlur={quitter} />
        </Field>
        <Field label="Prospects">
          <textarea className="input min-h-[80px]" value={d.prospects ?? ""} onChange={(e) => set({ prospects: e.target.value }, false)} onBlur={quitter} />
        </Field>
        {d.sortant?.tel && (
          <a href={`tel:${d.sortant.tel.split("/")[0].replace(/\s/g, "")}`} className="btn-secondary btn-sm !h-10">
            <Phone size={14} /> Prévenir le locataire en place
          </a>
        )}
      </>
    ),
    dossier: (
      <>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Garantie">
            <select className="input" value={d.dossier?.garantie ?? ""} onChange={(e) => set({ dossier: { ...d.dossier, garantie: (e.target.value || undefined) as never } })}>
              <option value="">À choisir</option>
              {GARANTIES.map((g) => (
                <option key={g.v} value={g.v}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Validé par">
            <input className="input" value={d.dossier?.par ?? ""} onChange={(e) => set({ dossier: { ...d.dossier, par: e.target.value } }, false)} onBlur={quitter} />
          </Field>
          <Field label="Dossier validé le">
            <input type="date" className="input" value={d.dossier?.valideLe ?? ""} onChange={(e) => set({ dossier: { ...d.dossier, valideLe: e.target.value || undefined } })} />
          </Field>
          <Field label="Saisi dans Immoaccess le">
            <input type="date" className="input" value={d.dossier?.immoaccess ?? ""} onChange={(e) => set({ dossier: { ...d.dossier, immoaccess: e.target.value || undefined } })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link href={`/biens/${b.id}/renseignements`} className="btn-secondary btn-sm !h-10">
            Renseignements
          </Link>
          <button className="btn-secondary btn-sm !h-10" onClick={() => setFiche("immo")}>
            <ClipboardCopy size={14} /> Fiche Immoaccess
          </button>
        </div>
      </>
    ),
    bail: (
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/biens/${b.id}/bail`} className="btn-secondary btn-sm !h-10">
          Bail
        </Link>
        <Link href={`/biens/${b.id}/caution`} className="btn-secondary btn-sm !h-10">
          Acte de cautionnement
        </Link>
        {bailDuBien(b) && <p className="col-span-2 text-[12px] text-muted">Un bail est rédigé dans le Hub : l&apos;étape se coche toute seule quand il passe en « Signé ».</p>}
      </div>
    ),
    edl: (
      <div className="grid grid-cols-2 gap-3">
        <Field label="EDL de sortie (EDLS)" hint="Remise des clés : départ du délai de restitution.">
          <input type="date" className="input" value={d.edls ?? ""} onChange={(e) => set({ edls: e.target.value || undefined })} />
        </Field>
        <Field label="EDL d'entrée (EDLE)">
          <input type="date" className="input" value={d.edle ?? ""} onChange={(e) => set({ edle: e.target.value || undefined })} />
        </Field>
        <p className="col-span-2 text-[12px] text-muted">Les états des lieux restent faits sur EDLV2. Pensez à ajouter les rendez-vous à l&apos;agenda.</p>
      </div>
    ),
    ics: (
      <>
        <button className="btn-secondary btn-sm !h-10" onClick={() => setFiche("ics")}>
          <ClipboardCopy size={14} /> Fiche à recopier dans ICS
        </button>
        <Field label="Enregistré dans ICS le">
          <input type="date" className="input" value={d.icsLe ?? ""} onChange={(e) => set({ icsLe: e.target.value || undefined })} />
        </Field>
      </>
    ),
    caution: <Caution d={d} set={set} quitter={quitter} ech={ech} onLettre={() => setFiche("lettre")} />,
  };

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        back="/gestion"
        title={b.titre || b.adresse}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={s.tone}>{s.label}</Badge>
            <span>{b.adresse}</span>
          </span>
        }
      />

      <div className="card card-pad space-y-3">
        <Field label="État (comme dans la liste loc)">
          <input className="input font-medium" value={d.etat ?? ""} onChange={(e) => set({ etat: e.target.value }, false)} onBlur={quitter} placeholder="Ex. PUB À FAIRE, VISITES 30/10, DOSSIER OK CLÉMENT…" />
        </Field>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="label">Propriétaire</div>
            <div>{d.proprietaire || "—"}</div>
          </div>
          <div>
            <div className="label">Loyer</div>
            <div>{loyer ? `${eur(loyer)} HC` : d.loyerListe ? `${eur(d.loyerListe)} (liste)` : "—"}</div>
          </div>
        </div>
        <Field label="Infos">
          <textarea className="input min-h-[56px]" value={d.infos ?? ""} onChange={(e) => set({ infos: e.target.value }, false)} onBlur={quitter} />
        </Field>
        <Link href={`/biens/${b.id}`} className="link text-sm">
          Fiche du bien
        </Link>
      </div>

      <ol className="space-y-2">
        {ETAPES.map((e, i) => {
          const fait = faites.has(e.id);
          const ouvert = ouverte === e.id;
          return (
            <li key={e.id} id={e.id} className={cx("card overflow-hidden", fait && "opacity-90")}>
              <div className="flex items-center gap-3 p-3">
                <button
                  onClick={() => cocher(e.id)}
                  disabled={auto(e.id)}
                  aria-label={fait ? "Décocher" : "Cocher"}
                  className={cx("grid size-10 shrink-0 place-items-center rounded-xl border text-sm font-semibold", fait ? "border-ok bg-ok text-white" : "border-line bg-surface-2 text-muted")}
                >
                  {fait ? <Check size={18} /> : i + 1}
                </button>
                <button className="min-w-0 flex-1 text-left" onClick={() => setOuverte(ouvert ? null : e.id)}>
                  <span className={cx("block text-sm font-semibold", fait && "text-muted")}>{e.label}</span>
                  <span className="block text-[12px] text-muted">{resume(e.id, d) ?? e.detail}</span>
                </button>
                <ChevronDown size={18} className={cx("shrink-0 text-muted transition", ouvert && "rotate-180")} onClick={() => setOuverte(ouvert ? null : e.id)} />
              </div>
              {ouvert && <div className="space-y-3 border-t border-line/60 p-3">{contenu[e.id]}</div>}
            </li>
          );
        })}
      </ol>

      {d.fermeeLe ? (
        <button className="btn-secondary w-full !h-11" onClick={() => set({ fermeeLe: undefined })}>
          <Unlock size={16} /> Rouvrir le dossier
        </button>
      ) : (
        <button className="btn-secondary w-full !h-11" onClick={() => enregistrer({ ...d, fermeeLe: auj }, bailDuBien(b) ? { statut: "loue" } : undefined)}>
          <Lock size={16} /> Fermer le dossier (logement reloué, caution rendue)
        </button>
      )}

      <FicheIcs b={b} open={fiche === "ics"} onClose={() => setFiche(null)} />
      <FicheImmoaccess b={b} open={fiche === "immo"} onClose={() => setFiche(null)} />
      <LettreCaution b={{ ...b, location: { ...locationDe(b), relocation: d } } as Bien} open={fiche === "lettre"} onClose={() => setFiche(null)} />
    </div>
  );
}

function resume(e: EtapeId, d: Relocation): string | undefined {
  if (e === "preavis") return d.vacant ? "Logement vide" : d.sortie ? `Libre le ${jourJ(d.sortie)}${d.sortant?.nom ? ` · ${d.sortant.nom}` : ""}` : undefined;
  if (e === "diags") return d.dpeOk ? "DPE ok" : d.relanceDpe || (d.dpeOk === false ? "DPE manquant" : undefined);
  if (e === "liste") return d.gli ? "GLI" : d.gli === false ? "Sans GLI" : undefined;
  if (e === "pub") return PUBS.find((p) => p.v === d.pub)?.label;
  if (e === "visites") return d.disponibilites || undefined;
  if (e === "dossier") return d.dossier?.valideLe ? [GARANTIES.find((g) => g.v === d.dossier?.garantie)?.label, d.dossier?.par && `validé par ${d.dossier.par}`].filter(Boolean).join(" · ") || "Dossier validé" : undefined;
  if (e === "edl") return [d.edls && `Sortie ${jourJ(d.edls)}`, d.edle && `Entrée ${jourJ(d.edle)}`].filter(Boolean).join(" · ") || undefined;
  if (e === "ics") return d.icsLe ? `Saisi le ${jourJ(d.icsLe)}` : undefined;
  if (e === "caution") return d.caution?.restitueLe ? `Restitué le ${jourJ(d.caution.restitueLe)}` : undefined;
}

function Caution({ d, set, quitter, ech, onLettre }: { d: Relocation; set: (p: Partial<Relocation>, sauver?: boolean) => void; quitter: () => void; ech: ReturnType<typeof echeanceCaution>; onLettre: () => void }) {
  const c = d.caution ?? {};
  const ret = c.retenues ?? [];
  const setC = (p: Partial<NonNullable<Relocation["caution"]>>, sauver = true) => set({ caution: { ...c, ...p } }, sauver);
  return (
    <>
      {!d.edls ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px]">Saisissez la date de l&apos;état des lieux de sortie (étape 8) : le délai légal de restitution part de la remise des clés.</p>
      ) : ech ? (
        <p className={cx("rounded-xl px-3 py-2 text-[13px]", ech.reste < 0 ? "bg-danger/10" : ech.reste <= 7 ? "bg-warn/10" : "bg-surface-2")}>
          <Wallet size={14} className="mr-1 inline" />À verser avant le <b>{jourJ(ech.limite)}</b> ({ech.mois} mois) :{" "}
          {ech.reste < 0 ? `${-ech.reste} jours de retard${ech.majoration ? `, majoration due ${eur(ech.majoration)}` : ""}.` : `encore ${ech.reste} jours.`}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dépôt de garantie versé">
          <input className="input" inputMode="decimal" value={c.montant ?? ""} onChange={(e) => setC({ montant: num(e.target.value) }, false)} onBlur={quitter} />
        </Field>
        <Field label="Restitué le">
          <input type="date" className="input" value={c.restitueLe ?? ""} onChange={(e) => setC({ restitueLe: e.target.value || undefined })} />
        </Field>
      </div>
      <Toggle checked={c.conforme === false} onChange={(v) => setC({ conforme: v ? false : true })} label="EDL de sortie non conforme (retenues)" hint="Le délai passe de 1 à 2 mois." />
      {(c.conforme === false || ret.length > 0) && (
        <div className="space-y-2">
          {ret.map((x, i) => (
            <div key={i} className="flex gap-2">
              <input className="input flex-1" value={x.libelle} placeholder="Motif (ex. nettoyage)" onChange={(e) => setC({ retenues: ret.map((y, j) => (j === i ? { ...y, libelle: e.target.value } : y)) }, false)} onBlur={quitter} />
              <input className="input w-24" inputMode="decimal" value={x.montant || ""} placeholder="€" onChange={(e) => setC({ retenues: ret.map((y, j) => (j === i ? { ...y, montant: num(e.target.value) ?? 0 } : y)) }, false)} onBlur={quitter} />
              <button className="btn-ghost !h-11 !w-11 !px-0" aria-label="Retirer" onClick={() => setC({ retenues: ret.filter((_, j) => j !== i) })}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button className="btn-ghost btn-sm" onClick={() => setC({ retenues: [...ret, { libelle: "", montant: 0 }] })}>
            <Plus size={14} /> Ajouter une retenue
          </button>
          {ret.length > 0 && (
            <p className="text-sm">
              Retenues : <b>{eur(totalRetenues(d))}</b>
              {c.montant ? (
                <>
                  {" "}
                  · à restituer : <b>{eur(Math.max(0, c.montant - totalRetenues(d)))}</b>
                </>
              ) : null}
            </p>
          )}
        </div>
      )}
      <button className="btn-secondary btn-sm !h-10" onClick={onLettre}>
        <FileText size={14} /> Lettre {ret.length ? "avec retenue" : "RAS"}
      </button>
    </>
  );
}

const num = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};
