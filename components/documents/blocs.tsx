"use client";

import type { ReactNode } from "react";
import { C } from "./charte";

/* Éléments communs des actes PATRIM (offre d'achat, mandat de vente). */

/** Mise en page A4 à l'impression, avec un rappel de l'agence et la pagination en bas de chaque page. */
export const ACTE_PRINT_CSS = `
  @page {
    size: A4;
    margin: 14mm 0 16mm;
    @bottom-center { content: "PATRIM · 45, allées Jean Jaurès – 31000 Toulouse · 05 61 99 08 08 · www.patrim.fr · Page " counter(page) " / " counter(pages); font: 7pt Inter, sans-serif; color: #7a7f87; }
  }
  @media print {
    html, body, .acte-root { background: #fff !important; }
    .acte-sheet { box-shadow: none !important; margin: 0 !important; min-height: 0 !important; width: 210mm !important; zoom: 1 !important; }
    .acte-bloc { break-inside: avoid; page-break-inside: avoid; }
    .acte-saut { break-before: page; page-break-before: always; }
    .acte-titre { break-after: avoid; page-break-after: avoid; }
    .acte-trou { background: none !important; color: #b3261e !important; }
  }
  .acte-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** Information manquante, bien visible pour ne pas l'oublier. */
export function Trou({ children }: { children?: ReactNode }) {
  return (
    <span className="acte-trou rounded px-1" style={{ background: "#ef402a1f", color: "#b3261e" }}>
      [À compléter{children ? ` : ${children}` : ""}]
    </span>
  );
}
export const ou = (v: ReactNode | undefined, quoi: string) => (v == null || v === "" ? <Trou>{quoi}</Trou> : v);

/** Texte libre où les « [À compléter …] » restent repérables. */
export function Texte({ t }: { t: string }) {
  return (
    <>
      {t.split(/(\[À compléter[^\]]*\])/g).map((s, i) =>
        /^\[À compléter/.test(s) ? (
          <span key={i} className="acte-trou rounded px-1" style={{ background: "#ef402a1f", color: "#b3261e" }}>
            {s}
          </span>
        ) : (
          s
        )
      )}
    </>
  );
}

export function Section({ num, titre, children }: { num: string; titre: string; children: ReactNode }) {
  return (
    <section>
      <div className="acte-bloc acte-titre flex items-baseline gap-[3mm]">
        <span className="font-serif text-[10.5pt]" style={{ color: C.coral }}>
          {num}
        </span>
        <h2 className="font-serif text-[15pt] font-semibold" style={{ color: C.brand }}>
          {titre}
        </h2>
        <span className="ml-[1mm] h-px flex-1 self-center" style={{ background: C.line }} />
      </div>
      <div className="mt-[2.5mm]">{children}</div>
    </section>
  );
}

/** Case à cocher imprimée. */
export function Case({ on, children }: { on?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-start gap-[1.8mm]">
      <span className="mt-[0.7mm] grid size-[3.6mm] shrink-0 place-items-center rounded-[0.8mm] border-[0.35mm] text-[7pt] font-bold leading-none" style={{ borderColor: C.brand, color: C.brand }}>
        {on ? "✓" : ""}
      </span>
      <span>{children}</span>
    </span>
  );
}
