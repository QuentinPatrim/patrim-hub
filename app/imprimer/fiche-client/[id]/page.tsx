"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { C, MENTIONS } from "@/components/documents/charte";
import { ACTE_PRINT_CSS, Pagine } from "@/components/documents/blocs";
import { listerFiches } from "@/components/fiches/client";
import { alertesFiche } from "@/components/fiches/FichesBien";
import { groupesReponses, TITRE_FICHE, type Fiche } from "@/components/fiches/fiche";
import { useDoc } from "@/lib/store";

/* ============================================================
   Fiche vendeur ou acquéreur remplie en ligne, à « Enregistrer en
   PDF » pour le dossier de l'agence : identité, mandat ou offre, et
   la partie « connaissance du client » des obligations de lutte
   contre le blanchiment (à garder 5 ans dans le dossier TRACFIN).
   ============================================================ */

const dateFr = (iso?: string) => (iso ? new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("fr-FR") : "");

const Titre = ({ children }: { children: ReactNode }) => (
  <div className="acte-titre mb-[2mm] text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
    {children}
  </div>
);

export default function FicheClientPdf() {
  const { id } = useParams<{ id: string }>();
  const { doc: b } = useDoc("biens", id);
  const [f, setF] = useState<Fiche | null | undefined>(undefined);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const ficheId = new URLSearchParams(window.location.search).get("fiche");
    if (!ficheId) return setF(null);
    listerFiches(id)
      .then((fs) => setF(fs.find((x) => x.id === ficheId) ?? null))
      .catch(() => setF(null));
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!f) return;
    const prev = document.title;
    document.title = `${TITRE_FICHE[f.kind]} – ${[f.reponses?.nom?.toUpperCase(), f.reponses?.prenom || f.prenom].filter(Boolean).join(" ")} – ${f.contexte.titre}`;
    return () => {
      document.title = prev;
    };
  }, [f]);

  if (f === undefined) return null;
  if (!f)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Fiche introuvable (supprimée, ou connexion requise).</p>
          <Link href={`/biens/${id}`} className="mt-3 inline-block underline">
            Retour au bien
          </Link>
        </div>
      </div>
    );

  const r = f.reponses ?? {};
  const groupes = groupesReponses(f.kind, r)
    .map((g) => ({ ...g, lignes: g.lignes.filter(([, v]) => v) }))
    .filter((g) => g.lignes.length);
  const alertes = alertesFiche(f.kind, r, b?.prix);
  const retour = `/biens/${id}/fiche-${f.kind}`;

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={retour} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Retour
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm active:scale-[.98]"
            style={{ background: C.brand }}
          >
            <Printer size={16} /> Enregistrer en PDF
          </button>
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
                  Service transaction
                </div>
                <div>45, allées Jean Jaurès – 31000 Toulouse</div>
                <div>05 61 99 08 08</div>
              </div>
            </header>

            <div className="px-[16mm] pt-[7mm]">
              <div className="h-[3px] w-[16mm]" style={{ background: C.coral }} />
              <h1 className="mt-[3mm] font-serif text-[24pt] font-semibold leading-[1.05]" style={{ color: C.brand }}>
                {TITRE_FICHE[f.kind]}
              </h1>
              <div className="mt-[1mm] text-[9pt]" style={{ color: C.muted }}>
                {f.contexte.titre}
                {f.contexte.ville ? `, ${f.contexte.ville}` : ""} · renseignements transmis en ligne
                {f.statut === "termine" ? ` et certifiés exacts le ${dateFr(f.maj)}` : " (fiche pas encore envoyée)"}
              </div>
            </div>

            <div className="flex-1 space-y-[4mm] px-[16mm] pt-[6mm] pb-[6mm] text-[9pt] leading-[1.45]">
              {groupes.map((g) => (
                <section key={g.titre} className="acte-bloc">
                  <Titre>
                    {g.titre}
                    {g.lcb ? " · vigilance LCB-FT" : ""}
                  </Titre>
                  <table className="w-full table-fixed border-collapse text-[8.6pt] leading-[1.3]">
                    <tbody>
                      {g.lignes.map(([k, v]) => (
                        <tr key={k}>
                          <td className="w-[55mm] border px-[2mm] py-[1mm] align-top" style={{ borderColor: C.line, color: C.slate, background: C.cream }}>
                            {k}
                          </td>
                          <td className="break-words border px-[2mm] py-[1mm] align-top" style={{ borderColor: C.line }}>
                            {v}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}

              <section className="acte-bloc rounded-[3mm] border-[0.4mm] px-[5mm] py-[3.5mm]" style={{ borderColor: C.brand }}>
                <Titre>Évaluation du risque par l&apos;agence</Titre>
                {alertes.length ? (
                  <ul className="space-y-[1mm]">
                    {alertes.map((a) => (
                      <li key={a.texte} className="relative pl-[4mm] before:absolute before:left-0 before:content-['–']" style={{ color: a.grave ? "#b3261e" : C.ink }}>
                        {a.texte}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ color: C.slate }}>Aucun point de vigilance particulier relevé dans les réponses.</p>
                )}
                <div className="mt-[3mm] grid grid-cols-3 gap-[3mm] text-[8pt]" style={{ color: C.slate }}>
                  <span>☐ Risque faible</span>
                  <span>☐ Risque moyen</span>
                  <span>☐ Risque élevé</span>
                  <span>☐ Pièce d&apos;identité vérifiée</span>
                  <span className="col-span-2">☐ Justificatifs {f.kind === "vendeur" ? "de propriété" : "de l'origine des fonds"} reçus</span>
                </div>
                <p className="mt-[3mm] text-[8pt]" style={{ color: C.slate }}>
                  Contrôlé par ……………………………………… le ………………………
                </p>
              </section>

              <section className="acte-bloc text-[7.6pt]" style={{ color: C.muted }}>
                Informations recueillies au titre des obligations de vigilance des professionnels de l&apos;immobilier (articles L. 561-2, L. 561-5 et suivants et R. 561-5 et suivants du code monétaire et financier) et
                pour la rédaction {f.kind === "vendeur" ? "du mandat de vente" : "de l'offre d'achat"}. Document interne à l&apos;agence, conservé cinq ans. Le client peut accéder à ses données et les faire rectifier en
                écrivant à SAS PATRIM, 45 allées Jean Jaurès, 31000 Toulouse.
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
