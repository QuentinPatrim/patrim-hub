"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { C, MENTIONS } from "@/components/documents/charte";
import { ACTE_PRINT_CSS, Pagine } from "@/components/documents/blocs";
import { LIGNES_FICHE, PIECES_CANDIDAT, PIECES_INTERDITES, lireFiche, premierMois, totalEntree, type FicheCandidat } from "@/components/candidat/candidat";
import { dateActe, eurosCts } from "@/components/location/loi";
import { BoutonPdf, nommerPdf } from "@/components/documents/BoutonPdf";

/* ============================================================
   Fiche de renseignements PATRIM pour un candidat locataire, à
   « Enregistrer en PDF » et à joindre au mail. Vierge : seuls le
   logement et les sommes sont imprimés.
   ============================================================ */

const Titre = ({ children }: { children: ReactNode }) => (
  <div className="acte-titre mb-[2mm] text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
    {children}
  </div>
);

export default function FichePdf() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<FicheCandidat | null | undefined>(undefined);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setF(lireFiche(id));
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!f) return;
    const prev = document.title;
    document.title = nommerPdf(`Fiche de renseignements – ${f.logement}`);
    return () => {
      document.title = prev;
    };
  }, [f]);

  if (f === undefined) return null;
  if (!f)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Aucune fiche préparée pour ce bien sur cet appareil.</p>
          <Link href={`/biens/${id}/candidat`} className="mt-3 inline-block underline">
            Préparer la fiche
          </Link>
        </div>
      </div>
    );

  const colonnes = ["Vous", ...(f.coloc ? ["Conjoint ou colocataire"] : []), ...Array.from({ length: f.garants }, (_, i) => (f.garants > 1 ? `Garant ${i + 1}` : "Garant"))];
  const pm = premierMois(f);
  const sommes: [string, string][] = [
    ["Loyer hors charges", f.loyer ? `${eurosCts(f.loyer)} par mois` : "—"],
    ["Charges", f.charges != null ? `${eurosCts(f.charges)} par mois` : "—"],
    ["Dépôt de garantie", f.depot ? eurosCts(f.depot) : "—"],
    ["Honoraires de location", f.honoraires ? eurosCts(f.honoraires) : "—"],
    ...(pm ? ([[`Premier mois au prorata (${pm.restants} j / ${pm.jours})`, eurosCts(pm.montant)]] as [string, string][]) : []),
  ];

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/biens/${id}/candidat`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Modifier
          </Link>
          <BoutonPdf className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm active:scale-[.98]" style={{ background: C.brand }}>
            <Printer size={16} /> Enregistrer en PDF
          </BoutonPdf>
        </div>
      </div>

      <div className="flex justify-center py-4 sm:py-6">
        <article className="acte-sheet relative flex min-h-[297mm] w-[210mm] flex-col bg-white shadow-xl" style={{ zoom }}>
          <Pagine>
            <header className="flex items-start justify-between px-[16mm] pt-[10mm]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="PATRIM" style={{ height: "12mm" }} />
              <div className="text-right text-[8pt] leading-relaxed" style={{ color: C.muted }}>
                <div className="font-semibold" style={{ color: C.slate }}>
                  Service location
                </div>
                <div>45, allées Jean Jaurès – 31000 Toulouse</div>
                <div>gestion@patrim.fr · 05 61 99 08 08</div>
              </div>
            </header>

            <div className="px-[16mm] pt-[7mm]">
              <div className="h-[3px] w-[16mm]" style={{ background: C.coral }} />
              <h1 className="mt-[3mm] font-serif text-[24pt] font-semibold leading-[1.05]" style={{ color: C.brand }}>
                Fiche de renseignements
              </h1>
              <div className="mt-[1mm] text-[9pt]" style={{ color: C.muted }}>
                Candidature à la location {f.meuble ? "meublée" : "vide"} · une colonne par personne, à compléter et à renvoyer avec les pièces listées au verso
              </div>
            </div>

            <div className="flex-1 space-y-[5mm] px-[16mm] pt-[6mm] pb-[6mm] text-[9pt] leading-[1.45]">
              <section className="acte-bloc grid grid-cols-[1fr_auto] gap-[6mm] rounded-[3mm] px-[5mm] py-[3.5mm]" style={{ background: C.cream }}>
                <div>
                  <Titre>Le logement</Titre>
                  <p className="font-medium">{f.logement}</p>
                  <p className="mt-[1mm]" style={{ color: C.slate }}>
                    Entrée prévue : {f.entree ? dateActe(f.entree, { annee: true, majuscule: false }) : "à convenir"}
                  </p>
                </div>
                <div className="min-w-[70mm] text-[8.6pt]">
                  {sommes.map(([l, v]) => (
                    <div key={l} className="flex justify-between gap-[4mm]">
                      <span style={{ color: C.slate }}>{l}</span>
                      <span className="tabular-nums">{v}</span>
                    </div>
                  ))}
                  <div className="mt-[1mm] flex justify-between gap-[4mm] border-t pt-[1mm] font-semibold" style={{ borderColor: C.line }}>
                    <span>À régler à la signature</span>
                    <span className="tabular-nums">{eurosCts(totalEntree(f))}</span>
                  </div>
                </div>
              </section>

              <section>
                <Titre>Vos renseignements</Titre>
                <table className="w-full table-fixed border-collapse text-[8pt] leading-[1.25]">
                  <thead>
                    <tr>
                      <th className="w-[50mm]" />
                      {colonnes.map((c) => (
                        <th key={c} className="border px-[2mm] py-[1.6mm] text-left font-semibold" style={{ borderColor: C.line, background: C.cream, color: C.brand }}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {LIGNES_FICHE.map((l) => (
                      <tr key={l.label}>
                        <td className="border px-[2mm] py-[0.8mm] align-top" style={{ borderColor: C.line, color: C.slate, height: l.haut ? "11mm" : "7.2mm" }}>
                          {l.label}
                        </td>
                        {colonnes.map((c) => (
                          <td key={c} className="border" style={{ borderColor: C.line }} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-[2mm] text-[8pt]" style={{ color: C.muted }}>
                  Garant : indiquez aussi le nom du candidat dont vous vous portez caution. Une garantie Visale est acceptée à la place d&apos;un garant (visale.fr).
                </p>
              </section>

              <section className="acte-bloc">
                <p>
                  Je certifie l&apos;exactitude des renseignements ci-dessus. Fait à ……………………………, le ………………………
                </p>
                <div className="mt-[2mm] grid gap-[4mm]" style={{ gridTemplateColumns: `repeat(${colonnes.length}, minmax(0, 1fr))` }}>
                  {colonnes.map((c) => (
                    <div key={c} className="h-[16mm] rounded-[2mm] border px-[2mm] pt-[1mm] text-[7.5pt]" style={{ borderColor: C.line, color: C.muted }}>
                      Signature ({c.toLowerCase()})
                    </div>
                  ))}
                </div>
              </section>

              <section className="pt-[2mm]">
                <Titre>Pièces à joindre, en copie (décret n° 2015-1437)</Titre>
                <p className="mb-[2mm]" style={{ color: C.slate }}>
                  Pour chaque personne. Les garants fournissent les mêmes pièces, sauf le justificatif de domicile qui peut être une facture ou une attestation d&apos;assurance de moins de trois mois.
                  Les documents en langue étrangère peuvent être demandés avec une traduction en français, et les montants convertis en euros.
                </p>
                <div className="space-y-[1.5mm] text-[8.4pt] leading-[1.35]">
                  {PIECES_CANDIDAT.map(([titre, items]) => (
                    <div key={titre} className="acte-bloc">
                      <p className="font-semibold">{titre}</p>
                      <ul className="mt-[0.3mm] text-[8pt]">
                        {items.map((i) => (
                          <li key={i} className="relative pl-[4mm] before:absolute before:left-0 before:content-['–']">
                            {i}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section className="acte-bloc rounded-[3mm] border-[0.4mm] px-[5mm] py-[3.5mm]" style={{ borderColor: C.brand }}>
                <Titre>Ne nous envoyez pas ces documents</Titre>
                <p className="mb-[1.5mm]" style={{ color: C.slate }}>
                  La loi interdit de vous les demander (article 22-2 de la loi du 6 juillet 1989), notamment :
                </p>
                <div className="grid grid-cols-2 gap-x-[6mm] text-[8pt] leading-[1.35]">
                  {PIECES_INTERDITES.map((p) => (
                    <span key={p} className="relative pl-[4mm] before:absolute before:left-0 before:content-['×']">
                      {p}
                    </span>
                  ))}
                </div>
              </section>

              <section className="acte-bloc text-[8pt]" style={{ color: C.slate }}>
                <Titre>Vos données</Titre>
                <p>
                  Les informations et pièces transmises servent uniquement à étudier votre candidature et, si elle est retenue, à établir le bail. Elles sont communiquées au propriétaire et, le
                  cas échéant, à l&apos;assureur loyers impayés. Si votre candidature n&apos;est pas retenue, elles sont détruites dans un délai de trois mois. Vous pouvez y accéder, les faire
                  rectifier ou supprimer en écrivant à SAS PATRIM, 45 allées Jean Jaurès, 31000 Toulouse, et saisir la CNIL. Aucune décision n&apos;est fondée sur un critère discriminatoire
                  (article 225-1 du code pénal).
                </p>
              </section>
            </div>

            <footer className="no-print px-[16mm] pb-[8mm] text-center text-[7.3pt]" style={{ color: C.muted }}>
              {MENTIONS}
            </footer>
          </Pagine>
        </article>
      </div>
    </div>
  );
}
