"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BienForm, emptyBien, finaliserBien } from "@/components/biens/BienForm";
import { create } from "@/lib/store";
import type { Bien } from "@/lib/types";
import { useEspace } from "@/components/espace/espace";

export default function NouveauBienPage() {
  const router = useRouter();
  const loc = useEspace() === "location";
  return (
    <div>
      <PageHeader
        title={loc ? "Nouveau bien à louer" : "Nouveau bien"}
        subtitle={loc ? "Décrivez le logement ; le loyer, les charges et le dépôt se règlent ensuite dans le bloc « Location » de la fiche." : "Remplissez ce que vous avez sous la main, le reste pourra être complété plus tard."}
        back="/biens"
      />
      <BienForm
        initial={emptyBien()}
        submitLabel="Créer le bien"
        onCancel={() => router.push("/biens")}
        onSubmit={(d) => {
          const data = finaliserBien(d);
          // Hub Location : bien à louer, hors de tous les calculs de vente
          const b = create("biens", (loc ? { ...data, transaction: "location", statut: "retire", mandat: undefined, prix: undefined, netVendeur: undefined, honoraires: undefined, location: { statut: "a_louer" } } : data) as Omit<Bien, "id" | "createdAt" | "updatedAt">);
          router.replace(`/biens/${b.id}`);
        }}
      />
    </div>
  );
}
