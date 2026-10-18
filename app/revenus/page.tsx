"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, FileSpreadsheet, Lock, Plus, Settings2, Wallet } from "lucide-react";
import { Card, Empty, PageHeader } from "@/components/ui";
import { AnneeCard, GraphiqueCard, HistoriqueCard, ObjectifCard, ReperesCard, VentesCard } from "@/components/revenus/Cartes";
import { FicheContrat, FicheVente, PointerMois, RepriseExcel } from "@/components/revenus/Fenetres";
import { useRevenus } from "@/components/revenus/stockage";
import { majuscule, moisAPointer, moisDe, nomMois, type VenteRevenu } from "@/components/revenus/revenus";
import { useMoi } from "@/lib/equipe";
import { today } from "@/lib/format";

/* « Mes revenus » : fixe et commissions du conseiller titulaire, mois par mois.
   Personnel : réservé à son compte (règles de la base) et jamais affiché à l'équipe. */

export default function MesRevenus() {
  const moi = useMoi();
  const d = useRevenus();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [pointer, setPointer] = useState<string | null>(null);
  const [vente, setVente] = useState<VenteRevenu | "nouvelle" | null>(null);
  const [contrat, setContrat] = useState(false);
  const [reprise, setReprise] = useState(false);

  const auj = today();
  const aPointer = moisAPointer(d, auj) ?? moisDe(auj);
  const vide = !d.ventes.length && !d.mois.length && !d.contrat.periodes.length;

  if (ready && moi.role !== "titulaire")
    return (
      <div>
        <PageHeader title="Mes revenus" back="/chiffres" />
        <div className="card">
          <Empty icon={<Lock size={22} />} title="Page personnelle" text="Cette page est réservée au titulaire de l'appli." />
        </div>
      </div>
    );

  const fenetres = (
    <>
      <PointerMois mois={pointer} d={d} auj={auj} onClose={() => setPointer(null)} onVente={() => setVente("nouvelle")} />
      <FicheVente vente={vente} d={d} auj={auj} onClose={() => setVente(null)} />
      <FicheContrat open={contrat} d={d} auj={auj} onClose={() => setContrat(false)} />
      <RepriseExcel open={reprise} d={d} prenom={moi.prenom} onClose={() => setReprise(false)} />
    </>
  );

  return (
    <div>
      <PageHeader
        title="Mes revenus"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} /> Visible seulement sur ton compte.
          </span>
        }
        back="/chiffres"
        actions={
          !vide && (
            <>
              <button className="btn-primary" onClick={() => setPointer(aPointer)}>
                <CalendarCheck size={17} /> Pointer {nomMois(aPointer, false)}
              </button>
              <button className="btn-secondary" onClick={() => setVente("nouvelle")}>
                <Plus size={17} /> Vente
              </button>
            </>
          )
        }
      />

      {!ready || !d.pret ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-40 rounded-2xl" />
          ))}
        </div>
      ) : vide ? (
        <div className="card">
          <Empty
            icon={<Wallet size={22} />}
            title="Tes revenus, mois par mois"
            text="Reprends ton fichier Excel des commissions : toutes tes ventes passées arrivent d'un coup, sans rien retaper. Ensuite, tu pointes chaque mois en quelques secondes."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <button className="btn-primary" onClick={() => setReprise(true)}>
                  <FileSpreadsheet size={17} /> Reprendre mon Excel
                </button>
                <button className="btn-secondary" onClick={() => setContrat(true)}>
                  <Settings2 size={17} /> Mon contrat
                </button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          {!d.contrat.periodes.length && (
            <Card>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">
                  <b>Ajoute ton fixe.</b> <span className="text-muted">Deux lignes suffisent (alternance, puis CDI) : il se reporte sur chaque mois depuis le début de ton contrat.</span>
                </p>
                <button className="btn-primary shrink-0" onClick={() => setContrat(true)}>
                  <Settings2 size={17} /> Mon contrat
                </button>
              </div>
            </Card>
          )}
          {moisAPointer(d, auj) && (
            <button onClick={() => setPointer(aPointer)} className="card flex w-full items-center gap-3 p-4 text-left transition hover:bg-surface-2 sm:p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
                <CalendarCheck size={18} />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <b>{majuscule(nomMois(aPointer))} est terminé.</b> <span className="text-muted">Pointe-le avec ta fiche de paie : fixe, primes, et ce qui a été versé.</span>
              </span>
            </button>
          )}
          <AnneeCard d={d} auj={auj} />
          <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
            <ObjectifCard d={d} auj={auj} onContrat={() => setContrat(true)} />
            <GraphiqueCard d={d} auj={auj} />
          </div>
          <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
            <VentesCard d={d} auj={auj} onOuvrir={setVente} onAjouter={() => setVente("nouvelle")} />
            <ReperesCard d={d} auj={auj} />
          </div>
          <HistoriqueCard d={d} auj={auj} onPointer={setPointer} />
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setContrat(true)}>
              <Settings2 size={15} /> Mon contrat
            </button>
            <button className="btn-secondary btn-sm" onClick={() => setReprise(true)}>
              <FileSpreadsheet size={15} /> Mettre à jour depuis l&apos;Excel
            </button>
          </div>
          <p className="px-1 text-xs leading-relaxed text-muted">
            Montants en {d.contrat.base}. Une commission compte le mois de l&apos;acte définitif, à {Math.round(d.contrat.taux * 100)}&nbsp;% des honoraires HT, partagée s&apos;il y a plusieurs commerciaux. Le fixe vient des périodes de ton contrat, sauf pour les mois pointés, qui reprennent ta fiche de paie. Julien et Clément ne voient jamais cette page ni ces chiffres.
          </p>
        </div>
      )}
      {fenetres}
    </div>
  );
}
