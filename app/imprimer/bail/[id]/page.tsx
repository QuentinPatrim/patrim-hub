"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { C, MENTIONS, telActe } from "@/components/documents/charte";
import { useActe } from "@/components/documents/archive";
import { ACTE_PRINT_CSS, Case, Pagine, PrixBloc, Section, Texte, ou } from "@/components/documents/blocs";
import { civiliteLongue, manquants, ne, nomOffre, type Partie } from "@/components/offre/offre";
import {
  ANNEXES,
  AUTRES_PARTIES,
  CHAMPS_BAILLEUR,
  CHAMPS_LOCATAIRE,
  COMMUNS,
  EQUIPEMENTS,
  MOBILIER,
  PRIVATIFS,
  QUALITES,
  dureeBail,
  ecrireBail,
  honorairesBailleur,
  lireBail,
  montantAssuranceMois,
  premiereEcheance,
  type Bail,
} from "@/components/bail/bail";
import { CHARGES, NOTICE, REPARATIONS, type Bloc } from "@/components/bail/annexes";
import { PLAFONDS, ZONES, dateActe, dureeTexte, eurosCts, montantBail, trimestreTexte, valeurIrl } from "@/components/location/loi";

/* ============================================================
   Bail d'habitation PATRIM (vide ou meublé), prêt à « Enregistrer
   en PDF » puis à déposer sur ICSIGN. Organisation du modèle de
   l'agence et du contrat type (décret n° 2015-587 du 29 mai 2015),
   mis à jour de la loi en vigueur. Annexes : inventaire (meublé),
   notice d'information, charges récupérables, réparations locatives.
   ============================================================ */

const GESTION = {
  nom: "SAS PATRIM",
  adresse: "45, Allées Jean Jaurès 31000 Toulouse",
  mail: "gestion@patrim.fr",
  tel: "05.61.99.08.08",
  carte: "CPI 3101 2016 000 013 177 / Haute-Garonne",
  garant: "MONTE PASCHI - TOULOUSE",
  tnt: "TDTS 55, Allée de Brienne 31300 Toulouse",
};

const P = ({ children, className = "" }: { children: ReactNode; className?: string }) => <p className={`mt-[2mm] first:mt-0 ${className}`}>{children}</p>;
/** Ligne « intitulé : valeur » du contrat type. */
const L = ({ k, children }: { k: string; children: ReactNode }) => (
  <P>
    <span style={{ color: C.slate }}>{k} :</span> {children}
  </P>
);
const liste = (cochees: string[], plus?: string) => [...cochees, plus?.trim()].filter(Boolean).join(", ");

export default function BailPdf() {
  const { id } = useParams<{ id: string }>();
  const x = useActe(id, "bail", lireBail);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!x) return;
    const prev = document.title;
    document.title = `Bail ${x.type === "meuble" ? "meublé" : "vide"} ${x.locataires.map((p) => [p.civilite, p.nom?.toUpperCase()].filter(Boolean).join(" ")).join(" ")}`.trim();
    return () => {
      document.title = prev;
    };
  }, [x]);

  if (x === undefined) return null;
  if (!x)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Aucun bail en cours pour ce bien sur cet appareil.</p>
          <Link href={`/biens/${id}/bail`} className="mt-3 inline-block underline">
            Rédiger le bail
          </Link>
        </div>
      </div>
    );

  const meuble = x.type === "meuble";
  const coloc = x.locataires.length > 1;
  const duree = dureeBail(x);
  const hb = honorairesBailleur(x);
  const hl = x.honorairesLocataire;
  const totalHb = (hb.bail ?? 0) + (hb.edl ?? 0) + (hb.autres ?? 0);
  const totalHl = (hl.bail ?? 0) + (hl.edl ?? 0);
  const assuranceMois = montantAssuranceMois(x);
  const qualite = QUALITES.find((q) => q.v === x.qualiteBailleur)!.label;
  const nbManquants =
    x.bailleurs.reduce((n, p) => n + manquants(p, CHAMPS_BAILLEUR).length, 0) +
    x.locataires.reduce((n, p) => n + manquants(p, CHAMPS_LOCATAIRE).length, 0) +
    (x.loyer ? 0 : 1) +
    (x.debut ? 0 : 1) +
    (x.surface ? 0 : 1) +
    (x.depot != null ? 0 : 1) +
    (x.identifiantFiscal?.trim() ? 0 : 1) +
    (x.signataire.email ? 0 : 1) +
    (x.signataire.tel ? 0 : 1);
  const signataires: { nom: string; role: string; email?: string; tel?: string }[] = [
    ...x.locataires.map((p) => ({ nom: nomOffre(p), role: coloc ? "Colocataire" : "Locataire", email: p.email, tel: p.tel })),
    ...(x.bailleurSigne || !x.parPatrim ? x.bailleurs.map((p) => ({ nom: nomOffre(p), role: "Bailleur", email: p.email, tel: p.tel })) : []),
    ...(x.parPatrim ? [{ nom: x.signataire.nom, role: "Pour le bailleur, son mandataire PATRIM", email: x.signataire.email, tel: x.signataire.tel }] : []),
  ];
  const euros = (n?: number) => (n != null ? montantBail(n) : ou(undefined, "montant"));
  const ttc = (n?: number) => (n ? `${eurosCts(n)} TTC` : "0,00 € TTC");
  let num = 0;
  const n = () => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"][num++];

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/biens/${id}/bail`} onClick={() => ecrireBail(x)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Modifier
          </Link>
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
            <>Prêt pour ICSIGN : enregistre le PDF, puis dépose-le dans ICSIGN avec les signataires de la clause « Signature électronique ».</>
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
              <h1 className="mt-[4mm] font-serif text-[28pt] font-semibold leading-[1.05]" style={{ color: C.brand }}>
                Contrat de location
                <span className="block text-[17pt]">{meuble ? "Logement meublé" : "Logement vide (non meublé)"}</span>
              </h1>
              <div className="mt-[2mm] text-[8.5pt] leading-snug" style={{ color: C.muted }}>
                Loi n° 89-462 du 6 juillet 1989{meuble ? ", titre Ier bis" : ""} · Contrat type du décret n° 2015-587 du 29 mai 2015 · Résidence principale du locataire
              </div>
            </div>

            <div className="flex-1 space-y-[5.5mm] px-[18mm] pt-[8mm] pb-[6mm] text-[9.6pt] leading-[1.52]">
              <section>
                <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
                  Entre les soussignés
                </div>
                <div className="mt-[2.5mm] space-y-[2.5mm]">
                  {x.qualiteBailleur !== "physique" && (
                    <Personne>
                      <strong>{ou(x.societe, "dénomination de la société")}</strong>, dont le siège social est {ou(x.siege, "siège social")}, représentée par{" "}
                      {x.bailleurs.map(nomOffre).filter(Boolean).join(" et ") || ou(undefined, "représentant")}.
                    </Personne>
                  )}
                  {x.qualiteBailleur === "physique" &&
                    x.bailleurs.map((p, i) => (
                      <Personne key={p.contactId ?? i}>
                        <EtatCivil p={p} quoi="nom du bailleur" />
                      </Personne>
                    ))}
                  {!x.bailleurs.length && ou(undefined, "bailleur")}
                </div>
                <P className="mt-[2.5mm]">Qualité du bailleur : {qualite}.</P>
                <P>
                  Dénommé{x.bailleurs.length > 1 ? "s" : ""} ci-après « LE BAILLEUR », agissant s&apos;ils sont deux ou plusieurs conjointement et solidairement, D&apos;UNE PART,
                </P>
                {x.parPatrim && (
                  <div className="acte-bloc mt-[2.5mm] rounded-[3mm] px-[5mm] py-[3mm] text-[9pt]" style={{ background: C.cream }}>
                    <div className="font-semibold" style={{ color: C.brand }}>
                      Représenté par le mandataire gestionnaire
                    </div>
                    <div className="mt-[1mm] grid grid-cols-2 gap-x-[6mm] gap-y-[0.5mm]">
                      <span>Raison sociale : {GESTION.nom}</span>
                      <span>Adresse : {GESTION.adresse}</span>
                      <span>Adresse électronique : {GESTION.mail}</span>
                      <span>Tél. : {GESTION.tel}</span>
                      <span>Carte professionnelle : {GESTION.carte}</span>
                      <span>Garant : {GESTION.garant}</span>
                    </div>
                  </div>
                )}
                <div className="mt-[3mm] space-y-[2.5mm]">
                  {x.locataires.map((p, i) => (
                    <Personne key={p.contactId ?? i}>
                      <EtatCivil p={p} quoi="nom du locataire" />
                      <span className="block text-[9pt]" style={{ color: C.slate }}>
                        E-mail : {ou(p.email, "e-mail")} · Tél. : {ou(telActe(p.tel), "portable")}
                      </span>
                    </Personne>
                  ))}
                </div>
                <P>
                  Dénommé{x.locataires.length > 1 ? "s" : ""} ci-après « LE LOCATAIRE », agissant s&apos;ils sont deux ou plusieurs conjointement et solidairement, D&apos;AUTRE PART.
                </P>
                <P className="font-semibold">IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :</P>
              </section>

              <Section num={n()} titre="Objet du contrat">
                <P>Le présent contrat a pour objet la location d&apos;un logement ainsi déterminé :</P>
                <div className="acte-coupe mt-[2.5mm] rounded-[3mm] px-[5mm] py-[3.5mm]" style={{ background: C.cream }}>
                  <L k="Identifiant fiscal du logement">{ou(x.identifiantFiscal, "identifiant fiscal")}</L>
                  <L k="Localisation">
                    <strong>{ou(x.localisation, "adresse, bâtiment, étage, porte")}</strong>
                  </L>
                  <P>
                    <span style={{ color: C.slate }}>Type d&apos;habitat :</span> <Case on={x.habitat === "collectif"}>Immeuble collectif</Case>
                    <span className="ml-[4mm]" />
                    <Case on={x.habitat === "individuel"}>Maison individuelle</Case>
                  </P>
                  <P>
                    <span style={{ color: C.slate }}>Régime juridique :</span> <Case on={x.regime === "mono"}>Monopropriété</Case>
                    <span className="ml-[4mm]" />
                    <Case on={x.regime === "copropriete"}>Copropriété</Case>
                  </P>
                  <L k="Période de construction">
                    {ou(x.periode, "période de construction")}
                    {x.anneeConstruction && x.anneeConstruction >= 1000 ? ` (construit en ${x.anneeConstruction})` : ""}
                  </L>
                  <L k="Surface habitable">
                    {x.surface ? <strong>{x.surface.toLocaleString("fr-FR")} m²</strong> : ou(undefined, "surface habitable")} (article 3 de la loi n° 89-462 du 6 juillet 1989)
                  </L>
                  <L k="Nombre de pièces principales">{ou(x.pieces, "nombre de pièces")}</L>
                  <L k="Autres parties du logement">{liste(x.autresParties.filter((p) => (AUTRES_PARTIES as readonly string[]).includes(p)), x.autresPartiesPlus) || "Néant"}</L>
                  <L k="Éléments d'équipement">{liste(x.equipements.filter((p) => (EQUIPEMENTS as readonly string[]).includes(p)), x.equipementsPlus) || "Néant"}</L>
                  <L k="Production de chauffage">
                    {x.chauffage === "individuel" ? "Individuelle" : `Collective${x.chauffageRepartition?.trim() ? `, répartition : ${x.chauffageRepartition}` : ""}`}
                  </L>
                  <L k="Production d'eau chaude sanitaire">
                    {x.eauChaude === "individuelle" ? "Individuelle" : `Collective${x.eauChaudeRepartition?.trim() ? `, répartition : ${x.eauChaudeRepartition}` : ""}`}
                  </L>
                  {meuble && <L k="Meublé">Le logement est loué meublé, avec le mobilier décrit dans l&apos;inventaire annexé.</L>}
                </div>
                <P className="mt-[3mm]">
                  <strong>Destination des locaux :</strong>{" "}
                  {x.usage === "habitation" ? "usage exclusif d'habitation principale." : <>usage mixte d&apos;habitation principale et professionnel, pour la profession de {ou(x.profession, "profession")}.</>} Le
                  LOCATAIRE s&apos;interdit d&apos;exercer dans les locaux loués toute activité commerciale, industrielle ou artisanale.
                </P>
                <L k="Locaux et équipements accessoires à usage privatif">{liste(x.privatifs.filter((p) => (PRIVATIFS as readonly string[]).includes(p)), x.privatifsPlus) || "Néant"}</L>
                <L k="Locaux, parties, équipements et accessoires à usage commun">{liste(x.communs.filter((p) => (COMMUNS as readonly string[]).includes(p)), x.communsPlus) || "Néant"}</L>
                <L k="Accès aux technologies de l'information">
                  possibilité de recevoir en clair les services nationaux de télévision par voie hertzienne terrestre en mode numérique. À titre informatif, coordonnées d&apos;un distributeur de services : {GESTION.tnt}.
                </L>
              </Section>

              <Section num={n()} titre="Date de prise d'effet et durée">
                <L k="Date de prise d'effet">
                  <strong>{x.debut ? dateActe(x.debut) : ou(undefined, "date d'effet")}</strong>
                </L>
                <L k="Durée du contrat">
                  <strong>{dureeTexte(duree).toUpperCase()}</strong>
                  {meuble ? (x.etudiant ? " (location consentie à un étudiant)" : "") : x.dureeReduite ? " (durée réduite)" : x.qualiteBailleur === "morale" ? " (bailleur personne morale)" : ""}
                </L>
                {!meuble && x.dureeReduite && <L k="Événement et raisons justifiant la durée réduite">{ou(x.evenement, "événement précis")}</L>}
                <P>
                  {meuble && x.etudiant
                    ? "Le contrat prend fin à son terme, sans reconduction. Le locataire peut y mettre fin à tout moment, en respectant un préavis d'un mois."
                    : `En l'absence de proposition de renouvellement, le contrat est, à son terme, reconduit tacitement pour ${meuble ? "un an" : x.qualiteBailleur === "morale" ? "six ans" : "trois ans"} et dans les mêmes conditions. Le locataire peut mettre fin au bail à tout moment, après avoir donné congé${meuble ? " avec un préavis d'un mois" : ""}. Le bailleur, quant à lui, peut mettre fin au bail à son échéance et après avoir donné congé${meuble ? " trois mois à l'avance" : " six mois à l'avance"}, soit pour reprendre le logement en vue de l'occuper lui-même ou une personne de sa famille, soit pour le vendre, soit pour un motif sérieux et légitime.`}
                </P>
              </Section>

              <Section num={n()} titre="Conditions financières">
                <PrixBloc label="Loyer mensuel hors charges" montant={x.loyer ? eurosCts(x.loyer) : "—"}>
                  {x.charges ? (
                    <>
                      {x.chargesMode === "forfait" ? "Forfait de charges" : "Provision sur charges"}
                      <div>{eurosCts(x.charges)} par mois</div>
                    </>
                  ) : null}
                </PrixBloc>
                <P className="mt-[2.5mm]">
                  <strong>Montant du loyer mensuel : {euros(x.loyer)}.</strong>
                </P>
                <P className="font-semibold">
                  Modalités particulières de fixation initiale du loyer applicables dans certaines zones tendues
                </P>
                <P>
                  Le loyer est soumis au décret fixant annuellement le montant maximum d&apos;évolution des loyers à la relocation : <Case on={x.decretRelocation}>Oui</Case>
                  <span className="ml-[3mm]" />
                  <Case on={!x.decretRelocation}>Non</Case>
                </P>
                <P>
                  Le loyer est soumis au loyer de référence majoré fixé par arrêté préfectoral : <Case on={x.encadrement}>Oui</Case>
                  <span className="ml-[3mm]" />
                  <Case on={!x.encadrement}>Non</Case>
                </P>
                {x.encadrement && (
                  <>
                    <L k="Loyer de référence">{x.loyerReference != null ? `${eurosCts(x.loyerReference)}/m²` : ou(undefined, "loyer de référence")}</L>
                    <L k="Loyer de référence majoré">{x.loyerReferenceMajore != null ? `${eurosCts(x.loyerReferenceMajore)}/m²` : ou(undefined, "loyer de référence majoré")}</L>
                    {x.complementLoyer ? (
                      <>
                        <L k="Loyer de base">{x.loyer ? eurosCts(x.loyer - x.complementLoyer) : "—"}</L>
                        <L k="Complément de loyer">{eurosCts(x.complementLoyer)}</L>
                        <L k="Caractéristiques du logement le justifiant">{ou(x.complementMotif, "caractéristiques")}</L>
                      </>
                    ) : null}
                  </>
                )}
                {x.decretRelocation && (
                  <>
                    <P className="font-semibold">Informations relatives au loyer du dernier locataire</P>
                    {x.premiereLocation ? (
                      <P>Sans objet : première mise en location du logement, ou logement inoccupé depuis plus de dix-huit mois.</P>
                    ) : (
                      <>
                        <L k="Dernier loyer">{x.dernierLoyer != null ? eurosCts(x.dernierLoyer) : ou(undefined, "dernier loyer")}</L>
                        <L k="Date de versement">{x.dernierLoyerDate ? dateActe(x.dernierLoyerDate) : ou(undefined, "date")}</L>
                        <L k="Date de la dernière révision">{x.derniereRevision ? dateActe(x.derniereRevision) : ou(undefined, "date")}</L>
                      </>
                    )}
                  </>
                )}
                <P className="font-semibold">Modalités de révision</P>
                <L k="Date de révision">{x.revision === "anniversaire" ? "chaque année à la date anniversaire du contrat" : x.revisionDate ? `chaque année le ${dateActe(x.revisionDate, { annee: false })}` : ou(undefined, "date de révision")}</L>
                <L k="Indice de référence des loyers (IRL) publié par l'INSEE">
                  {trimestreTexte(x.irl.trimestre)} trimestre {x.irl.annee} : {valeurIrl(x.irl.valeur)}
                </L>
                <P>
                  Le loyer est révisé chaque année, à la date ci-dessus, selon la variation de l&apos;IRL du même trimestre. Le bailleur dispose d&apos;un an à compter de cette date pour en faire la demande ; la
                  révision ne peut pas être rétroactive. Aucune révision n&apos;est possible pour un logement classé F ou G au diagnostic de performance énergétique.
                </P>

                <P className="font-semibold">Charges récupérables</P>
                <div className="flex flex-wrap gap-x-[5mm]">
                  <Case on={x.chargesMode === "provisions"}>Provisions mensuelles avec régularisation annuelle</Case>
                  <Case on={x.chargesMode === "periodique"}>Remboursement sur justificatif</Case>
                  <Case on={x.chargesMode === "forfait"}>Forfait de charges</Case>
                </div>
                {x.chargesMode === "provisions" && (
                  <P>
                    En même temps et de la même façon que le loyer, le LOCATAIRE acquitte par provision les charges, prestations et impositions récupérables mises à sa charge par la loi et le présent
                    bail, au prorata des tantièmes de copropriété s&apos;il existe un règlement de copropriété, ou selon les modalités du règlement intérieur de l&apos;immeuble, ou toute autre répartition
                    (surface, volume…) : <Texte t={x.chargesDetail} /> Les provisions font l&apos;objet d&apos;une régularisation annuelle.
                  </P>
                )}
                {x.chargesMode === "periodique" && (
                  <P>
                    Les charges récupérables sont remboursées par le LOCATAIRE sur présentation des justificatifs, sans provision : <Texte t={x.chargesDetail} />
                  </P>
                )}
                {x.chargesMode === "forfait" && (
                  <P>
                    Le forfait de charges est versé mensuellement en même temps que le loyer. Il est révisable chaque année aux mêmes conditions que le loyer. Il est fixé en fonction des charges,
                    prestations et impositions récupérables sur le locataire en vertu de la loi et du bail, et ne doit pas être manifestement disproportionné. Il ne donne lieu à aucune régularisation.
                    Il couvre : <Texte t={x.chargesDetail} />
                  </P>
                )}
                {x.chargesMode !== "periodique" && (
                  <L k={x.chargesMode === "forfait" ? "Montant du forfait de charges" : "Montant des provisions sur charges"}>
                    <strong>{euros(x.charges)}</strong> par mois
                  </L>
                )}
                {coloc && (
                  <>
                    <P>
                      Souscription par le bailleur d&apos;une assurance pour le compte des colocataires : <Case on={!!x.assuranceColoc}>Oui</Case>
                      <span className="ml-[3mm]" />
                      <Case on={!x.assuranceColoc}>Non</Case>
                    </P>
                    {x.assuranceColoc && (
                      <>
                        <L k="Montant total annuel récupérable">{x.assuranceColocAnnuelle ? eurosCts(x.assuranceColocAnnuelle) : ou(undefined, "montant annuel")}</L>
                        <L k="Montant récupérable par douzième">{eurosCts(assuranceMois)}</L>
                      </>
                    )}
                  </>
                )}

                <P className="font-semibold">Modalités de paiement</P>
                <L k="Périodicité">
                  mensuelle, <Case on={x.paiement === "echoir"}>paiement à échoir</Case>
                  <span className="ml-[3mm]" />
                  <Case on={x.paiement === "echu"}>à terme échu</Case>
                </L>
                <L k="Date de paiement">{x.jourPaiement}</L>
                <L k="Lieu de paiement">SAS PATRIM</L>
                <div className="acte-bloc mt-[2.5mm] overflow-hidden rounded-[2.5mm] border text-[9pt]" style={{ borderColor: C.line }}>
                  <div className="px-[5mm] py-[2mm] text-[8pt] font-semibold uppercase tracking-[0.12em]" style={{ background: C.cream, color: C.brand }}>
                    Montant dû à la première échéance (période complète)
                  </div>
                  <Ligne k="Loyer" v={euros(x.loyer)} />
                  <Ligne k={x.chargesMode === "forfait" ? "Forfait de charges" : "Provision sur charges"} v={x.chargesMode === "periodique" ? "Sur justificatif" : euros(x.charges ?? 0)} />
                  {coloc && x.assuranceColoc && <Ligne k="Assurance pour le compte des colocataires" v={montantBail(assuranceMois)} />}
                  <Ligne k="TOTAL" v={x.loyer ? montantBail(premiereEcheance(x)) : ou(undefined, "total")} fort />
                </div>
              </Section>

              <Section num={n()} titre="Travaux">
                <L k="Travaux d'amélioration ou de mise en conformité depuis la fin du dernier contrat">{x.travaux?.trim() ? <Texte t={x.travaux.trim()} /> : "Néant"}</L>
                <L k="Majoration du loyer en cours de bail consécutive à des travaux du bailleur">{x.majorationTravaux?.trim() ? <Texte t={x.majorationTravaux.trim()} /> : "Néant"}</L>
                <L k="Diminution du loyer en cours de bail consécutive à des travaux du locataire">{x.diminutionTravaux?.trim() ? <Texte t={x.diminutionTravaux.trim()} /> : "Néant"}</L>
              </Section>

              <Section num={n()} titre="Garanties">
                <P>
                  Montant du dépôt de garantie de l&apos;exécution des obligations du locataire (inférieur ou égal à {meuble ? "deux mois" : "un mois"} de loyer hors charges). Le LOCATAIRE verse, à titre de dépôt de
                  garantie, entre les mains du BAILLEUR ou de son mandataire, la somme de : <strong>{euros(x.depot)}</strong>.
                </P>
                <P>
                  Le dépôt de garantie ne pourra sous aucun prétexte être affecté par le LOCATAIRE au paiement du dernier mois de loyer. Il est restitué dans un délai d&apos;un mois à compter de la remise
                  des clés lorsque l&apos;état des lieux de sortie est conforme à l&apos;état des lieux d&apos;entrée, et de deux mois dans le cas contraire, déduction faite des sommes restant dues et
                  justifiées.
                </P>
              </Section>

              <Section num={n()} titre="Clause de solidarité">
                <P>
                  Il est expressément stipulé que les colocataires et toutes personnes pouvant se prévaloir des dispositions de l&apos;article 14 de la loi du 6 juillet 1989 seront tenus solidairement et
                  indivisiblement de l&apos;exécution des obligations du présent contrat et de toutes obligations ordonnées par décision judiciaire.
                </P>
                {coloc && (
                  <P>
                    <strong>Article 8-1, VI de la loi du 6 juillet 1989 :</strong> la solidarité d&apos;un des colocataires et celle de la personne qui s&apos;est portée caution pour lui prennent fin à la date
                    d&apos;effet du congé régulièrement délivré et lorsqu&apos;un nouveau colocataire figure au bail. À défaut, la solidarité du colocataire sortant s&apos;éteint au plus tard à
                    l&apos;expiration d&apos;un délai de six mois après la date d&apos;effet du congé. L&apos;acte de cautionnement des obligations d&apos;un ou de plusieurs colocataires identifie
                    nécessairement, sous peine de nullité, le colocataire pour lequel le congé met fin à l&apos;engagement de la caution.
                  </P>
                )}
              </Section>

              <Section num={n()} titre="Clause résolutoire">
                <P>
                  Il est expressément convenu qu&apos;à défaut de paiement du dépôt de garantie, ou du paiement intégral à son échéance exacte d&apos;un seul terme de loyer et de ses accessoires, le présent
                  contrat sera résilié de plein droit, si bon semble au BAILLEUR, SIX SEMAINES après un commandement de payer demeuré sans effet, conformément à l&apos;article 24 de la loi du 6 juillet 1989.
                  La résiliation interviendra dans les mêmes conditions UN MOIS après un commandement demeuré sans effet à défaut d&apos;assurance contre les risques locatifs. En cas de non-respect de
                  l&apos;obligation d&apos;user paisiblement des locaux loués, résultant de troubles de voisinage constatés par une décision de justice passée en force de chose jugée, le présent bail sera
                  également résilié de plein droit.
                </P>
                <P>
                  Le LOCATAIRE reste tenu de toutes les obligations découlant du présent bail jusqu&apos;à la libération effective des lieux, sans préjudice de l&apos;article 1760 du Code civil, et ce
                  nonobstant l&apos;expulsion.
                </P>
              </Section>

              <Section num={n()} titre="Honoraires de location">
                <P>
                  Article 5 de la loi du 6 juillet 1989 : la rémunération des personnes mandatées pour la mise en location d&apos;un logement est à la charge exclusive du bailleur, à l&apos;exception des
                  honoraires liés à la visite du preneur, à la constitution de son dossier, à la rédaction du bail et à l&apos;état des lieux d&apos;entrée, partagés entre le bailleur et le preneur. Le montant
                  toutes taxes comprises imputé au preneur pour ces prestations ne peut excéder celui imputé au bailleur et demeure inférieur ou égal à un plafond par mètre carré de surface habitable fixé
                  par voie réglementaire. Les honoraires de visite, de dossier et de bail sont dus à la signature du bail ; ceux de l&apos;état des lieux, à compter de sa réalisation.
                </P>
                <P>
                  Plafonds applicables ({ZONES.find((z) => z.v === x.zone)?.label.toLowerCase()}, baux signés en {PLAFONDS.annee}) : {PLAFONDS.bail[x.zone].toLocaleString("fr-FR")} € TTC par m² de surface
                  habitable pour la visite, la constitution du dossier et la rédaction du bail ; {PLAFONDS.edl.toLocaleString("fr-FR")} € TTC par m² pour l&apos;état des lieux d&apos;entrée.
                </P>
                <div className="acte-bloc mt-[2.5mm] grid grid-cols-2 gap-[4mm] text-[9pt]">
                  <Honoraires titre="À la charge du bailleur" lignes={[["Visite, constitution du dossier, rédaction du bail", ttc(hb.bail)], ["État des lieux d'entrée", ttc(hb.edl)], ...(hb.autres ? ([["Autres prestations", ttc(hb.autres)]] as [string, string][]) : [])]} total={ttc(totalHb)} />
                  <Honoraires titre="À la charge du locataire" lignes={[["Visite, constitution du dossier, rédaction du bail", ttc(hl.bail)], ["État des lieux d'entrée", ttc(hl.edl)]]} total={ttc(totalHl)} />
                </div>
              </Section>

              <Section num={n()} titre="Autres conditions particulières">
                <P>
                  Déclaration du bailleur : le bien a-t-il subi un sinistre ayant donné lieu au versement d&apos;une indemnité d&apos;assurance au titre des catastrophes naturelles ou technologiques (articles
                  L. 125-2 et L. 128-2 du Code des assurances) ? <Case on={x.catnat}>Oui</Case>
                  <span className="ml-[3mm]" />
                  <Case on={!x.catnat}>Non</Case>
                </P>
                <P>
                  Zone d&apos;exposition au bruit des aérodromes (article L. 112-6 du Code de l&apos;urbanisme) : {x.zoneBruit?.trim() ? <strong>zone {x.zoneBruit}</strong> : "le bien n'est pas situé dans une telle zone."}
                </P>
                {x.congePrecedent && (
                  <P>
                    Le bien est actuellement occupé et le locataire en place a donné congé pour le {dateActe(x.congePrecedent)}. Le bailleur s&apos;engage à informer le locataire entrant dans les meilleurs
                    délais de tout retard dans la libération des lieux. En prévision de cet aléa, le locataire procédera aux diligences nécessaires à son emménagement dans les plus courts délais avant la date
                    d&apos;effet du présent bail.
                  </P>
                )}
                {meuble && x.menageSortie && (
                  <P>
                    <strong>Nettoyage :</strong> lors de son départ, le locataire restitue le logement et le mobilier propres. À défaut, le coût du nettoyage nécessaire pourra être déduit du dépôt de
                    garantie, sur présentation de la facture correspondante.
                  </P>
                )}
                {x.conditionsParticulieres?.trim() && (
                  <P className="whitespace-pre-line">
                    <Texte t={x.conditionsParticulieres.trim()} />
                  </P>
                )}
              </Section>

              <Section num={n()} titre="Obligations du locataire">
                <P>Le LOCATAIRE est tenu des obligations générales suivantes :</P>
                <Puces
                  items={[
                    "payer le loyer et les charges récupérables aux termes convenus ;",
                    "user paisiblement des locaux et équipements loués suivant la destination prévue au contrat, ne commettre aucun abus de jouissance susceptible de nuire à la solidité ou à la bonne tenue de l'immeuble, ou d'engager la responsabilité du BAILLEUR envers des tiers ;",
                    `entretenir les lieux loués${meuble ? ", le mobilier" : ""} et les équipements mentionnés au contrat, effectuer les menues réparations ainsi que les réparations locatives définies par décret, et les rendre en bon état, sauf usure normale ;`,
                    "laisser exécuter dans les locaux loués les travaux nécessaires à leur maintien en état, à leur entretien normal, à l'amélioration des parties communes et privatives de l'immeuble ainsi qu'à l'amélioration de la performance énergétique du logement (article 7 e) de la loi du 6 juillet 1989), sauf les samedis, dimanches et jours fériés à défaut d'accord exprès ;",
                    "ne faire aucune transformation, aucun percement de mur ni aucune démolition sans le consentement écrit du BAILLEUR ou de son mandataire ; à défaut, le BAILLEUR pourra exiger la remise immédiate des lieux en l'état, aux frais du LOCATAIRE. Les embellissements ou améliorations faits par le LOCATAIRE resteront acquis au BAILLEUR sans indemnité ;",
                    "s'assurer contre les risques dont il doit répondre en sa qualité de locataire, en justifier lors de la remise des clés puis CHAQUE ANNÉE à la demande du BAILLEUR par la remise d'une attestation ;",
                    "avertir immédiatement le BAILLEUR ou son mandataire de toute dégradation ou de tout sinistre dans les locaux loués, faute de quoi il serait responsable de l'aggravation du dommage ;",
                    "respecter les règlements de salubrité, d'hygiène et de police liés à son occupation et acquitter à leur échéance les impôts et taxes dont il est personnellement redevable ; justifier avant son départ du paiement de ses consommations d'eau, de gaz, d'électricité et autres fournitures ;",
                    "se conformer au règlement intérieur de l'immeuble et au règlement de copropriété, dont les extraits le concernant lui ont été communiqués ;",
                    "ne pas détenir de chien de première catégorie au sens de l'article L. 211-12 du Code rural et de la pêche maritime ;",
                    "pendant le préavis, ou en cas de mise en vente du logement, laisser visiter les locaux loués deux heures par jour les jours ouvrables ;",
                    "souscrire et faire exécuter les contrats d'entretien imposés par la réglementation pour les équipements privatifs (chaudière, ramonage…).",
                  ]}
                />
              </Section>

              <Section num={n()} titre="Obligations du bailleur">
                <P>De son côté, le BAILLEUR est tenu :</P>
                <Puces
                  items={[
                    "de remettre au locataire un logement décent ne laissant pas apparaître de risques manifestes pouvant porter atteinte à la sécurité physique ou à la santé, répondant au critère de performance énergétique minimale et doté des éléments le rendant conforme à l'usage d'habitation (article 6 de la loi du 6 juillet 1989 ; décret n° 2002-120 du 30 janvier 2002) ;",
                    `de délivrer au LOCATAIRE les locaux loués en bon état d'usage et de réparation, et les équipements${meuble ? " et le mobilier" : ""} mentionnés au contrat en bon état de fonctionnement ;`,
                    "d'assurer au LOCATAIRE la jouissance paisible des locaux loués et, sans préjudice de l'article 1721 du Code civil, de le garantir des vices ou défauts de nature à y faire obstacle ;",
                    "d'entretenir les locaux en état de servir à l'usage prévu par le contrat et d'y faire toutes les réparations, autres que locatives, nécessaires au maintien en état et à l'entretien normal des locaux loués ;",
                    "avant le début de tous travaux dans les locaux loués, d'informer le locataire de leur nature et de leurs modalités d'exécution ;",
                    "de ne pas s'opposer aux aménagements réalisés par le LOCATAIRE dès lors qu'ils ne constituent pas une transformation de la chose louée ;",
                    "d'utiliser les droits dont il dispose en propre afin de faire cesser les troubles de voisinage causés à des tiers par les personnes qui occupent ces locaux ;",
                    "de remettre gratuitement une quittance de loyer au locataire qui en fait la demande.",
                  ]}
                />
              </Section>

              <Section num={n()} titre="Annexes">
                <P>Sont annexées et jointes au présent contrat les pièces suivantes :</P>
                <Puces
                  items={[
                    ...(meuble ? ["Inventaire et état détaillé du mobilier (annexe 1 ci-après)"] : []),
                    ...ANNEXES.filter((a) => x.annexes.includes(a)),
                    "Liste des charges récupérables (décret n° 87-713 du 26 août 1987) et liste des réparations locatives (décret n° 87-712 du 26 août 1987)",
                  ]}
                />
                <P>Le LOCATAIRE reconnaît avoir reçu et pris connaissance des documents ci-dessus désignés et annexés.</P>
                <L k="Nombre de clés remises">Cf. état des lieux d&apos;entrée.</L>
              </Section>

              <Section num={n()} titre="Signature électronique">
                <p className="text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                  Pour tous les actes ou documents relatifs à la présente location, comme pour tout acte y afférent (procès-verbaux, attestations, etc.), les parties acceptent une signature en la forme
                  « électronique » via notamment la plateforme de signature en ligne « ICSIGN ». Ces signatures en la forme « électronique » seront opérées sous l&apos;administration de la société PATRIM,
                  Société par actions simplifiée ayant son siège social à TOULOUSE (31000), 45, Allées Jean Jaurès, et immatriculée au registre du commerce et des sociétés de TOULOUSE (31) sous le numéro
                  403 231 145. À ce titre, chacun des intéressés déclare et garantit que son numéro de téléphone portable et son adresse électronique mentionnés ci-dessous sont bien les siens, qu&apos;ils
                  l&apos;identifient personnellement et qu&apos;il est le seul à y avoir accès, de sorte que la signature en la forme « électronique » d&apos;un acte par ce biais manifestera son consentement
                  personnel aux obligations qui en découlent :
                </p>
                <div className="acte-bloc mt-[3mm] overflow-hidden rounded-[2.5mm] border text-[9pt]" style={{ borderColor: C.line }}>
                  {signataires.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-[4mm] border-b px-[5mm] py-[2.2mm] last:border-0" style={{ borderColor: C.line, background: i % 2 ? "#fff" : C.cream }}>
                      <span className="font-medium">
                        {s.nom || ou(undefined, "nom")}
                        <span className="ml-[2mm] text-[8pt] font-normal" style={{ color: C.muted }}>
                          {s.role}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {ou(s.email, "e-mail")} / {ou(telActe(s.tel), "portable")}
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
                Fait par voie électronique à la date indiquée pour chaque signature par voie électronique, en autant d&apos;exemplaires que de parties
              </p>

              {meuble && (
                <Annexe num="Annexe 1" titre="Inventaire et état détaillé du mobilier">
                  <P>Article 25-5 de la loi du 6 juillet 1989. Mobilier minimum (décret n° 2015-981 du 31 juillet 2015) présent dans le logement :</P>
                  <div className="mt-[2mm] grid gap-[1mm] text-[9pt]">
                    {MOBILIER.map((m) => (
                      <Case key={m} on={x.mobilier.includes(m)}>
                        {m}
                      </Case>
                    ))}
                  </div>
                  <P className="mt-[4mm] font-semibold">Inventaire détaillé</P>
                  <P className="whitespace-pre-line">{x.inventaire?.trim() ? <Texte t={x.inventaire.trim()} /> : "Établi contradictoirement avec l'état des lieux d'entrée, dont il fait partie intégrante."}</P>
                </Annexe>
              )}
              <Annexe num={meuble ? "Annexe 2" : "Annexe 1"} titre="Notice d'information" sous="Arrêté du 29 mai 2015 relatif au contenu de la notice d'information annexée aux contrats de location de logement à usage de résidence principale">
                <Blocs blocs={NOTICE} />
              </Annexe>
              <Annexe num={meuble ? "Annexe 3" : "Annexe 2"} titre="Liste des charges récupérables" sous="Décret n° 87-713 du 26 août 1987">
                <Blocs blocs={CHARGES} />
              </Annexe>
              <Annexe num={meuble ? "Annexe 4" : "Annexe 3"} titre="Liste des réparations locatives" sous="Décret n° 87-712 du 26 août 1987">
                <Blocs blocs={REPARATIONS} />
              </Annexe>
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

/** « Monsieur NOM Prénom, né le 01/02/1980 à Toulouse (31), demeurant 12 rue … 31000 Toulouse. » */
function EtatCivil({ p, quoi }: { p: Partie; quoi: string }) {
  const nom = [civiliteLongue(p), p.nom?.toUpperCase(), p.prenom].filter(Boolean).join(" ");
  const date = p.dateNaissance?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return (
    <>
      <strong>{p.nom || p.prenom ? nom : ou(undefined, quoi)}</strong>, {ne(p)} le {date ? `${date[3]}/${date[2]}/${date[1]}` : ou(p.dateNaissance, "date de naissance")} à{" "}
      {ou(p.lieuNaissance, "lieu de naissance")}, demeurant {ou(p.adresse, "adresse")}.
    </>
  );
}

function Personne({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-[0.8mm] pl-[4mm]" style={{ borderColor: C.coral }}>
      {children}
    </div>
  );
}

function Ligne({ k, v, fort }: { k: string; v: ReactNode; fort?: boolean }) {
  return (
    <div className={`flex flex-wrap justify-between gap-x-[4mm] border-t px-[5mm] py-[1.8mm] ${fort ? "font-semibold" : ""}`} style={{ borderColor: C.line }}>
      <span>{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}

function Honoraires({ titre, lignes, total }: { titre: string; lignes: [string, string][]; total: string }) {
  return (
    <div className="overflow-hidden rounded-[2.5mm] border" style={{ borderColor: C.line }}>
      <div className="px-[4mm] py-[2mm] text-[8pt] font-semibold uppercase tracking-[0.1em]" style={{ background: C.cream, color: C.brand }}>
        {titre}
      </div>
      {lignes.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-[3mm] border-t px-[4mm] py-[1.6mm]" style={{ borderColor: C.line }}>
          <span>{k}</span>
          <span className="whitespace-nowrap tabular-nums">{v}</span>
        </div>
      ))}
      <div className="flex justify-between gap-[3mm] border-t px-[4mm] py-[1.8mm] font-semibold" style={{ borderColor: C.line }}>
        <span>Total</span>
        <span className="whitespace-nowrap tabular-nums">{total}</span>
      </div>
    </div>
  );
}

function Puces({ items }: { items: string[] }) {
  return (
    <ul className="mt-[1.5mm] space-y-[1mm]">
      {items.map((t) => (
        <li key={t} className="flex gap-[2.5mm]">
          <span className="mt-[2.2mm] size-[1.3mm] shrink-0 rounded-full" style={{ background: C.coral }} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Annexe({ num, titre, sous, children }: { num: string; titre: string; sous?: string; children: ReactNode }) {
  return (
    <section className="acte-saut pt-[6mm]">
      <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.coral }}>
        {num}
      </div>
      <h2 className="mt-[1mm] font-serif text-[17pt] font-semibold" style={{ color: C.brand }}>
        {titre}
      </h2>
      {sous && (
        <p className="mt-[1mm] text-[8.5pt] italic" style={{ color: C.muted }}>
          {sous}
        </p>
      )}
      <div className="mt-[4mm]">{children}</div>
    </section>
  );
}

/** Textes officiels des annexes, en petit corps. */
function Blocs({ blocs }: { blocs: Bloc[] }) {
  return (
    <div className="text-[8.4pt] leading-[1.45]">
      {blocs.map((b, i) =>
        b.t === "h2" ? (
          <h3 key={i} className="acte-titre mt-[4mm] font-serif text-[12pt] font-semibold first:mt-0" style={{ color: C.brand }}>
            {b.x}
          </h3>
        ) : b.t === "h3" ? (
          <h4 key={i} className="acte-titre mt-[3mm] text-[9.4pt] font-semibold" style={{ color: C.ink }}>
            {b.x}
          </h4>
        ) : b.t === "h4" ? (
          <h5 key={i} className="acte-titre mt-[2mm] text-[8.8pt] font-semibold" style={{ color: C.slate }}>
            {b.x}
          </h5>
        ) : b.t === "li" ? (
          <p key={i} className="mt-[0.8mm] flex gap-[2mm] pl-[2mm]">
            <span style={{ color: C.coral }}>•</span>
            <span>{b.x}</span>
          </p>
        ) : b.t === "note" ? (
          <p key={i} className="mt-[1.5mm] italic" style={{ color: C.muted }}>
            {b.x}
          </p>
        ) : (
          <p key={i} className="mt-[1.5mm]">
            {b.x}
          </p>
        )
      )}
    </div>
  );
}
