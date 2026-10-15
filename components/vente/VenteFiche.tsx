"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, cx } from "@/components/ui";
import { today, type Tone } from "@/lib/format";
import type { Bien } from "@/lib/types";
import { echeances, incoherences, venteDe } from "./vente";

export const TEXTE_TON: Partial<Record<Tone, string>> = { ok: "text-ok", warn: "text-warn", danger: "text-danger" };

/** Carte « Suivi de la vente » de la fiche du bien (sous offre ou en compromis) : les prochaines échéances. */
export function VenteFiche({ b }: { b: Bien }) {
  const auj = today();
  const v = venteDe(b);
  const liste = echeances(b, auj);
  const aFaire = liste.filter((x) => x.etat !== "fait");
  const passees = liste.length - aFaire.length;
  const alertes = incoherences(b).length;
  const lien = `/biens/${b.id}/vente`;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <CalendarClock size={16} className="text-accent" /> Suivi de la vente
        </span>
      }
      action={
        <Link href={lien} className="btn-ghost btn-sm">
          {v.signature ? "Ouvrir" : "Commencer"}
        </Link>
      }
    >
      {!v.signature ? (
        <p className="text-sm text-muted">
          Saisissez la date de signature de l&apos;avant-contrat : l&apos;appli calcule la fin du délai de rétractation, suit le prêt de l&apos;acquéreur et vous prévient avant l&apos;acte.
        </p>
      ) : (
        <>
          {aFaire.length ? (
            <ul className="space-y-2">
              {aFaire.slice(0, 4).map((x) => (
                <li key={x.cle} className="text-sm">
                  <span className="font-medium">{x.label}</span>
                  <span className={cx("block text-xs", TEXTE_TON[x.tone] ?? "text-muted")}>{x.texte}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ok">Toutes les étapes sont passées.</p>
          )}
          {(passees > 0 || alertes > 0) && (
            <p className="mt-2 text-xs text-muted">
              {[passees > 0 && `${passees} étape${passees > 1 ? "s" : ""} passée${passees > 1 ? "s" : ""}`, alertes > 0 && `${alertes} date${alertes > 1 ? "s" : ""} à vérifier`].filter(Boolean).join(" · ")}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
