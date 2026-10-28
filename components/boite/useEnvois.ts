"use client";

import { useMemo } from "react";
import { useCollection } from "@/lib/store";
import { useLienAvis } from "@/lib/profil";
import { envoisDuJour } from "./envois";
import { useEtatBoite } from "./etat";

/** Messages prêts du jour, recalculés quand les fiches changent. */
export function useEnvois() {
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const { items: rdvs } = useCollection("rdvs");
  const etat = useEtatBoite();
  const lienAvis = useLienAvis();
  return useMemo(() => envoisDuJour({ biens, contacts, rdvs }, etat, lienAvis), [biens, contacts, rdvs, etat, lienAvis]);
}
