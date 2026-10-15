"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { Badge, Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { PickChip } from "@/components/contacts/bits";
import { dossierDe } from "@/components/biens/dossier";
import {
  ALERTES,
  DIAGS,
  ETAT,
  concerneParDefaut,
  dateDansTexte,
  diagnosticsDe,
  statutDiag,
  type BienDiags,
  type CleDiag,
  type Diag,
  type Etat,
} from "@/components/diagnostics/diagnostics";
import { useDoc } from "@/lib/store";
import { dateCourte, today } from "@/lib/format";
import type { Bien } from "@/lib/types";

/* ============================================================
   Diagnostics d'un bien : la date de chaque rapport, et leur
   validité au jour de la signature prévue.
   ============================================================ */

export default function DiagnosticsPage() {
  const { id } = useParams<{ id: string }>();
  const { doc, update } = useDoc("biens", id);
  const b = doc as BienDiags | undefined;
  const [ddt, setDdt] = useState("");
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!b) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const diags = diagnosticsDe(b);
  const auj = today();
  const dossier = dossierDe(b);
  const trouveeDdt = dateDansTexte(dossier?.ddt);
  const enregistrer = (patch: Partial<typeof diags>) => update({ diagnostics: { ...diags, ...patch } } as Partial<Bien>);
  const setDiag = (cle: CleDiag, patch: Partial<Diag>) => enregistrer({ [cle]: { ...diags[cle], ...patch } });
  const concerne = (cle: CleDiag) => diags[cle]?.concerne ?? concerneParDefaut(cle, b);
  const statuts = DIAGS.map((r) => statutDiag(r.cle, b, auj));
  const nb = (e: Etat[]) => statuts.filter((s) => e.includes(s.etat)).length;
  const sansDate = DIAGS.filter((r) => concerne(r.cle) === true && !diags[r.cle]?.date);
  const dateDdt = ddt || trouveeDdt || "";

  const appliquer = () => {
    if (!dateDdt) return;
    enregistrer(Object.fromEntries(sansDate.map((r) => [r.cle, { ...diags[r.cle], date: dateDdt }])));
    setDdt("");
  };

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Diagnostics" subtitle={b.titre} />

      <div className="flex flex-wrap gap-1.5 px-1">
        {nb(["expire", "avantSignature"]) > 0 && <Badge tone="danger">{nb(["expire", "avantSignature"])} à refaire</Badge>}
        {nb(["bientot"]) > 0 && <Badge tone="warn">{nb(["bientot"])} expire{nb(["bientot"]) > 1 ? "nt" : ""} bientôt</Badge>}
        {nb(["manquant"]) > 0 && <Badge tone="warn">{nb(["manquant"])} à fournir</Badge>}
        {nb(["aPreciser"]) > 0 && <Badge>{nb(["aPreciser"])} à préciser</Badge>}
        {nb(["ok"]) > 0 && <Badge tone="ok">{nb(["ok"])} valable{nb(["ok"]) > 1 ? "s" : ""}</Badge>}
      </div>

      <Card title="Signature et dossier">
        <div className="space-y-3">
          <Field label="Signature prévue (compromis ou acte)" hint="Les diagnostics doivent encore être valables ce jour-là.">
            <input type="date" className="input" value={diags.signature ?? ""} onChange={(e) => enregistrer({ signature: e.target.value || undefined })} />
          </Field>
          {sansDate.length > 0 && (
            <div>
              <Field
                label="Date du dossier de diagnostics"
                hint={!ddt && trouveeDdt ? `Date trouvée dans le dossier du bien (${dateCourte(trouveeDdt)}) : vérifiez-la avant de l'appliquer.` : "Souvent la même pour tous les rapports d'une visite."}
              >
                <input type="date" className="input" value={dateDdt} onChange={(e) => setDdt(e.target.value)} />
              </Field>
              <button type="button" className="btn-secondary btn-sm mt-2 w-full" disabled={!dateDdt} onClick={appliquer}>
                <CalendarCheck size={14} /> {sansDate.length > 1 ? `Appliquer aux ${sansDate.length} diagnostics sans date` : "Appliquer au diagnostic sans date"}
              </button>
            </div>
          )}
          {(dossier?.ddt || dossier?.dpe) && (
            <details className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
              <summary className="cursor-pointer py-1 font-medium text-fg">Ce que dit le dossier du bien</summary>
              {dossier?.ddt && <p className="mt-1.5 whitespace-pre-line">{dossier.ddt}</p>}
              {dossier?.dpe && <p className="mt-1.5 whitespace-pre-line">{dossier.dpe}</p>}
            </details>
          )}
        </div>
      </Card>

      <Card title="Les diagnostics" pad={false}>
        <ul className="divide-y divide-line">
          {DIAGS.map((r) => {
            const st = statuts.find((s) => s.cle === r.cle)!;
            const d = diags[r.cle] ?? {};
            const c = concerne(r.cle);
            return (
              <li key={r.cle} className="px-4 py-3.5 sm:px-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{r.label}</div>
                    <div className="text-xs text-muted">
                      {r.quand} · {r.duree}
                    </div>
                  </div>
                  <Badge tone={st.tone} className="shrink-0">
                    {ETAT[st.etat]}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <PickChip active={c === true} onClick={() => setDiag(r.cle, { concerne: true })}>
                    Concerné
                  </PickChip>
                  <PickChip active={c === false} onClick={() => setDiag(r.cle, { concerne: false })}>
                    Non concerné
                  </PickChip>
                </div>
                {c !== false && (
                  <div className={cx("mt-2 grid gap-2", r.resultat ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
                    <Field label="Date du rapport">
                      <input type="date" className="input" value={d.date ?? ""} onChange={(e) => setDiag(r.cle, { date: e.target.value || undefined })} />
                    </Field>
                    {r.resultat && (
                      <div>
                        <span className="label">Résultat</span>
                        <div className="flex gap-2">
                          <PickChip active={d.presence === false} onClick={() => setDiag(r.cle, { presence: false })}>
                            Absence
                          </PickChip>
                          <PickChip active={d.presence === true} onClick={() => setDiag(r.cle, { presence: true })}>
                            Présence
                          </PickChip>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {st.etat !== "nonConcerne" && (
                  <p className={cx("mt-1.5 text-xs", ALERTES.includes(st.etat) ? (st.tone === "danger" ? "text-danger" : "text-warn") : st.etat === "ok" ? "text-ok" : "text-muted")}>{st.texte}</p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="px-1 text-xs text-muted">
        Durées de validité pour une vente. Termites : seulement dans les zones délimitées par arrêté préfectoral, à vérifier pour la commune du bien.
      </p>
    </div>
  );
}
