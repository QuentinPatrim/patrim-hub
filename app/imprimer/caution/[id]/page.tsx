"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { C, MENTIONS, telActe } from "@/components/documents/charte";
import { useActe } from "@/components/documents/archive";
import { ACTE_PRINT_CSS, Case, Pagine, PrixBloc, Section, ou } from "@/components/documents/blocs";
import { ne } from "@/components/offre/offre";
import { dureeBail, villeSeule } from "@/components/bail/bail";
import {
  SITUATIONS,
  bailleursTexte,
  dureeMaxAns,
  ecrireCaution,
  lireCaution,
  locatairesTexte,
  manquantsCaution,
  montantMax,
  nomCaution,
  nomsCaution,
  revenusTotal,
} from "@/components/caution/caution";
import { ANS_LETTRES, dateActe, eurosCts, montantBail, trimestreTexte, valeurIrl } from "@/components/location/loi";
import { BoutonPdf, nommerPdf } from "@/components/documents/BoutonPdf";

/* ============================================================
   Acte de cautionnement solidaire à durée déterminée PATRIM,
   prêt à « Enregistrer en PDF » puis à déposer sur ICSIGN.
   Texte du modèle de l'agence (articles 22-1 et 8-1 de la loi du
   6 juillet 1989), mention de la caution selon l'article 2297 du
   Code civil, annexe II du décret n° 2015-1437.
   Conventions : dates en minuscules, point pour les milliers.
   ============================================================ */

const P = ({ children, className = "" }: { children: ReactNode; className?: string }) => <p className={`mt-[2mm] first:mt-0 ${className}`}>{children}</p>;
const L = ({ k, children }: { k: string; children: ReactNode }) => (
  <P>
    <span style={{ color: C.slate }}>{k} :</span> {children}
  </P>
);

export default function CautionPdf() {
  const { id } = useParams<{ id: string }>();
  const c = useActe(id, "caution", lireCaution);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!c) return;
    const prev = document.title;
    document.title = nommerPdf(`Acte de cautionnement ${c.personnes.map((p) => [p.civilite, p.nom?.toUpperCase()].filter(Boolean).join(" ")).join(" ")}`.trim());
    return () => {
      document.title = prev;
    };
  }, [c]);

  if (c === undefined) return null;
  if (!c)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Aucun acte de cautionnement en cours pour ce bien sur cet appareil.</p>
          <Link href={`/biens/${id}/caution`} className="mt-3 inline-block underline">
            Rédiger l&apos;acte
          </Link>
        </div>
      </div>
    );

  const b = c.bail;
  const coloc = b.locataires.length > 1;
  const couple = c.personnes.length > 1;
  const dureeAns = dureeBail(b) / 12;
  const dureeLettres = Number.isInteger(dureeAns) ? `${ANS_LETTRES[dureeAns] ?? dureeAns} an${dureeAns > 1 ? "s" : ""}` : "neuf mois";
  const maxAns = dureeMaxAns(b);
  const max = montantMax(b);
  const euros = (n?: number) => (n != null ? montantBail(n, ".") : ou(undefined, "montant"));
  const date = (d?: string, quoi = "date") => (d ? dateActe(d, { majuscule: false }) : ou(undefined, quoi));
  const qui = nomsCaution(c) || ou(undefined, "nom de la caution");
  const locs = locatairesTexte(b) || ou(undefined, "locataire");
  const bailleur = bailleursTexte(b) || ou(undefined, "bailleur");
  const debiteur = coloc ? "des colocataires désignés" : "du locataire désigné";
  const nbManquants = manquantsCaution(c).length + (b.loyer ? 0 : 1) + (b.debut ? 0 : 1) + (coloc && !c.colocataireLie ? 1 : 0);

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/biens/${id}/caution`} onClick={() => ecrireCaution(c)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Modifier
          </Link>
          <BoutonPdf className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm active:scale-[.98]" style={{ background: C.brand }}>
            <Printer size={16} /> Enregistrer en PDF
          </BoutonPdf>
        </div>
        <div className="mx-auto max-w-[860px] px-4 pb-2.5 text-[12px] leading-snug" style={{ color: C.slate }}>
          {nbManquants > 0 ? (
            <span className="inline-flex items-start gap-1.5" style={{ color: "#b3261e" }}>
              <TriangleAlert size={14} className="mt-0.5 shrink-0" /> {nbManquants} élément{nbManquants > 1 ? "s" : ""} encore à compléter (en rouge).
            </span>
          ) : (
            <>Prêt pour ICSIGN : joins une copie du bail, et demande à la caution de saisir elle-même la mention de la partie IV.</>
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
                <div>Carte professionnelle n° 3101 2016 000 013 177</div>
                <div>RCS 403 231 145</div>
              </div>
            </header>

            <div className="px-[18mm] pt-[9mm]">
              <div className="h-[3px] w-[16mm]" style={{ background: C.coral }} />
              <h1 className="mt-[4mm] font-serif text-[26pt] font-semibold leading-[1.08]" style={{ color: C.brand }}>
                Acte de cautionnement
                <span className="block text-[15pt]">solidaire à durée déterminée</span>
              </h1>
              <div className="mt-[2mm] text-[8.5pt] leading-snug" style={{ color: C.muted }}>
                Bail d&apos;habitation {b.type === "meuble" ? "meublé" : "vide"}, résidence principale ·{" "}
                {coloc ? "Pour les colocataires" : "Pour un locataire unique ou un couple de locataires mariés ou pacsés"}
              </div>
            </div>

            <div className="flex-1 space-y-[5.5mm] px-[18mm] pt-[8mm] pb-[6mm] text-[9.6pt] leading-[1.52]">
              <Section num="I" titre="Caution signataire du présent engagement">
                {c.personnes.map((p, i) => (
                  <div key={i} className="acte-bloc mt-[2mm] border-l-[0.8mm] pl-[4mm] first:mt-0" style={{ borderColor: C.coral }}>
                    <P>
                      <strong>{nomCaution(p) || ou(undefined, "nom et prénom")}</strong>, {ne(p)} le {date(p.dateNaissance, "date de naissance")} à {ou(p.lieuNaissance, "lieu de naissance")}.
                    </P>
                    <P className="text-[9pt]">
                      <span style={{ color: C.slate }}>
                        E-mail : {ou(p.email, "e-mail")} · Tél. : {ou(telActe(p.tel), "portable")}
                      </span>
                    </P>
                  </div>
                ))}
                <L k="Domicile">{ou(c.personnes[0]?.adresse, "domicile")}</L>
                <P>
                  <span style={{ color: C.slate }}>Situation familiale :</span>{" "}
                  {SITUATIONS.map((s) => (
                    <span key={s.v} className="mr-[3mm] inline-block">
                      <Case on={c.situation === s.v}>{s.label}</Case>
                    </span>
                  ))}
                </P>
              </Section>

              <Section num="II" titre="Situation professionnelle">
                <L k="Profession">{ou(c.profession, "profession")}</L>
                <P>
                  <span style={{ color: C.slate }}>Contrat de travail :</span> <Case on={c.contrat === "cdi"}>à durée indéterminée (CDI)</Case>
                  <span className="ml-[3mm]" />
                  <Case on={c.contrat === "cdd"}>à durée déterminée (CDD)</Case>
                </P>
                {c.contrat === "cdd" && <L k="Date de fin de contrat">{date(c.finCdd)}</L>}
                <L k={couple ? "Revenus mensuels nets (première personne)" : "Rémunération mensuelle nette"}>{c.remuneration != null ? eurosCts(c.remuneration, ".") : ou(undefined, "revenus")}</L>
                <L k={couple ? "Revenus mensuels nets (seconde personne)" : "Autres revenus"}>{eurosCts(c.autresRevenus ?? 0, ".")}</L>
                <L k="Soit au total">
                  <strong>{eurosCts(revenusTotal(c), ".")}</strong> par mois
                </L>
              </Section>

              <Section num="III" titre="Pièces à fournir">
                <P>
                  Préalablement à son engagement, la caution signataire fournit les pièces justificatives figurant à l&apos;annexe II du décret n° 2015-1437 du 5 novembre 2015, reproduite à la fin du
                  présent acte.
                </P>
              </Section>

              <Section num="IV" titre="Conditions du contrat de location">
                <div className="acte-bloc rounded-[3mm] px-[5mm] py-[3.5mm]" style={{ background: C.cream }}>
                  <L k="Bailleur">
                    <strong>{bailleur}</strong>
                  </L>
                  <L k="Domicile du bailleur">{b.qualiteBailleur !== "physique" ? ou(b.siege, "siège social") : ou(villeSeule(b.bailleurs[0]?.adresse), "code postal et ville du bailleur")}</L>
                  <L k={coloc ? "Colocataires" : "Locataire unique ou couple de locataires mariés ou pacsés"}>
                    <strong>{locatairesTexte(b, " - ") || ou(undefined, "locataire")}</strong>
                  </L>
                  <L k="Bail en date du">
                    {date(b.date)}, à effet du {date(b.debut, "date d'effet")}, conclu pour une durée de {dureeLettres}
                  </L>
                  <L k="Adresse du bien loué">{ou(b.localisation, "adresse du bien")}</L>
                  <L k="Loyer mensuel en principal">{euros(b.loyer)}</L>
                  <L k="Révision annuelle du loyer">
                    {b.revision === "date" && b.revisionDate ? `le ${dateActe(b.revisionDate, { majuscule: false, annee: false })}` : "à la date anniversaire du bail"}, en fonction de la variation de l&apos;indice de
                    référence des loyers (IRL) sur la base du {trimestreTexte(b.irl.trimestre)} trimestre {b.irl.annee}
                  </L>
                  <L k={b.chargesMode === "forfait" ? "Forfait mensuel de charges" : "Provision mensuelle sur charges"}>{b.chargesMode === "periodique" ? "charges remboursées sur justificatif" : euros(b.charges ?? 0)}</L>
                  <L k="Dépôt de garantie">{euros(b.depot)}</L>
                </div>

                <P className="mt-[3mm]">
                  {couple ? "Nous, soussignés" : "Je, soussigné(e)"} <strong>{qui}</strong>, {couple ? "nous portons cautions solidaires" : "me porte caution solidaire"} de <strong>{locs}</strong>, renonçant aux bénéfices
                  de division et de discussion, {couple ? "nous engageons" : "m'engage"} à régler sur {couple ? "nos" : "mes"} revenus et {couple ? "nos" : "mes"} biens personnels les sommes dues par{" "}
                  {coloc ? "les colocataires désignés" : "le locataire unique (ou le couple de locataires mariés ou pacsés) désigné"} et à satisfaire à toutes les obligations résultant du contrat de location, en
                  cas de défaillance de {coloc ? "ces derniers" : "ce dernier"}. {couple ? "Nous mesurons" : "Je mesure"} la nature, l&apos;importance et l&apos;étendue de {couple ? "notre" : "mon"} engagement.
                </P>
                <P>{couple ? "Nous reconnaissons être en possession" : "Je reconnais être en possession"} d&apos;une copie intégrale du bail aux termes duquel :</P>
                <ul className="mt-[1.5mm] space-y-[1mm] pl-[3mm]">
                  <li>
                    – le montant du loyer est de {euros(b.loyer)}, devant faire l&apos;objet d&apos;une révision annuelle selon la variation de l&apos;indice de référence des loyers publié par l&apos;INSEE, sur
                    la base de l&apos;IRL du {trimestreTexte(b.irl.trimestre)} trimestre {b.irl.annee}, valeur {valeurIrl(b.irl.valeur)} ;
                  </li>
                  <li>– le montant mensuel de la provision sur charges ou du forfait est de {b.chargesMode === "periodique" ? "zéro euro (charges sur justificatif)" : euros(b.charges ?? 0)} ;</li>
                  <li>– le dépôt de garantie est de {euros(b.depot)}.</li>
                </ul>
                <P>
                  {couple ? "Nous reconnaissons" : "Je reconnais"} que {couple ? "notre" : "mon"} engagement porte sur toutes les sommes qui pourraient être dues au bailleur ou à ses ayants droit en vertu du
                  contrat de location et de ses suites, et notamment les loyers éventuellement révisés, les charges locatives, les dégradations et réparations locatives, les impôts et taxes, les intérêts de
                  retard, les indemnités d&apos;occupation, les montants de condamnations et tous frais et dépens éventuels de procédure, y compris le coût des actes dont les commandements de payer, auxquels
                  pourrai{coloc ? "en" : ""}t être tenu{coloc ? "s" : ""} {coloc ? "les colocataires désignés" : "le locataire désigné"}.
                </P>
                <P>
                  {couple ? "Nous avons" : "J'ai"} connaissance que ce bail est d&apos;une durée de {dureeLettres} à compter du {date(b.debut, "date d'effet")} et peut être reconduit ou renouvelé pour des durées
                  identiques.
                </P>
                <P>
                  {couple ? "Notre" : "Mon"} engagement de cautionnement est à durée déterminée et sera valable jusqu&apos;à l&apos;extinction des obligations {debiteur}, pendant la durée du bail initial et de ses
                  reconductions ou renouvellements successifs, <strong>sans pouvoir dépasser une durée maximum de {ANS_LETTRES[maxAns] ?? maxAns} ans</strong>.
                </P>
                {coloc && (
                  <P>
                    En cas de colocation, {couple ? "notre" : "mon"} engagement prendra fin à la date d&apos;effet du congé régulièrement délivré par <strong>{ou(c.colocataireLie, "colocataire accompagné")}</strong>,
                    si un nouveau colocataire figure au bail à cette date. À défaut, {couple ? "notre" : "mon"} engagement se poursuivra jusqu&apos;à ce qu&apos;un nouveau colocataire figure au bail en
                    remplacement de {ou(c.colocataireLie, "colocataire accompagné")}, sans pouvoir dépasser un délai de six mois après la date d&apos;effet du congé (article 8-1 de la loi du 6 juillet 1989).
                  </P>
                )}
                <P>
                  {couple ? "Nous sommes informés" : "Je suis informé(e)"} des dispositions de l&apos;article 22-1 de la loi n° 89-462 du 6 juillet 1989 : « Lorsque le cautionnement d&apos;obligations
                  résultant d&apos;un contrat de location conclu en application du présent titre ne comporte aucune indication de durée ou lorsque la durée du cautionnement est stipulée indéterminée, la
                  caution peut le résilier unilatéralement. La résiliation prend effet au terme du contrat de location, qu&apos;il s&apos;agisse du contrat initial ou d&apos;un contrat reconduit ou renouvelé, au
                  cours duquel le bailleur reçoit notification de la résiliation. »
                </P>
                <P>Par ailleurs, {couple ? "nous nous engageons" : "je m'engage"} à informer le bailleur, dans les meilleurs délais, de tout changement de domicile.</P>

                <PrixBloc className="mt-[3mm]" label="Montant maximum garanti" montant={b.loyer ? eurosCts(max, ".") : "—"}>
                  Trois années de loyers
                  <div>charges comprises · {maxAns} ans au plus</div>
                </PrixBloc>

                <div className="acte-bloc mt-[3mm] rounded-[3mm] border-[0.4mm] px-[5mm] py-[3.5mm]" style={{ borderColor: C.brand }}>
                  <p className="text-[8.5pt] font-semibold uppercase leading-snug tracking-[0.06em]" style={{ color: C.brand }}>
                    Mention à apposer par la caution elle-même (article 2297 du Code civil), de sa main ou en la saisissant elle-même lors de la signature électronique :
                  </p>
                  <p className="mt-[2mm] italic">
                    « Je soussigné(e) {qui}, m&apos;engage, en qualité de caution solidaire, sans bénéfice de division ni de discussion, à payer à {bailleur} (bailleur représenté par SAS PATRIM) ce que lui doi
                    {coloc ? "vent" : "t"} {locs} en cas de défaillance de {coloc ? "ceux-ci" : "celui-ci"}, dans le paiement des loyers, complément de loyer si exigible, charges, réparations locatives, impôts et
                    taxes, indemnités d&apos;occupation, intérêts et indemnités et tous les éventuels frais et dépens de procédure, coûts des actes, dans la limite des montants dus par le locataire, et d&apos;un
                    montant maximum de <strong>{b.loyer ? montantBail(max, ".") : ou(undefined, "montant maximum")}</strong>, soit trois années de loyers charges comprises.
                  </p>
                  <p className="mt-[2mm] italic">
                    En renonçant aux bénéfices de discussion et de division, je reconnais ne pouvoir exiger de {bailleur}, créancier, qu&apos;il poursuive d&apos;abord {locs}, débiteur
                    {coloc ? "s" : ""}, ni qu&apos;il divise ses poursuites entre les cautions. »
                  </p>
                  {couple && (
                    <p className="mt-[2mm] text-[8.5pt]" style={{ color: C.slate }}>
                      Chacun des époux appose lui-même cette mention.
                    </p>
                  )}
                </div>
              </Section>

              <Section num="V" titre="Signature électronique">
                <p className="text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                  Pour tous les actes ou documents relatifs à la présente location, comme pour tout acte y afférent (procès-verbaux, attestations, etc.), les parties acceptent une signature en la forme
                  « électronique » via notamment la plateforme de signature en ligne « ICSIGN ». Ces signatures en la forme « électronique » seront opérées sous l&apos;administration de la société PATRIM,
                  Société par actions simplifiée ayant son siège social à TOULOUSE (31000), 45, Allées Jean Jaurès, et immatriculée au registre du commerce et des sociétés de TOULOUSE (31) sous le numéro
                  403 231 145. À ce titre, chacun des intéressés déclare et garantit que son numéro de téléphone portable et son adresse électronique mentionnés ci-dessous sont bien les siens, qu&apos;ils
                  l&apos;identifient personnellement et qu&apos;il est le seul à y avoir accès, de sorte que la signature en la forme « électronique » d&apos;un acte par ce biais manifestera son consentement
                  personnel aux obligations qui en découlent :
                </p>
                <div className="acte-bloc mt-[3mm] overflow-hidden rounded-[2.5mm] border text-[9pt]" style={{ borderColor: C.line }}>
                  {c.personnes.map((p, i) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-[4mm] border-b px-[5mm] py-[2.2mm] last:border-0" style={{ borderColor: C.line, background: i % 2 ? "#fff" : C.cream }}>
                      <span className="font-medium">
                        {nomCaution(p) || ou(undefined, "nom")}
                        <span className="ml-[2mm] text-[8pt] font-normal" style={{ color: C.muted }}>
                          Caution
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {ou(p.email, "e-mail")} / {ou(telActe(p.tel), "portable")}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-[3mm] text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                  De même, chacun des signataires reconnaît que la signature électronique vaudra signature manuscrite, aura une valeur probante équivalente à une signature manuscrite pour lui-même ou pour
                  la partie à l&apos;acte dont il sera le signataire et qu&apos;il renonce de manière irrévocable et définitive à contester la valeur juridique et/ou l&apos;opposabilité de ladite signature
                  électronique. S&apos;agissant en la présente d&apos;un acte sous forme électronique, il sera communiqué aux parties des exemplaires numériques leur permettant de disposer d&apos;un
                  exemplaire sur support durable ou d&apos;y avoir accès.
                </p>
              </Section>

              <p className="acte-bloc pt-[2mm] text-center text-[9pt] font-semibold uppercase tracking-[0.12em]" style={{ color: C.brand }}>
                Fait par voie électronique à la date indiquée pour chaque signature par voie électronique
              </p>

              <section className="acte-saut pt-[6mm]">
                <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.coral }}>
                  Annexe
                </div>
                <h2 className="mt-[1mm] font-serif text-[16pt] font-semibold" style={{ color: C.brand }}>
                  Pièces justificatives pouvant être exigées des cautions
                </h2>
                <p className="mt-[1mm] text-[8.5pt] italic" style={{ color: C.muted }}>
                  Annexe II du décret n° 2015-1437 du 5 novembre 2015, pris pour l&apos;application de l&apos;article 22-2 de la loi du 6 juillet 1989. Les pièces produites peuvent être des copies ; elles sont
                  rédigées ou traduites en langue française et les montants convertis en euros.
                </p>
                <div className="mt-[3mm] space-y-[2.5mm] text-[8.6pt] leading-[1.45]">
                  {PIECES.map(([titre, items]) => (
                    <div key={titre} className="acte-bloc">
                      <p className="font-semibold" style={{ color: C.ink }}>
                        {titre}
                      </p>
                      <ol className="mt-[0.8mm] space-y-[0.6mm] pl-[4mm]">
                        {items.map((t, i) => (
                          <li key={i}>
                            {i + 1}. {t}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </section>
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

/** Annexe II du décret n° 2015-1437 (texte officiel). */
const PIECES: [string, string[]][] = [
  [
    "A. Pour les cautions personnes physiques, une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire, parmi les documents suivants :",
    ["Carte nationale d'identité française ou étrangère ;", "Passeport français ou étranger ;", "Permis de conduire français ou étranger ;"],
  ],
  [
    "B. Pour les cautions personnes morales, les deux justificatifs :",
    [
      "Extrait K bis original de moins de trois mois de la société ou les statuts ou toute autre pièce justifiant de l'existence légale de la personne, faisant apparaître le nom du responsable et l'adresse de l'organisme ainsi que la preuve qu'une déclaration a été effectuée auprès d'une administration, une juridiction ou un organisme professionnel ;",
      "Justificatif d'identité du représentant de la personne morale figurant sur l'extrait K bis ou les statuts ;",
    ],
  ],
  [
    "C. Une seule pièce justificative de domicile parmi les documents suivants :",
    ["Dernière quittance de loyer ;", "Facture d'eau, de gaz ou d'électricité de moins de trois mois ;", "Attestation d'assurance logement de moins de trois mois ;", "Dernier avis de taxe foncière ou, à défaut, titre de propriété de la résidence principale."],
  ],
  [
    "D. Un ou plusieurs documents attestant des activités professionnelles parmi les documents suivants :",
    [
      "Contrat de travail ou de stage ou, à défaut, une attestation de l'employeur précisant l'emploi et la rémunération proposée, la date d'entrée en fonctions envisagée et le cas échéant la durée de la période d'essai ;",
      "L'extrait K ou K bis du registre du commerce et des sociétés datant de moins de trois mois pour une entreprise commerciale ;",
      "L'extrait D 1 original du registre des métiers de moins de trois mois pour un artisan ;",
      "La copie du certificat d'identification de l'INSEE, comportant les numéros d'identification, pour un travailleur indépendant ;",
      "La copie de la carte professionnelle pour une profession libérale ;",
      "Toute pièce récente attestant de l'activité pour les autres professionnels.",
    ],
  ],
  [
    "E. Un ou plusieurs documents attestant des ressources parmi les documents suivants :",
    [
      "Dernier avis d'imposition ou de non-imposition et, lorsque tout ou partie des revenus perçus n'a pas été imposé en France mais dans un autre État ou territoire, le dernier avis d'imposition à l'impôt ou aux impôts qui tiennent lieu d'impôt sur le revenu dans cet État ou territoire ou un document en tenant lieu établi par l'administration fiscale de cet État ou territoire ;",
      "Titre de propriété d'un bien immobilier ou dernier avis de taxe foncière ;",
      "Trois derniers bulletins de salaires ;",
      "Les deux derniers bilans ou, à défaut, une attestation de ressources pour l'exercice en cours délivré par un comptable pour les professions non salariées ;",
      "Justificatif de versement des indemnités, retraites, pensions, prestations sociales et familiales et allocations perçues lors des trois derniers mois ou justificatif de l'ouverture des droits, établis par l'organisme payeur ;",
      "Justificatif de revenus fonciers, de rentes viagères ou de revenus de valeurs et capitaux mobiliers.",
    ],
  ],
];
