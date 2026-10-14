"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BienForm, emptyBien, finaliserBien } from "@/components/biens/BienForm";
import { create } from "@/lib/store";
import type { Bien } from "@/lib/types";

export default function NouveauBienPage() {
  const router = useRouter();
  return (
    <div>
      <PageHeader title="Nouveau bien" subtitle="Remplissez ce que vous avez sous la main, le reste pourra être complété plus tard." back="/biens" />
      <BienForm
        initial={emptyBien()}
        submitLabel="Créer le bien"
        onCancel={() => router.push("/biens")}
        onSubmit={(d) => {
          const b = create("biens", finaliserBien(d) as Omit<Bien, "id" | "createdAt" | "updatedAt">);
          router.replace(`/biens/${b.id}`);
        }}
      />
    </div>
  );
}
