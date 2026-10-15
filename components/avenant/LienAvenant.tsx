"use client";

import Link from "next/link";
import { FilePen } from "lucide-react";

/** Raccourci vers la rédaction d'un avenant au mandat (carte « Prix & mandat », points du dossier, « À régler »). */
export function LienAvenant({ bienId, court }: { bienId: string; court?: boolean }) {
  return (
    <Link href={`/biens/${bienId}/avenant`} className="btn-secondary btn-sm !h-10 shrink-0">
      <FilePen size={14} /> {court ? "Avenant" : "Préparer l'avenant"}
    </Link>
  );
}
