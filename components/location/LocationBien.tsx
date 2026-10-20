"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, ClipboardList, KeyRound, Pencil, ShieldCheck } from "lucide-react";
import { Badge, Card, Field, Sheet } from "@/components/ui";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip } from "@/components/contacts/bits";
import { STATUT_LOCATION, locationDe, type BienLocation, type InfosLocation, type StatutLocation } from "./bienLocation";
import { dateActe } from "./loi";
import { update, useCollection } from "@/lib/store";
import { eur, nomComplet } from "@/lib/format";
import type { Bien } from "@/lib/types";

/* ============================================================
   Bloc « Location » de la fiche d'un bien : statut locatif, loyer,
   locataires, gestion, et les documents de location à rédiger.
   ============================================================ */

export function LocationBien({ b }: { b: Bien }) {
  const loc = locationDe(b);
  const { items: contacts } = useCollection("contacts");
  const [edit, setEdit] = useState<InfosLocation | null>(null);
  const [retirer, setRetirer] = useState(false);

  const enregistrer = (l: InfosLocation | undefined) => update("biens", b.id, { location: l } as Partial<BienLocation>);
  const locataires = (loc?.locataireIds ?? []).map((id) => contacts.find((c) => c.id === id)).filter(Boolean) as typeof contacts;

  const actions = (
    <div className="grid grid-cols-2 gap-2">
      <Link href={`/biens/${b.id}/candidat`} className="btn-secondary !h-11 !justify-start">
        <ClipboardList size={16} /> Fiche candidat
      </Link>
      <Link href={`/biens/${b.id}/bail`} className="btn-secondary !h-11 !justify-start">
        <KeyRound size={16} /> Bail
      </Link>
      <Link href={`/biens/${b.id}/caution`} className="btn-secondary !h-11 !justify-start">
        <ShieldCheck size={16} /> Caution
      </Link>
      <Link href={`/biens/${b.id}/gestion`} className="btn-secondary !h-11 !justify-start">
        <Building2 size={16} /> Gestion
      </Link>
    </div>
  );

  if (!loc)
    return (
      <Card title="Location">
        <p className="text-sm text-muted">Ce bien n&apos;est pas en location. Mettez-le en location pour le retrouver dans l&apos;onglet « Location » des biens.</p>
        <button className="btn-primary mt-3 w-full !h-11" onClick={() => enregistrer({ statut: "a_louer" })}>
          <KeyRound size={16} /> Mettre en location
        </button>
        <div className="mt-3">{actions}</div>
      </Card>
    );

  const st = STATUT_LOCATION[loc.statut];
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          Location <Badge tone={st.tone}>{st.label}</Badge>
        </span>
      }
      action={
        <button className="btn-ghost btn-sm" onClick={() => setEdit({ ...loc })}>
          <Pencil size={14} /> Modifier
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <Chiffre label="Loyer HC" value={loc.loyer ? eur(loc.loyer) : "—"} />
        <Chiffre label="Charges" value={loc.charges != null ? eur(loc.charges) : "—"} />
        <Chiffre label="Dépôt" value={loc.depot ? eur(loc.depot) : "—"} />
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Ligne label="Type">{loc.meuble ? "Meublé" : "Vide"}</Ligne>
        {loc.debut && <Ligne label="Bail depuis le">{dateActe(loc.debut, { majuscule: false })}</Ligne>}
        <Ligne label="Locataire(s)">
          {locataires.length
            ? locataires.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link href={`/contacts/${c.id}`} className="font-medium text-accent">
                    {nomComplet(c)}
                  </Link>
                </span>
              ))
            : "—"}
        </Ligne>
        <Ligne label="Gestion">{loc.gestion ? `Mandat${loc.gestion.numero ? ` n° ${loc.gestion.numero}` : ""}${loc.gestion.debut ? ` du ${dateActe(loc.gestion.debut, { majuscule: false })}` : ""}` : "Non confiée à l'agence"}</Ligne>
      </dl>
      <div className="mt-4">{actions}</div>

      {edit && (
        <Sheet
          open
          onClose={() => setEdit(null)}
          title="Location"
          footer={
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button className="btn-ghost text-danger" onClick={() => { setEdit(null); setRetirer(true); }}>
                Retirer de la location
              </button>
              <button className="btn-primary" onClick={() => { enregistrer(edit); setEdit(null); }}>
                Enregistrer
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <span className="label">Statut</span>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(STATUT_LOCATION) as StatutLocation[]).map((s) => (
                  <PickChip key={s} active={edit.statut === s} onClick={() => setEdit({ ...edit, statut: s })}>
                    {STATUT_LOCATION[s].label}
                  </PickChip>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <PickChip active={!edit.meuble} onClick={() => setEdit({ ...edit, meuble: false })}>
                Vide
              </PickChip>
              <PickChip active={!!edit.meuble} onClick={() => setEdit({ ...edit, meuble: true })}>
                Meublé
              </PickChip>
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="Loyer hors charges">
                <NumInput value={edit.loyer} onChange={(v) => setEdit({ ...edit, loyer: v })} suffix="€" />
              </Field>
              <Field label="Charges par mois">
                <NumInput value={edit.charges} onChange={(v) => setEdit({ ...edit, charges: v })} suffix="€" />
              </Field>
              <Field label="Dépôt de garantie">
                <NumInput value={edit.depot} onChange={(v) => setEdit({ ...edit, depot: v })} suffix="€" />
              </Field>
              <Field label="Début du bail">
                <input type="date" className="input" value={edit.debut ?? ""} onChange={(e) => setEdit({ ...edit, debut: e.target.value || undefined })} />
              </Field>
            </div>
            <p className="text-xs text-muted">Un bail ou un mandat de gestion marqué « signé » dans « Documents » remplit ces informations tout seul.</p>
          </div>
        </Sheet>
      )}

      {retirer && (
        <Sheet
          open
          onClose={() => setRetirer(false)}
          title="Retirer de la location ?"
          footer={
            <div className="flex w-full justify-end gap-2">
              <button className="btn-secondary" onClick={() => setRetirer(false)}>
                Annuler
              </button>
              <button className="btn-primary" onClick={() => { enregistrer(undefined); setRetirer(false); }}>
                Retirer
              </button>
            </div>
          }
        >
          <p className="text-sm">Le bien quitte l&apos;onglet « Location ». Les baux et mandats déjà rédigés restent dans « Documents ».</p>
        </Sheet>
      )}
    </Card>
  );
}

function Chiffre({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
