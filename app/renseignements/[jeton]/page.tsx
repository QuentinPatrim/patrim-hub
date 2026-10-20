"use client";

import { useParams } from "next/navigation";
import { Parcours } from "@/components/renseignements/Parcours";

/* Fiche de renseignements en ligne : ouverte sans compte par le candidat ou son garant. */
export default function RenseignementsPublic() {
  const { jeton } = useParams<{ jeton: string }>();
  return <Parcours jeton={jeton} />;
}
