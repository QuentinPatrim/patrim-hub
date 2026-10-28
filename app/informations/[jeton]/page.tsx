"use client";

import { useParams } from "next/navigation";
import { ParcoursFiche } from "@/components/fiches/Parcours";

/* Fiche vendeur ou acquéreur en ligne : ouverte sans compte par le client. */
export default function FichePublique() {
  const { jeton } = useParams<{ jeton: string }>();
  return <ParcoursFiche jeton={jeton} />;
}
