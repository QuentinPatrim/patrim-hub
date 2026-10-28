"use client";

import { useEffect, useMemo } from "react";
import { useCollection } from "@/lib/store";
import { useLienAvis } from "@/lib/profil";
import { envoisDuJour } from "./envois";
import { useEtatBoite } from "./etat";
import { creerRetour, visitesARetour, type RdvRetour } from "@/components/retour/retour";

/** Messages prêts du jour, recalculés quand les fiches changent. */
export function useEnvois() {
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const { items: rdvs } = useCollection("rdvs");
  const etat = useEtatBoite();
  const lienAvis = useLienAvis();
  // Les visites tout juste faites reçoivent leur lien de questionnaire (une fois)
  useEffect(() => {
    for (const r of visitesARetour(rdvs as RdvRetour[])) if (!r.retourId) void creerRetour(r, biens.find((b) => b.id === r.bienId));
  }, [rdvs, biens]);
  return useMemo(() => envoisDuJour({ biens, contacts, rdvs }, etat, lienAvis), [biens, contacts, rdvs, etat, lienAvis]);
}
