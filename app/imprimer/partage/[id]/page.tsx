"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { C } from "@/components/documents/charte";
import { FICHE_PRINT_CSS, FicheDocument } from "@/components/fiche/FicheDocument";
import { decoderFiche, type FichePublique } from "@/components/fiche/fiche";

/* Fiche d'un bien envoyée à un acquéreur : page publique, sans compte. */
export default function FichePartagee() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<FichePublique | null>(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      let fiche: FichePublique | null = null;
      if (id === "lien") fiche = await decoderFiche(window.location.hash.slice(1));
      else {
        const r = await fetch(`/api/partage/${id}`).catch(() => null);
        if (r?.ok) fiche = ((await r.json()) as { fiche: FichePublique }).fiche;
      }
      if (annule) return;
      if (fiche) setF(fiche);
      else setErreur(true);
    })();
    return () => {
      annule = true;
    };
  }, [id]);

  useEffect(() => {
    if (f) document.title = `${f.titre} · PATRIM`;
  }, [f]);

  return (
    <div className="fiche-root min-h-dvh sm:py-8" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{FICHE_PRINT_CSS}</style>
      {f ? (
        <>
          <FicheDocument f={f} />
          <div className="no-print mx-auto flex max-w-[210mm] justify-center px-5 py-6">
            <button onClick={() => window.print()} className="inline-flex h-11 items-center gap-2 rounded-xl border bg-white px-5 text-sm font-semibold" style={{ borderColor: C.line, color: C.brand }}>
              <Download size={16} /> Enregistrer en PDF
            </button>
          </div>
        </>
      ) : (
        <div className="grid min-h-dvh place-items-center p-6 text-center">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PATRIM" className="mx-auto h-10 w-auto" />
            <p className="mt-6 text-sm" style={{ color: C.slate }}>
              {erreur ? "Cette fiche n'est plus disponible. Contactez l'agence PATRIM au 05 61 99 08 08." : "Chargement de la fiche…"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
