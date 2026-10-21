"use client";

/* Saisie d'un immeuble lot par lot, pensée pour aller vite au téléphone :
   ajout d'un lot en un geste, duplication d'un lot voisin, champs
   adaptés au type (logement, local d'activité, parking, cave). */

import { Copy, Plus, Trash2 } from "lucide-react";
import { Field, cx } from "@/components/ui";
import { CONDITIONS } from "@/lib/expressEstimate";
import type { ClasseDpe, EtatBien } from "@/lib/types";
import { Choix, Interrupteur, Nombre } from "./controls";
import { DPE_CLASSES } from "./shared";
import { FORFAIT, TAUX_ACTIVITE, TYPES_LOT, loyersAnnuels, nouveauLot, resumeLots, surfaceTotale, type LotImmeuble, type ParamsImmeuble, type TypeLot } from "./immeuble";

const AJOUTS: { type: TypeLot; label: string }[] = [
  { type: "logement", label: "Logement" },
  { type: "commerce", label: "Commerce" },
  { type: "bureau", label: "Bureau" },
  { type: "parking", label: "Parking" },
  { type: "cave", label: "Cave" },
];

/** « Lot 3 » → « Lot 4 » ; sinon numéro suivant. */
function nomSuivant(lots: LotImmeuble[]) {
  const nums = lots.map((l) => Number(l.nom.match(/(\d+)\s*$/)?.[1])).filter((n) => Number.isFinite(n));
  return (nums.length ? Math.max(...nums) : lots.length) + 1;
}

export function LotsEditor({ lots, onChange }: { lots: LotImmeuble[]; onChange: (lots: LotImmeuble[]) => void }) {
  const maj = (id: string, p: Partial<LotImmeuble>) => onChange(lots.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const ajouter = (type: TypeLot) => onChange([...lots, nouveauLot(nomSuivant(lots), type)]);
  const dupliquer = (l: LotImmeuble) => {
    const i = lots.findIndex((x) => x.id === l.id);
    const copie = { ...l, id: nouveauLot(0).id, nom: `Lot ${nomSuivant(lots)}`, valeur: undefined };
    onChange([...lots.slice(0, i + 1), copie, ...lots.slice(i + 1)]);
  };
  const loyers = loyersAnnuels(lots) / 12;

  return (
    <div className="space-y-3">
      {lots.map((l, i) => (
        <LotCarte key={l.id} l={l} rang={i + 1} maj={(p) => maj(l.id, p)} dupliquer={() => dupliquer(l)} supprimer={() => onChange(lots.filter((x) => x.id !== l.id))} />
      ))}

      <div>
        <span className="label">Ajouter un lot</span>
        <div className="flex flex-wrap gap-1.5">
          {AJOUTS.map((a) => (
            <button key={a.type} type="button" className="btn-secondary btn-sm !h-10" onClick={() => ajouter(a.type)}>
              <Plus size={14} /> {a.label}
            </button>
          ))}
        </div>
      </div>

      {lots.length > 0 && (
        <p className="rounded-xl bg-surface-2/70 px-3 py-2 text-xs text-muted">
          {lots.length} lot{lots.length > 1 ? "s" : ""} : {resumeLots(lots)}
          {surfaceTotale(lots) ? ` · ${Math.round(surfaceTotale(lots)).toLocaleString("fr-FR")} m²` : ""}
          {loyers ? ` · loyers ${Math.round(loyers).toLocaleString("fr-FR")} € HC/mois` : ""}
        </p>
      )}
    </div>
  );
}

function LotCarte({ l, rang, maj, dupliquer, supprimer }: { l: LotImmeuble; rang: number; maj: (p: Partial<LotImmeuble>) => void; dupliquer: () => void; supprimer: () => void }) {
  const habitable = l.type === "logement";
  const activite = l.type === "commerce" || l.type === "bureau";
  const annexe = l.type === "parking" || l.type === "cave" || l.type === "autre";
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/10 text-[11px] font-bold text-accent tabular-nums">{rang}</span>
        <input className="input !h-10 min-w-0 flex-1" value={l.nom} onChange={(e) => maj({ nom: e.target.value })} aria-label="Nom du lot" placeholder="Lot 1, T2 1er gauche…" />
        <button type="button" className="btn-ghost btn-sm !h-10 !px-2" onClick={dupliquer} aria-label="Dupliquer le lot" title="Dupliquer">
          <Copy size={15} />
        </button>
        <button type="button" className="btn-ghost btn-sm !h-10 !px-2 text-danger" onClick={supprimer} aria-label="Supprimer le lot" title="Supprimer">
          <Trash2 size={15} />
        </button>
      </div>

      <select
        className="input mt-2 !h-10"
        value={l.type}
        onChange={(e) => maj({ type: e.target.value as TypeLot, loue: e.target.value === "logement" ? (l.loue ?? true) : l.loue })}
        aria-label="Type de lot"
      >
        {TYPES_LOT.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {(habitable || activite || l.type === "parking") && (
          <Field label="Surface">
            <Nombre value={l.surface} onChange={(v) => maj({ surface: v })} unit="m²" decimal placeholder={habitable ? "45" : ""} />
          </Field>
        )}
        {habitable && (
          <Field label="Pièces">
            <Nombre value={l.pieces} onChange={(v) => maj({ pieces: v })} placeholder="2" />
          </Field>
        )}
        {(habitable || activite) && (
          <Field label="Étage">
            <Nombre value={l.etage} onChange={(v) => maj({ etage: v })} placeholder="0 = RDC" />
          </Field>
        )}
        {annexe && (
          <Field label="Valeur" className={l.type === "parking" ? "col-span-2" : "col-span-3"}>
            <Nombre value={l.valeur} onChange={(v) => maj({ valeur: v })} unit="€" placeholder={FORFAIT[l.type] ? FORFAIT[l.type]!.toLocaleString("fr-FR") : ""} />
          </Field>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[auto_1fr] items-end gap-2">
        <div>
          <span className="label">Occupation</span>
          <div className="flex rounded-xl border border-line p-0.5">
            {[
              { v: true, t: "Loué" },
              { v: false, t: "Vide" },
            ].map((o) => (
              <button
                key={o.t}
                type="button"
                onClick={() => maj({ loue: o.v })}
                className={cx("h-9 rounded-lg px-3 text-xs font-medium transition", !!l.loue === o.v ? "bg-accent text-white dark:text-bg" : "text-muted hover:text-fg")}
              >
                {o.t}
              </button>
            ))}
          </div>
        </div>
        <Field label={l.loue ? "Loyer HC / mois" : "Loyer de marché HC"}>
          <Nombre value={l.loyer} onChange={(v) => maj({ loyer: v })} unit="€" decimal placeholder={l.loue ? "" : "facultatif"} />
        </Field>
      </div>

      {habitable && (
        <div className="mt-2">
          <span className="label">DPE du logement</span>
          <div className="flex flex-wrap gap-1">
            {DPE_CLASSES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => maj({ dpe: l.dpe === d ? undefined : (d as ClasseDpe) })}
                className={cx(
                  "h-8 w-8 rounded-lg border text-xs font-bold transition",
                  l.dpe === d ? "border-accent bg-accent text-white dark:text-bg" : "border-line bg-surface text-muted hover:bg-surface-2",
                )}
                aria-pressed={l.dpe === d}
              >
                {d}
              </button>
            ))}
          </div>
          {l.loue && l.dpe === "G" && <p className="mt-1 text-[11px] text-warn">Classé G : ce logement ne peut plus faire l&apos;objet d&apos;un nouveau bail depuis 2025.</p>}
        </div>
      )}
      {activite && !l.valeur && <p className="mt-2 text-[11px] text-muted">Valorisé par son loyer capitalisé à {(TAUX_ACTIVITE[l.type]! * 100).toLocaleString("fr-FR")} %.</p>}
    </div>
  );
}

/** Caractéristiques de l'immeuble entier. */
export function ImmeubleEditor({ p, onChange, etat, onEtat }: { p: ParamsImmeuble; onChange: (p: Partial<ParamsImmeuble>) => void; etat?: EtatBien; onEtat: (e: EtatBien) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <span className="label">État général de l&apos;immeuble</span>
        <Choix value={etat} onChange={(v) => onEtat(v ?? "bon")} options={CONDITIONS.map((c) => ({ value: c.id, label: c.label }))} />
      </div>
      <Interrupteur checked={!!p.ascenseur} onChange={(v) => onChange({ ascenseur: v })} label="Ascenseur" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Travaux à prévoir" hint="Toiture, façade, réseaux…">
          <Nombre value={p.travaux} onChange={(v) => onChange({ travaux: v })} unit="€" placeholder="0" />
        </Field>
        <Field label="Charges propriétaire" hint="Taxe foncière, assurance, entretien par an">
          <Nombre value={p.chargesAnnuelles} onChange={(v) => onChange({ chargesAnnuelles: v })} unit="€/an" decimal />
        </Field>
      </div>
    </div>
  );
}
