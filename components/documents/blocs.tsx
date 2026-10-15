"use client";

import type { ReactNode } from "react";
import { C, MENTIONS } from "./charte";

/* Éléments communs des actes PATRIM (offre d'achat, mandat de vente). */

/** Mise en page A4 à l'impression : page sans marge du navigateur (pas de bandes blanches ni
 *  d'en-tête ajouté par Chrome) ; le filet bordeaux en haut et le rappel de l'agence en bas
 *  sont répétés sur chaque page par <Pagine>. */
export const ACTE_PRINT_CSS = `
  @page { size: A4; margin: 0; }
  .acte-haut, .acte-bas { display: none; }
  @media print {
    html, body, .acte-root { background: #fff !important; }
    .acte-sheet { box-shadow: none !important; margin: 0 !important; min-height: 0 !important; width: 210mm !important; zoom: 1 !important; }
    .acte-barre { display: none !important; }
    .acte-haut { display: block; height: 10mm; border-top: 2mm solid ${C.brand}; }
    .acte-bas { display: flex; height: 13mm; align-items: center; justify-content: center; font: 7pt Inter, sans-serif; color: ${C.muted}; }
    .acte-bloc { break-inside: avoid; page-break-inside: avoid; }
    .acte-saut { break-before: page; page-break-before: always; }
    .acte-titre { break-after: avoid; page-break-after: avoid; }
    .acte-trou { background: none !important; color: #b3261e !important; }
  }
  .acte-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** Contenu d'un acte : à l'impression, l'en-tête et le pied du tableau se répètent sur chaque page. */
export function Pagine({ children }: { children: ReactNode }) {
  return (
    <table className="w-full flex-1 border-collapse">
      <thead>
        <tr>
          <td className="p-0">
            <div className="acte-haut" />
          </td>
        </tr>
      </thead>
      <tfoot>
        <tr>
          <td className="p-0">
            <div className="acte-bas px-[18mm] text-center leading-snug">{MENTIONS}</div>
          </td>
        </tr>
      </tfoot>
      <tbody>
        <tr>
          <td className="p-0 align-top">{children}</td>
        </tr>
      </tbody>
    </table>
  );
}

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

/** Montant mis en avant, de façon sobre : filets fins, chiffre en noir, détails à droite. */
export function PrixBloc({ label, montant, children, className }: { label: string; montant: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`acte-bloc flex items-center gap-[6mm] border-y px-[1mm] py-[3mm] ${className ?? ""}`} style={{ borderColor: C.line }}>
      <div className="flex-1">
        <div className="text-[7.5pt] uppercase tracking-[0.16em]" style={{ color: C.muted }}>
          {label}
        </div>
        <div className="mt-[1mm] text-[15pt] font-semibold leading-none" style={{ color: C.ink, fontVariantNumeric: "lining-nums tabular-nums" }}>
          {montant}
        </div>
      </div>
      {children && (
        <div className="text-right text-[9pt] leading-relaxed" style={{ color: C.slate }}>
          {children}
        </div>
      )}
    </div>
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
