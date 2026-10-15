"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Mail, Send, UserRound } from "lucide-react";
import { Badge, Field, cx } from "@/components/ui";
import { PickChip } from "@/components/contacts/bits";
import { nomComplet } from "@/lib/format";
import { CHAMPS, manquants, type Champ, type Partie } from "@/components/offre/offre";

/* Parties d'un acte (offre, mandat) : étapes, ce qui manque, saisie de l'état civil. */

export function EtapeBtn({ n, actif, fait, disabled, onClick, children }: { n: number; actif: boolean; fait?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx("flex h-12 items-center gap-2.5 rounded-2xl border px-3 text-sm font-medium transition disabled:opacity-50", actif ? "border-accent bg-accent/5 text-accent" : "border-line bg-surface text-muted")}
    >
      <span className={cx("grid size-6 place-items-center rounded-full text-xs font-semibold", actif ? "bg-brand text-white" : fait ? "bg-ok/15 text-ok" : "bg-surface-2")}>{fait ? <Check size={13} /> : n}</span>
      {children}
    </button>
  );
}

/** Ce qui manque pour chaque personne, avec le bouton « Demander ». */
export function Etat({ parties, onDemande, champs = CHAMPS }: { parties: Partie[]; onDemande: (p: Partie) => void; champs?: Champ[] }) {
  if (!parties.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {parties.map((p) => {
        const m = manquants(p, champs);
        return (
          <li key={p.contactId} className="rounded-xl bg-surface-2/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{nomComplet(p)}</span>
              {m.length ? (
                <button className="btn-secondary btn-sm !h-9 shrink-0" onClick={() => onDemande(p)}>
                  <Mail size={14} /> Demander
                </button>
              ) : (
                <Badge tone="ok">
                  <Check size={12} /> Complet
                </Badge>
              )}
            </div>
            {m.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {m.map((x) => (
                  <span key={x.key} className="chip !h-6 !border-warn/30 !text-warn !bg-warn/5">
                    {x.label}
                  </span>
                ))}
                <span className="chip !h-6">Pièce d&apos;identité</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** État civil et coordonnées de signature d'une partie. */
export function PartieForm({ titre, p, onChange, champs = CHAMPS }: { titre: string; p: Partie; onChange: (x: Partial<Partie>) => void; champs?: Champ[] }) {
  const m = manquants(p, champs);
  const avecProfession = champs.some((c) => c.key === "profession");
  const [open, setOpen] = useState(m.length > 0);
  return (
    <section className="card">
      <button className="flex w-full items-center gap-3 px-4 sm:px-5 py-4 text-left" onClick={() => setOpen(!open)}>
        <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted">
          <UserRound size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{titre}</span>
          <span className="block font-medium truncate">{nomComplet(p)}</span>
        </span>
        {m.length ? <Badge tone="warn">{m.length} à compléter</Badge> : <Badge tone="ok">Complet</Badge>}
        <ChevronDown size={16} className={cx("text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 space-y-3 animate-fade-up">
          <div className="flex gap-2">
            {(["Mme", "M."] as const).map((c) => (
              <PickChip key={c} active={p.civilite === c} onClick={() => onChange({ civilite: c })}>
                {c === "Mme" ? "Madame" : "Monsieur"}
              </PickChip>
            ))}
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Prénom">
              <input className="input" value={p.prenom ?? ""} onChange={(e) => onChange({ prenom: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Nom">
              <input className="input" value={p.nom ?? ""} onChange={(e) => onChange({ nom: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Date de naissance">
              <input type="date" className="input" value={p.dateNaissance ?? ""} onChange={(e) => onChange({ dateNaissance: e.target.value })} />
            </Field>
            <Field label="Lieu de naissance">
              <input className="input" value={p.lieuNaissance ?? ""} onChange={(e) => onChange({ lieuNaissance: e.target.value })} placeholder="Ville (dépt)" />
            </Field>
          </div>
          {avecProfession && (
            <Field label="Profession">
              <input className="input" value={p.profession ?? ""} onChange={(e) => onChange({ profession: e.target.value })} />
            </Field>
          )}
          <Field label="Adresse (lieu de résidence)">
            <input className="input" value={p.adresse ?? ""} onChange={(e) => onChange({ adresse: e.target.value })} placeholder="N°, rue, code postal, ville" />
          </Field>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="E-mail (signature)">
              <input className="input" inputMode="email" value={p.email ?? ""} onChange={(e) => onChange({ email: e.target.value })} />
            </Field>
            <Field label="Portable (signature)">
              <input className="input" inputMode="tel" value={p.tel ?? ""} onChange={(e) => onChange({ tel: e.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted inline-flex items-center gap-1.5">
            <Send size={11} /> Enregistré aussi dans la fiche contact. {champs.length - m.length}/{champs.length} renseignés.
          </p>
        </div>
      )}
    </section>
  );
}

