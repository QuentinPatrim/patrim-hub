"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClipboardList, Link2, Mail, RotateCcw } from "lucide-react";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip, Toggle } from "@/components/contacts/bits";
import { ecrireFiche, effacerFiche, ficheInitiale, lireFiche, mailCandidat, premierMois, totalEntree, type FicheCandidat } from "@/components/candidat/candidat";
import { eurosCts } from "@/components/location/loi";
import { useDoc } from "@/lib/store";

/* ============================================================
   Fiche de renseignements pour les candidats locataires : on règle
   le logement et les sommes, puis on imprime la fiche (vierge pour le
   candidat) et on prépare le mail qui l'accompagne.
   ============================================================ */

export default function CandidatPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: b } = useDoc("biens", id);
  const [f, setF] = useState<FicheCandidat | null>(null);
  const [mail, setMail] = useState(false);
  const [waited, setWaited] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!b || init.current) return;
    init.current = true;
    setF(lireFiche(b.id) ?? ficheInitiale(b));
  }, [b]);
  useEffect(() => {
    if (f) ecrireFiche(f);
  }, [f]);

  if (!b || !f) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const set = (patch: Partial<FicheCandidat>) => setF((x) => (x ? { ...x, ...patch } : x));
  const pm = premierMois(f);

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Fiche de renseignements" subtitle={b.titre} />
      <p className="text-sm text-muted animate-fade-up">
        La fiche part vierge : c&apos;est le candidat qui la remplit. Elle rappelle le logement, les sommes à prévoir et les pièces à fournir.
      </p>
      <Link href={`/biens/${b.id}/renseignements?nouveau=1`} className="card card-pad card-hover flex items-center gap-3 animate-fade-up">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
          <Link2 size={18} />
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-semibold">Plus simple : la fiche à remplir en ligne</span>
          <span className="block text-muted">Un lien par SMS ou mail, rempli sur téléphone, qui prépare le bail et la caution.</span>
        </span>
      </Link>

      <Card title="Le logement">
        <div className="space-y-3">
          <Field label="Désignation">
            <input className="input" value={f.logement} onChange={(e) => set({ logement: e.target.value })} />
          </Field>
          <div className="flex gap-2">
            <PickChip active={!f.meuble} onClick={() => set({ meuble: false })}>
              Location vide
            </PickChip>
            <PickChip active={f.meuble} onClick={() => set({ meuble: true })}>
              Location meublée
            </PickChip>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Loyer hors charges">
              <NumInput value={f.loyer} onChange={(v) => set({ loyer: v })} suffix="€" />
            </Field>
            <Field label="Charges par mois">
              <NumInput value={f.charges} onChange={(v) => set({ charges: v })} suffix="€" />
            </Field>
            <Field label="Dépôt de garantie">
              <NumInput value={f.depot} onChange={(v) => set({ depot: v })} suffix="€" />
            </Field>
            <Field label="Honoraires locataire">
              <NumInput value={f.honoraires} onChange={(v) => set({ honoraires: v })} suffix="€" />
            </Field>
            <Field label="Entrée dans les lieux">
              <input type="date" className="input" value={f.entree ?? ""} onChange={(e) => set({ entree: e.target.value || undefined })} />
            </Field>
          </div>
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            {pm && (
              <div className="flex justify-between gap-3">
                <span className="text-muted">
                  Premier mois ({pm.restants} jours sur {pm.jours})
                </span>
                <span>{eurosCts(pm.montant)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <span className="text-muted">À régler à l&apos;entrée</span>
              <span className="font-semibold">{eurosCts(totalEntree(f))}</span>
            </div>
            <p className="mt-1 text-xs text-muted">Dépôt, honoraires et loyer charges comprises du premier mois au prorata.</p>
          </div>
        </div>
      </Card>

      <Card title="Colonnes de la fiche">
        <Toggle checked={f.coloc} onChange={(v) => set({ coloc: v })} label="Colonne « Conjoint ou colocataire »" />
        <div className="mt-2">
          <span className="label">Garants</span>
          <div className="flex gap-2">
            {([0, 1, 2] as const).map((n) => (
              <PickChip key={n} active={f.garants === n} onClick={() => set({ garants: n })}>
                {n === 0 ? "Aucun" : n === 1 ? "Un garant" : "Deux garants"}
              </PickChip>
            ))}
          </div>
        </div>
      </Card>

      <div className="card card-pad space-y-2">
        <Link href={`/imprimer/candidat/${b.id}`} className="btn-primary w-full !h-12">
          <ClipboardList size={17} /> Voir la fiche et créer le PDF
        </Link>
        <button className="btn-secondary w-full !h-11" onClick={() => setMail(true)}>
          <Mail size={16} /> Préparer le mail au candidat
        </button>
        <p className="text-center text-xs text-muted">Pense à joindre la fiche et le RIB de l&apos;agence au mail.</p>
        <button className="btn-ghost btn-sm w-full text-muted" onClick={() => { effacerFiche(b.id); setF(ficheInitiale(b)); }}>
          <RotateCcw size={13} /> Reprendre les montants du bail
        </button>
      </div>

      {mail && <BrouillonMail open onClose={() => setMail(false)} titre="Mail au candidat" {...mailCandidat(f)} />}
    </div>
  );
}
