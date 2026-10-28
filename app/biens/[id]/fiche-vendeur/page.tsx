"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Empty, PageHeader } from "@/components/ui";
import { FichesBien } from "@/components/fiches/FichesBien";
import { useDoc } from "@/lib/store";

/* Fiches vendeur remplies en ligne par le vendeur avant le mandat. */
export default function FicheVendeurPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: b } = useDoc("biens", id);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!b) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }
  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Fiche vendeur" subtitle={b.titre} />
      <FichesBien b={b} kind="vendeur" />
    </div>
  );
}
