"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { C, MENTIONS, montantComplet, telActe } from "@/components/documents/charte";
import { useActe } from "@/components/documents/archive";
import { ACTE_PRINT_CSS, Pagine, PrixBloc, Section, Texte, ou } from "@/components/documents/blocs";
import { dateLettres, nomOffre, type Partie } from "@/components/offre/offre";
import { TYPES_MANDAT } from "@/components/mandat/mandat";
import { ecrireAvenant, lireAvenant, manquantsAvenant, prixPresentation } from "@/components/avenant/avenant";
import { useRetour } from "@/lib/retour";

/* ============================================================
   Avenant au mandat de vente PATRIM (prix, honoraires), prêt à
   « Enregistrer en PDF » puis à déposer sur ICSIGN.
   ============================================================ */

const CARTE = "CPI 3101 2016 000 013 177";
const euros = (n: number) => `${n.toLocaleString("fr-FR")} €`;
const ROMAINS = ["I", "II", "III", "IV", "V", "VI"];

const P = ({ children, className = "" }: { children: ReactNode; className?: string }) => <p className={`mt-[2mm] first:mt-0 ${className}`}>{children}</p>;

export default function AvenantPdf() {
  const { id } = useParams<{ id: string }>();
  const a = useActe(id, "avenant", lireAvenant);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!a) return;
    const prev = document.title;
    document.title = `Avenant ${a.numero ?? ""} mandat ${a.mandatNumero ?? ""} ${a.mandants.map((p) => [p.civilite, p.nom?.toUpperCase()].filter(Boolean).join(" ")).join(" ")}`.replace(/\s+/g, " ").trim();
    return () => {
      document.title = prev;
    };
  }, [a]);

  const retour = useRetour(`/biens/${id}/avenant${a?.acteId ? `?acte=${a.acteId}` : ""}`, { parentSeulement: true });
  if (a === undefined) return null;
  if (!a)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Aucun avenant en cours pour ce bien sur cet appareil.</p>
          <Link href={`/biens/${id}/avenant`} className="mt-3 inline-block underline">
            Rédiger l&apos;avenant
          </Link>
        </div>
      </div>
    );

  const plusieurs = a.mandants.length > 1;
  const { ancien, nouveau } = a;
  const hai = prixPresentation(nouveau);
  const typeMandat = TYPES_MANDAT.find((t) => t.v === a.mandatType);
  const nbManquants = manquantsAvenant(a);
  const signataires: { nom: string; email?: string; tel?: string }[] = [...a.mandants.map((p) => ({ nom: nomOffre(p), email: p.email, tel: p.tel })), { nom: a.signataire.nom, email: a.signataire.email, tel: a.signataire.tel }];
  const prixChange = ancien.netVendeur != null && ancien.netVendeur !== nouveau.netVendeur;
  const honorairesChangent = ancien.honoraires != null && ancien.honoraires !== nouveau.honoraires;
  const autres = a.autres?.trim();
  let n = 0;
  const num = () => ROMAINS[n++];

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <button
            type="button"
            onClick={() => {
              ecrireAvenant(a);
              retour();
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5"
          >
            <ArrowLeft size={16} /> Modifier
          </button>
          <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm active:scale-[.98]" style={{ background: C.brand }}>
            <Printer size={16} /> Enregistrer en PDF
          </button>
        </div>
        <div className="mx-auto max-w-[860px] px-4 pb-2.5 text-[12px] leading-snug" style={{ color: C.slate }}>
          {nbManquants > 0 ? (
            <span className="inline-flex items-start gap-1.5" style={{ color: "#b3261e" }}>
              <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {nbManquants} élément{nbManquants > 1 ? "s" : ""} encore à compléter (en rouge).
            </span>
          ) : (
            <>Prêt pour ICSIGN : enregistre le PDF, puis dépose-le dans ICSIGN avec les signataires indiqués à la fin.</>
          )}
        </div>
      </div>

      <div className="flex justify-center py-4 sm:py-6">
        <article className="acte-sheet relative flex min-h-[297mm] w-[210mm] flex-col bg-white shadow-xl" style={{ zoom }}>
          <Pagine>
            <header className="flex items-start justify-between px-[18mm] pt-[11mm]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="PATRIM" style={{ height: "14mm" }} />
              <div className="text-right text-[8pt] leading-relaxed" style={{ color: C.muted }}>
                <div className="font-semibold" style={{ color: C.slate }}>
                  SAS PATRIM
                </div>
                <div>45, allées Jean Jaurès – 31000 Toulouse</div>
                <div>Carte professionnelle n° {CARTE}</div>
                <div>RCS 403 231 145</div>
              </div>
            </header>

            <div className="flex items-end justify-between gap-[6mm] px-[18mm] pt-[9mm]">
              <div>
                <div className="h-[3px] w-[16mm]" style={{ background: C.coral }} />
                <h1 className="mt-[4mm] font-serif text-[30pt] font-semibold leading-[1.05]" style={{ color: C.brand }}>
                  Avenant au mandat <span className="whitespace-nowrap">de vente</span>
                </h1>
                <div className="mt-[2mm] text-[8.5pt] leading-snug" style={{ color: C.muted }}>
                  Articles 1984 et suivants du Code civil · Loi n° 70-9 du 2 janvier 1970 et décret n° 72-678 du 20 juillet 1972
                </div>
              </div>
              <div className="shrink-0 rounded-[2.5mm] border px-[5mm] py-[3mm] text-center" style={{ borderColor: C.line }}>
                <div className="text-[7pt] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
                  Avenant n°
                </div>
                <div className="font-serif text-[18pt] font-semibold leading-none" style={{ color: C.ink }}>
                  {a.numero || "—"}
                </div>
                <div className="mt-[1.5mm] text-[7.5pt]" style={{ color: C.muted }}>
                  au mandat n° {a.mandatNumero || "—"}
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-[5.5mm] px-[18mm] pt-[8mm] pb-[6mm] text-[9.6pt] leading-[1.52]">
              {/* Parties */}
              <section>
                <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
                  Entre les soussignés
                </div>
                <div className="mt-[2.5mm] space-y-[2.5mm]">
                  {a.mandants.map((p, i) => (
                    <Mandant key={p.contactId ?? i} p={p} />
                  ))}
                  {!a.mandants.length && ou(undefined, "vendeur")}
                </div>
                <P className="mt-[2.5mm]">Dénommé{plusieurs ? "s" : ""} ci-après « LE MANDANT » d&apos;une part,</P>
                <P>
                  Et la SAS PATRIM représentée par {a.signataire.nom || ou(undefined, "représentant")} agissant en sa qualité de {a.signataire.qualite || "président"}, dont le siège social est à
                  Toulouse, 45 allées Jean Jaurès (31000), titulaire de la carte professionnelle n° {CARTE},
                </P>
                <P>Dénommée ci-après « LE MANDATAIRE » d&apos;autre part,</P>
              </section>

              <section>
                <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
                  Il est préalablement exposé ce qui suit
                </div>
                <div className="acte-bloc mt-[2.5mm] rounded-[3mm] px-[5mm] py-[3.5mm]" style={{ background: C.cream }}>
                  Par acte sous seing privé en date du <strong>{ou(dateLettres(a.mandatDate), "date du mandat")}</strong>, le mandant a confié au mandataire un{" "}
                  {typeMandat ? typeMandat.titre.toLowerCase() : "mandat de vente"}, inscrit au registre des mandats sous le <strong>n° {ou(a.mandatNumero, "numéro du mandat")}</strong>, portant sur le bien
                  sis <strong>{ou(a.adresseBien, "adresse du bien")}</strong>.
                </div>
                <P className="mt-[2.5mm] font-semibold">CECI EXPOSÉ, IL A ÉTÉ CONVENU CE QUI SUIT :</P>
              </section>

              <Section num={num()} titre="Prix">
                <P>
                  {prixChange ? (
                    <>
                      Le prix net vendeur fixé au mandat à <strong>{montantComplet(ancien.netVendeur!)}</strong> est modifié. Il est désormais de :
                    </>
                  ) : (
                    <>Le prix net vendeur fixé au mandat est désormais de :</>
                  )}
                </P>
                <PrixBloc className="mt-[2.5mm]" label="Nouveau prix net vendeur" montant={nouveau.netVendeur ? euros(nouveau.netVendeur) : "—"}>
                  {hai != null && (
                    <>
                      Prix de présentation
                      <div>{euros(hai)} honoraires inclus</div>
                    </>
                  )}
                </PrixBloc>
                <P className="mt-[2.5mm]">
                  <strong>{nouveau.netVendeur ? montantComplet(nouveau.netVendeur) : ou(undefined, "nouveau prix")} net vendeur</strong>, payable comptant le jour de la signature de l&apos;acte
                  authentique, tant à l&apos;aide de prêts que de fonds propres de l&apos;acquéreur.
                </P>
              </Section>

              <Section num={num()} titre="Honoraires d'agence">
                <P>
                  {honorairesChangent ? (
                    <>
                      Les honoraires fixés au mandat à {montantComplet(ancien.honoraires!)} TTC sont modifiés. Ils sont désormais de :{" "}
                    </>
                  ) : (
                    <>Les honoraires du mandataire sont de : </>
                  )}
                  <strong>{nouveau.honoraires != null ? `${montantComplet(nouveau.honoraires)} TTC` : ou(undefined, "honoraires")}</strong>, à la charge{" "}
                  {nouveau.charge === "vendeur" ? "du vendeur" : "de l'acquéreur"}.
                </P>
                {hai != null && (
                  <P>
                    Le prix de présentation du bien est en conséquence de <strong>{montantComplet(hai)}</strong> honoraires inclus.
                  </P>
                )}
                <P>
                  Ils seront exigibles le jour où l&apos;opération sera effectivement conclue et constatée dans un acte écrit, signé des deux parties, conformément à l&apos;article 74 du décret n° 72-678
                  du 20 juillet 1972.
                </P>
              </Section>

              {autres && (
                <Section num={num()} titre="Autre modification">
                  <P className="whitespace-pre-line">
                    <Texte t={autres} />
                  </P>
                </Section>
              )}

              <Section num={num()} titre="Autres clauses du mandat">
                <P>
                  Toutes les autres clauses et conditions du mandat n° {a.mandatNumero || "……"}, non modifiées par le présent avenant, demeurent inchangées et continuent de produire leurs effets. Le
                  présent avenant fait partie intégrante du mandat ; il prend effet à la date de sa signature par toutes les parties.
                </P>
              </Section>

              <Section num={num()} titre="Signature électronique">
                <p className="text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                  Pour le présent avenant, comme pour tout acte y afférent, les parties acceptent une signature en la forme « électronique » via notamment la plateforme de signature en ligne
                  « ICSIGN ». Ces signatures en la forme « électronique » seront opérées sous l&apos;administration de la société PATRIM, Société par actions simplifiée ayant son siège social à
                  TOULOUSE (31000), 45, Allées Jean Jaurès, et immatriculée au registre du commerce et des sociétés de TOULOUSE (31) sous le numéro 403 231 145. À ce titre, chacun des intéressés
                  déclare et garantit que son numéro de téléphone portable et son adresse électronique mentionnés ci-dessous sont bien les siens, qu&apos;ils l&apos;identifient personnellement et
                  qu&apos;il est le seul à y avoir accès, de sorte que la signature en la forme « électronique » d&apos;un acte par ce biais manifestera son consentement personnel aux obligations
                  qui en découlent :
                </p>
                <div className="acte-bloc mt-[3mm] overflow-hidden rounded-[2.5mm] border text-[9pt]" style={{ borderColor: C.line }}>
                  {signataires.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-[4mm] border-b px-[5mm] py-[2.2mm] last:border-0" style={{ borderColor: C.line, background: i % 2 ? "#fff" : C.cream }}>
                      <span className="font-medium">
                        {s.nom || ou(undefined, "nom")}
                        <span className="ml-[2mm] text-[8pt] font-normal" style={{ color: C.muted }}>
                          {i < a.mandants.length ? "Mandant" : "Mandataire"}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {ou(s.email, "e-mail")} / {ou(telActe(s.tel), "portable")}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-[3mm] text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                  De même, chacun des signataires reconnaît que la signature électronique vaudra signature manuscrite, aura une valeur probante équivalente à une signature manuscrite pour lui-même
                  ou pour la partie à l&apos;acte dont il sera le signataire et qu&apos;il renonce de manière irrévocable et définitive à contester la valeur juridique et/ou l&apos;opposabilité de
                  ladite signature électronique. S&apos;agissant en la présente d&apos;un acte sous forme électronique, il sera communiqué aux parties des exemplaires numériques leur permettant de
                  disposer d&apos;un exemplaire sur support durable ou d&apos;y avoir accès.
                </p>
              </Section>

              <p className="acte-bloc pt-[2mm] text-center text-[9pt] font-semibold uppercase tracking-[0.12em]" style={{ color: C.brand }}>
                Fait par voie électronique à la date indiquée pour chaque signature par voie électronique, en autant d&apos;exemplaires que de parties
              </p>
            </div>

            <footer className="no-print px-[18mm] pb-[8mm] text-center text-[7.3pt]" style={{ color: C.muted }}>
              {MENTIONS}
            </footer>
          </Pagine>
        </article>
      </div>
    </div>
  );
}

/** « Madame Prénom NOM demeurant … » + coordonnées de signature. */
function Mandant({ p }: { p: Partie }) {
  return (
    <div className="border-l-[0.8mm] pl-[4mm]" style={{ borderColor: C.coral }}>
      <p>
        <strong>{nomOffre(p) || ou(undefined, "nom")}</strong> demeurant {ou(p.adresse, "adresse complète")}.
      </p>
      <p className="text-[9pt]" style={{ color: C.slate }}>
        Portable : {ou(telActe(p.tel), "portable")} · Mail : {ou(p.email, "e-mail")}
      </p>
    </div>
  );
}
