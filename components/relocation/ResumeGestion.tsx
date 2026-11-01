"use client";

import Link from "next/link";
import { ChevronRight, FolderKanban } from "lucide-react";
import { cx } from "@/components/ui";
import { today } from "@/lib/format";
import { locationDe, locationSeule } from "@/components/location/bienLocation";
import type { Bien } from "@/lib/types";
import { biensEnRelocation, echeanceCaution, relocationDe } from "./relocation";

/* Une seule ligne sur l'accueil Location : l'entrée vers la Gestion, sans charger l'écran. */
export function ResumeGestion({ biens }: { biens: Bien[] }) {
  const auj = today();
  const dossiers = biensEnRelocation(biens.filter(locationSeule)).filter((b) => !relocationDe(b)!.fermeeLe);
  const cautions = biensEnRelocation(biens.filter(locationSeule))
    .map((b) => echeanceCaution(relocationDe(b)!, locationDe(b)?.loyer, auj))
    .filter(Boolean);
  const urgentes = cautions.filter((e) => e!.reste <= 7).length;
  const texte = [
    dossiers.length ? `${dossiers.length} relocation${dossiers.length > 1 ? "s" : ""}` : "Préavis, relocations et cautions",
    cautions.length ? `${cautions.length} caution${cautions.length > 1 ? "s" : ""} à rendre` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link href="/gestion" className="card card-pad card-hover flex items-center gap-3 !py-3">
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl", urgentes ? "bg-danger/10 text-danger" : "bg-brand/10 text-brand")}>
        <FolderKanban size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Gestion</span>
        <span className="block truncate text-[13px] text-muted">
          {texte}
          {urgentes ? ` · ${urgentes} à verser sous 7 jours` : ""}
        </span>
      </span>
      <ChevronRight size={16} className="text-muted" />
    </Link>
  );
}
