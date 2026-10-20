"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Eye, FilePen, FileSignature, FileText, KeyRound, Landmark, Pencil, Scale, Trash2 } from "lucide-react";
import { Badge, Card, Empty, Sheet } from "@/components/ui";
import { STATUT_BIEN, dateCourte, eur, nomComplet } from "@/lib/format";
import { useCollection } from "@/lib/store";
import { STATUT_ESTIM } from "@/components/estimations/shared";
import type { BienStatut } from "@/lib/types";
import { ecrireOffre } from "@/components/offre/offre";
import { ecrireMandat } from "@/components/mandat/mandat";
import { ecrireBail } from "@/components/bail/bail";
import { ecrireAvenant, prixPresentation } from "@/components/avenant/avenant";
import { STATUTS_ACTE, changerStatutActe, lienActe, resumeActe, statutActe, supprimerActe, titreActe, type Acte, type BienActes } from "./archive";

/** Carte « Documents » de la fiche du bien : offres d'achat, mandats, avenants et bons de visite, avec leur statut. */
export function DocumentsBien({ bien }: { bien: BienActes }) {
  const router = useRouter();
  const actes = [...(bien.actes ?? [])].sort((a, b) => b.maj.localeCompare(a.maj));
  // Les bons de visite, nombreux, sont regroupés à part pour ne pas noyer les offres et les mandats.
  const docs = actes.filter((a) => a.kind !== "bon");
  const bons = actes.filter((a): a is Extract<Acte, { kind: "bon" }> => a.kind === "bon").sort((x, y) => y.data.visite.localeCompare(x.data.visite));
  const [tousBons, setTousBons] = useState(false);
  const [choix, setChoix] = useState<Acte | null>(null);
  const [info, setInfo] = useState<{ texte: string; baisse?: boolean } | null>(null);
  const { items: toutes } = useCollection("estimations");
  const estimations = toutes.filter((x) => x.bienId === bien.id).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
  const total = actes.length + estimations.length;

  const modifier = (a: Acte) => {
    if (a.kind === "bon") return router.push(`/agenda/bon/${a.data.rdvId}`);
    if (a.kind === "offre") ecrireOffre(a.data);
    else if (a.kind === "mandat") ecrireMandat(a.data);
    else if (a.kind === "bail") ecrireBail(a.data);
    else ecrireAvenant(a.data);
    router.push(`/biens/${bien.id}/${a.kind}${a.kind === "avenant" ? `?acte=${a.id}` : ""}`);
  };
  const changer = (a: Acte, v: Acte["statut"]) => {
    const avant = bien.prix;
    const nouveau: BienStatut | undefined = changerStatutActe(bien.id, a.id, v);
    setChoix(null);
    const hai = a.kind === "avenant" && v === "signe" ? prixPresentation(a.data.nouveau) : undefined;
    setInfo(
      nouveau
        ? { texte: `Le bien passe en « ${STATUT_BIEN[nouveau].label} ».` }
        : hai != null
          ? { texte: `Prix de la fiche mis à jour : ${eur(hai)} honoraires inclus.`, baisse: avant != null && hai < avant }
          : null,
    );
  };

  return (
    <Card title={`Documents${total ? ` (${total})` : ""}`} pad={false}>
      {info && (
        <p className="mx-4 sm:mx-5 mt-3 rounded-xl bg-ok/10 px-3 py-2 text-sm text-ok">
          {info.texte}
          {info.baisse && (
            <>
              {" "}
              <Link href={`/biens/${bien.id}/baisse`} className="font-semibold underline underline-offset-2">
                Prévenir les acquéreurs
              </Link>
            </>
          )}
        </p>
      )}
      {!total ? (
        <Empty
          title="Aucun document pour l'instant"
          text="Les offres d'achat, les mandats, les avenants, les bons de visite et les avis de valeur de ce bien sont gardés ici, avec leur statut."
          action={
            <Link href={`/biens/${bien.id}/offre`} className="btn-secondary btn-sm">
              <FileSignature size={14} /> Rédiger une offre d&apos;achat
            </Link>
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {docs.map((a) => {
            const st = statutActe(a);
            const Icone = a.kind === "offre" ? FileSignature : a.kind === "avenant" ? FilePen : FileText;
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
                  {a.kind === "offre" && a.statut === "signe" && (
                    <Link href={`/biens/${bien.id}/notaire?offre=${a.id}`} className="btn-ghost btn-sm">
                      <Landmark size={14} /> Notaire
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
          {estimations.map((x) => {
            const prix = x.prixConseille ?? x.resultat?.median;
            return (
              <li key={x.id} className="px-4 sm:px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">
                    <Scale size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">Avis de valeur</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {prix ? `${eur(prix)} · ` : ""}estimé le {dateCourte(x.createdAt)}
                    </div>
                    <div className="mt-2">
                      <Badge tone={STATUT_ESTIM[x.statut].tone}>{STATUT_ESTIM[x.statut].label}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2 pl-12">
                  <Link href={`/imprimer/estimation/${x.id}`} className="btn-secondary btn-sm">
                    <Eye size={14} /> Voir le PDF
                  </Link>
                  <Link href={`/estimations/${x.id}#avis`} className="btn-ghost btn-sm">
                    <Pencil size={14} /> Modifier
                  </Link>
                </div>
              </li>
            );
          })}
          {bons.length > 0 && (
            <li className="px-4 sm:px-5 py-3.5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent">
                  <KeyRound size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-snug">Bons de visite</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {bons.filter((a) => a.statut === "signe").length} signé{bons.filter((a) => a.statut === "signe").length > 1 ? "s" : ""} sur {bons.length}
                  </div>
                </div>
              </div>
              <ul className="mt-2 pl-12">
                {(tousBons ? bons : bons.slice(0, 3)).map((a) => {
                  const st = statutActe(a);
                  return (
                    <li key={a.id} className="flex min-h-10 items-center gap-2">
                      <Link href={`/agenda/bon/${a.data.rdvId}`} className="min-w-0 flex-1 truncate text-sm hover:text-accent">
                        {a.data.visiteurs.map(nomComplet).join(" et ") || "Visiteur"} <span className="text-muted">· {dateCourte(a.data.visite)}</span>
                      </Link>
                      <button onClick={() => setChoix(a)} aria-label="Changer le statut du bon de visite">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </button>
                      <Link href={lienActe(bien.id, a)} className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-accent" aria-label="Voir le PDF">
                        <Eye size={16} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {bons.length > 3 && (
                <button className="btn-ghost btn-sm ml-12 mt-1" onClick={() => setTousBons(!tousBons)}>
                  {tousBons ? "Voir moins" : `Voir les ${bons.length} bons de visite`}
                </button>
              )}
            </li>
          )}
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
                : choix.kind === "avenant"
                  ? "Un avenant signé reporte le nouveau prix et les honoraires sur le bien."
                  : choix.kind === "bail"
                    ? "Un bail signé passe le bien « Loué » avec le loyer, les charges et les locataires."
                    : choix.kind === "bon"
                    ? "Un bon de visite signé prouve que le visiteur a découvert le bien grâce à l'agence."
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
