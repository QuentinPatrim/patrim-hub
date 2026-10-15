"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Eye, FileSignature, FileText, Pencil, Trash2 } from "lucide-react";
import { Badge, Card, Empty, Sheet } from "@/components/ui";
import { STATUT_BIEN, dateCourte } from "@/lib/format";
import type { BienStatut } from "@/lib/types";
import { ecrireOffre } from "@/components/offre/offre";
import { ecrireMandat } from "@/components/mandat/mandat";
import { STATUTS_ACTE, changerStatutActe, lienActe, resumeActe, statutActe, supprimerActe, titreActe, type Acte, type BienActes } from "./archive";

/** Carte « Documents » de la fiche du bien : offres d'achat et mandats rédigés, avec leur statut. */
export function DocumentsBien({ bien }: { bien: BienActes }) {
  const router = useRouter();
  const actes = [...(bien.actes ?? [])].sort((a, b) => b.maj.localeCompare(a.maj));
  const [choix, setChoix] = useState<Acte | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const modifier = (a: Acte) => {
    if (a.kind === "offre") ecrireOffre(a.data);
    else ecrireMandat(a.data);
    router.push(`/biens/${bien.id}/${a.kind}`);
  };
  const changer = (a: Acte, v: Acte["statut"]) => {
    const nouveau: BienStatut | undefined = changerStatutActe(bien.id, a.id, v);
    setChoix(null);
    setInfo(nouveau ? `Le bien passe en « ${STATUT_BIEN[nouveau].label} ».` : null);
  };

  return (
    <Card title={`Documents${actes.length ? ` (${actes.length})` : ""}`} pad={false}>
      {info && <p className="mx-4 sm:mx-5 mt-3 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">{info}</p>}
      {!actes.length ? (
        <Empty
          title="Aucun document pour l'instant"
          text="Les offres d'achat et les mandats rédigés depuis cette fiche sont gardés ici, avec leur statut."
          action={
            <Link href={`/biens/${bien.id}/offre`} className="btn-secondary btn-sm">
              <FileSignature size={14} /> Rédiger une offre d&apos;achat
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {actes.map((a) => {
            const st = statutActe(a);
            const Icone = a.kind === "offre" ? FileSignature : FileText;
            return (
              <li key={a.id} className="px-4 sm:px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">
                    <Icone size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{titreActe(a)}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {resumeActe(a)}
                      {resumeActe(a) ? " · " : ""}rédigé le {dateCourte(a.creeLe)}
                      {a.maj.slice(0, 10) !== a.creeLe.slice(0, 10) ? `, modifié le ${dateCourte(a.maj)}` : ""}
                    </div>
                    <button className="mt-2 inline-flex items-center gap-1" onClick={() => setChoix(a)} aria-label="Changer le statut du document">
                      <Badge tone={st.tone}>
                        {st.label} <ChevronDown size={12} />
                      </Badge>
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2 pl-12">
                  <Link href={lienActe(bien.id, a)} className="btn-secondary btn-sm">
                    <Eye size={14} /> Voir le PDF
                  </Link>
                  <button className="btn-ghost btn-sm" onClick={() => modifier(a)}>
                    <Pencil size={14} /> Modifier
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={!!choix} onClose={() => setChoix(null)} title="Statut du document">
        {choix && (
          <div className="space-y-2">
            <p className="text-sm text-muted">{titreActe(choix)}</p>
            {STATUTS_ACTE[choix.kind].map((s) => (
              <button
                key={s.v}
                onClick={() => changer(choix, s.v)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 h-12 text-sm transition ${choix.statut === s.v ? "border-accent bg-accent/5" : "border-line hover:bg-surface-2"}`}
              >
                {s.label}
                {choix.statut === s.v && <span className="text-xs text-accent font-medium">Actuel</span>}
              </button>
            ))}
            <p className="pt-1 text-xs text-muted">
              {choix.kind === "offre"
                ? "Une offre acceptée met le bien « Sous offre » ; s'il n'en reste plus aucune, il repasse « En vente »."
                : "Un mandat signé reporte son numéro, son type et ses dates sur le bien."}
            </p>
            <button
              className="btn-ghost btn-sm w-full text-danger"
              onClick={() => {
                if (confirm("Retirer ce document de la fiche du bien ?")) {
                  supprimerActe(bien.id, choix.id);
                  setChoix(null);
                }
              }}
            >
              <Trash2 size={14} /> Retirer ce document
            </button>
          </div>
        )}
      </Sheet>
    </Card>
  );
}
