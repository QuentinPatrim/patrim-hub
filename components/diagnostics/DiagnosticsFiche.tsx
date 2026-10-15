"use client";

import Link from "next/link";
import { Card, cx } from "@/components/ui";
import { today } from "@/lib/format";
import type { Bien } from "@/lib/types";
import { ALERTES, diagnosticsSuivis, statutsDiags } from "./diagnostics";

/** Carte « Diagnostics » de la fiche du bien : ce qui est expiré, expire bientôt ou manque. */
export function DiagnosticsFiche({ b }: { b: Bien }) {
  const suivis = diagnosticsSuivis(b);
  const statuts = statutsDiags(b, today());
  const alertes = statuts.filter((s) => ALERTES.includes(s.etat));
  const valables = statuts.filter((s) => s.etat === "ok").length;
  const lien = `/biens/${b.id}/diagnostics`;

  return (
    <Card
      title="Diagnostics"
      action={
        <Link href={lien} className="btn-ghost btn-sm">
          {suivis ? "Mettre à jour" : "Renseigner"}
        </Link>
      }
    >
      {!suivis ? (
        <p className="text-sm text-muted">Saisissez la date de chaque rapport : la fiche vous prévient avant qu&apos;un diagnostic expire, et avant la signature.</p>
      ) : (
        <>
          {alertes.length ? (
            <ul className="space-y-2">
              {alertes.map((s) => (
                <li key={s.cle} className="text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className={cx("block text-xs", s.tone === "danger" ? "text-danger" : "text-warn")}>{s.texte}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ok">Les diagnostics renseignés sont valables.</p>
          )}
          {valables > 0 && alertes.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              {valables} autre{valables > 1 ? "s" : ""} valable{valables > 1 ? "s" : ""}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
