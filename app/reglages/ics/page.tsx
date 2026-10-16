"use client";

import { PageHeader } from "@/components/ui";
import { ImportIcs } from "@/components/ics/Import";

/* Compléter les fiches des propriétaires à partir d'un export ICS, lu sur l'appareil. */

export default function CompleterDepuisIcs() {
  return (
    <div>
      <PageHeader title="Compléter depuis ICS" subtitle="Téléphones, e-mails et adresses de vos propriétaires, repris d'un export ICS." back="/reglages" />
      <ImportIcs />
    </div>
  );
}
