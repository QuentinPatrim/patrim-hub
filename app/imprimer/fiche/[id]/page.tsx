"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { C } from "@/components/documents/charte";
import { FICHE_PRINT_CSS, FicheDocument } from "@/components/fiche/FicheDocument";
import { ficheDepuisBien } from "@/components/fiche/fiche";
import { useCollection, useDoc } from "@/lib/store";
import type { Contact } from "@/lib/types";
import { BoutonPdf, nommerPdf } from "@/components/documents/BoutonPdf";

/* Fiche du bien à enregistrer en PDF (même contenu que le lien envoyé à l'acquéreur). */
export default function FichePdfPage() {
  return (
    <Suspense>
      <FichePdf />
    </Suspense>
  );
}

function FichePdf() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const { doc: b } = useDoc("biens", id);
  const { items: contacts } = useCollection("contacts");
  const [adresse, setAdresse] = useState(params.get("adresse") === "1");
  const [attente, setAttente] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setAttente(false), 1500);
    return () => clearTimeout(t);
  }, []);

  const vendeurs = useMemo(() => contacts.filter((c) => b?.vendeurIds?.includes(c.id)) as Contact[], [contacts, b?.vendeurIds]);
  const f = useMemo(() => (b ? ficheDepuisBien(b, vendeurs, { adresse }) : null), [b, vendeurs, adresse]);

  useEffect(() => {
    if (!f) return;
    const prev = document.title;
    document.title = nommerPdf(`Fiche PATRIM – ${f.titre}`);
    return () => {
      document.title = prev;
    };
  }, [f]);

  return (
    <div className="fiche-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{FICHE_PRINT_CSS}</style>
      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/biens/${id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Retour
          </Link>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs" style={{ color: C.slate }}>
            <input type="checkbox" checked={adresse} onChange={(e) => setAdresse(e.target.checked)} className="size-4 accent-[#6c191e]" />
            Adresse exacte
          </label>
          <BoutonPdf className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm active:scale-[.98]" style={{ background: C.brand }}>
            <Printer size={16} /> <span className="hidden sm:inline">Enregistrer en</span> PDF
          </BoutonPdf>
        </div>
      </div>
      <div className="sm:pt-6">
        {f ? (
          <FicheDocument f={f} />
        ) : (
          <p className="p-10 text-center text-sm" style={{ color: C.slate }}>
            {attente ? "Préparation de la fiche…" : "Bien introuvable."}
          </p>
        )}
      </div>
    </div>
  );
}
