"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { AGENCE, C } from "@/components/documents/charte";
import { ACTE_PRINT_CSS, Pagine } from "@/components/documents/blocs";
import { MENTION_RGPD, courrier, type Signal } from "@/components/radar/radar";
import { useRetour } from "@/lib/retour";

/* Courrier « Au propriétaire » du radar vendeurs, en A4, à imprimer ou à
   enregistrer en PDF. Le texte se corrige directement sur la page. */

function Courrier() {
  const q = useSearchParams();
  const retour = useRetour("/radar");
  const s = { source: (q.get("source") ?? "dpe") as Signal["source"], adresse: q.get("adresse") ?? "", ville: q.get("ville") ?? undefined, type: q.get("type") ?? undefined } as Signal;
  const c = courrier(s);
  const [jour, setJour] = useState("");
  useEffect(() => setJour(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })), []);

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>
      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <button type="button" onClick={retour} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Radar
          </button>
          <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm" style={{ background: C.brand }}>
            <Printer size={16} /> Imprimer ou PDF
          </button>
        </div>
        <p className="mx-auto max-w-[860px] px-4 pb-2.5 text-[12px]" style={{ color: C.slate }}>Touche le texte pour le modifier avant d&apos;imprimer.</p>
      </div>
      <div className="flex justify-center py-4 sm:py-6 overflow-x-auto">
        <article className="acte-sheet relative flex min-h-[297mm] w-[210mm] flex-col bg-white shadow-xl">
          <Pagine>
            <header className="flex items-start justify-between px-[20mm] pt-[12mm]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="PATRIM" style={{ height: "13mm" }} />
              <div className="text-right text-[8.5pt] leading-relaxed" style={{ color: C.slate }}>
                <div className="font-semibold">{AGENCE.conseiller}</div>
                <div>{AGENCE.adresse}</div>
                <div>{AGENCE.conseillerTel}</div>
                {AGENCE.conseillerMail && <div>{AGENCE.conseillerMail}</div>}
              </div>
            </header>
            <div className="px-[20mm] pt-[18mm] text-[10.5pt] leading-[1.6]" contentEditable suppressContentEditableWarning>
              <div className="ml-auto w-[80mm]">
                <div>{s.source === "bodacc" ? "À l'attention du liquidateur" : "Au Propriétaire"}</div>
                <div>{s.adresse}</div>
                {s.ville && !s.adresse.toLowerCase().includes(s.ville.toLowerCase()) && <div>{s.ville}</div>}
              </div>
              <div className="mt-[12mm] text-right">Toulouse, le {jour}</div>
              <div className="mt-[8mm] font-semibold">Objet : {c.objet}</div>
              <div className="mt-[6mm] space-y-[4mm]">
                {c.corps.map((p, i) => (
                  <p key={i} className={i === c.corps.length - 1 ? "pt-[6mm] font-semibold" : undefined}>{p}</p>
                ))}
              </div>
            </div>
            <p className="mt-auto px-[20mm] pb-[6mm] pt-[14mm] text-[7.5pt] leading-snug" style={{ color: C.muted }}>{MENTION_RGPD}</p>
          </Pagine>
        </article>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Courrier />
    </Suspense>
  );
}
