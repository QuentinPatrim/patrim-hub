"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { C, MENTIONS, telActe } from "@/components/documents/charte";
import { useActe } from "@/components/documents/archive";
import { ACTE_PRINT_CSS, Pagine, Case, PrixBloc, Section, Texte, ou } from "@/components/documents/blocs";
import { dateLettres, manquants, ne, nomOffre, type Partie } from "@/components/offre/offre";
import { CHAMPS_GESTION, NATURES, TARIFS, USAGES, ecrireGestion, lireGestion, titreGestion, ttc, type Gestion } from "@/components/gestion/gestion";
import { PLAFONDS, eurosCts } from "@/components/location/loi";

/* ============================================================
   Mandat de gestion locative PATRIM, prêt à « Enregistrer en PDF »
   puis à déposer sur ICSIGN. Texte du modèle de l'agence, avec :
   les plafonds légaux des honoraires de location (art. 5 de la loi
   du 6 juillet 1989), la rétractation de 14 jours (art. L221-18 du
   code de la consommation), l'information avant reconduction
   (art. L215-1), sans clause attribuant le litige au tribunal de
   l'agence (réputée non écrite face à un particulier).
   ============================================================ */

const SOCIETE = {
  carte: "CPI 3101 2016 000 013 177",
  garant: "MONTE PASCHI BANQUE",
  garantie: "un million cinq cent soixante mille euros (1 560 000,00 €)",
  garantAdresse: "Paris, 96 av. Raymond Poincaré B.P.89-16 (75762 cedex 16)",
};

const SYNTHESE = [
  "Réception du bien",
  "Recherche et sélection des locataires",
  "Constitution du dossier du locataire",
  "Mise en place du locataire (bail, état des lieux, remise des clés)",
  "Appel des loyers et du dépôt de garantie",
  "Arrêté des charges",
  "Suivi des règlements et relances",
  "Contentieux",
  "Reddition mensuelle des comptes",
  "Aide à la déclaration des revenus fonciers",
  "Démarches auprès des entreprises et suivi des travaux",
  "Paiement des charges de copropriété",
  "Régularisation annuelle des charges",
];

const nb = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const P = ({ children, className = "" }: { children: ReactNode; className?: string }) => <p className={`mt-[2mm] first:mt-0 ${className}`}>{children}</p>;
const Li = ({ children }: { children: ReactNode }) => (
  <li className="relative pl-[4mm] before:absolute before:left-0 before:content-['–']" style={{ marginTop: "1.2mm" }}>
    {children}
  </li>
);

export default function GestionPdf() {
  const { id } = useParams<{ id: string }>();
  const g = useActe(id, "gestion", lireGestion);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!g) return;
    const prev = document.title;
    document.title = `${titreGestion(g)} ${g.mandants.map((p) => [p.civilite, p.nom?.toUpperCase()].filter(Boolean).join(" ")).join(" ")}`.trim();
    return () => {
      document.title = prev;
    };
  }, [g]);

  if (g === undefined) return null;
  if (!g)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Aucun mandat de gestion en cours pour ce bien sur cet appareil.</p>
          <Link href={`/biens/${id}/gestion`} className="mt-3 inline-block underline">
            Rédiger le mandat de gestion
          </Link>
        </div>
      </div>
    );

  const plusieurs = g.mandants.length > 1;
  const nbManquants = g.mandants.reduce((n, p) => n + manquants(p, CHAMPS_GESTION).length, 0) + (g.numero ? 0 : 1) + (g.signataire.email ? 0 : 1) + (g.signataire.tel ? 0 : 1);
  const signataires: { nom: string; email?: string; tel?: string }[] = [...g.mandants.map((p) => ({ nom: nomOffre(p), email: p.email, tel: p.tel })), { nom: g.signataire.nom, email: g.signataire.email, tel: g.signataire.tel }];
  const tarif = (m2: number, limite?: number) => (
    <>
      <strong>{nb(m2)} € TTC</strong> par m² de surface habitable pour chacune des parties, dont {nb(Math.min(3, m2))} € TTC par m² au titre de l&apos;état des lieux
      {limite ? <>, dans la limite de {nb(limite)} % d&apos;un mois de loyer charges comprises</> : null}
    </>
  );

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/biens/${id}/gestion`} onClick={() => ecrireGestion(g)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
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
            <>Prêt pour ICSIGN : enregistre le PDF, puis dépose-le dans ICSIGN avec les signataires de la clause XV.</>
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
                <div>Carte professionnelle n° {SOCIETE.carte}</div>
                <div>RCS 403 231 145</div>
              </div>
            </header>

            <div className="flex items-end justify-between gap-[6mm] px-[18mm] pt-[9mm]">
              <div>
                <div className="h-[3px] w-[16mm]" style={{ background: C.coral }} />
                <h1 className="mt-[4mm] font-serif text-[30pt] font-semibold leading-[1.05]" style={{ color: C.brand }}>
                  Mandat de gestion <span className="whitespace-nowrap">locative</span>
                </h1>
                <div className="mt-[2mm] text-[8.5pt] leading-snug" style={{ color: C.muted }}>
                  Articles 1984 et suivants du Code civil · Articles 64 et 65 du décret du 20 juillet 1972 fixant les conditions d&apos;application de la loi du 2 janvier 1970
                </div>
              </div>
              <div className="shrink-0 rounded-[2.5mm] border px-[5mm] py-[3mm] text-center" style={{ borderColor: C.line }}>
                <div className="text-[7pt] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
                  Mandat n°
                </div>
                <div className="font-serif text-[18pt] font-semibold leading-none" style={{ color: C.ink }}>
                  {g.numero || "—"}
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-[5.5mm] px-[18mm] pt-[8mm] pb-[6mm] text-[9.6pt] leading-[1.52]">
              <section>
                <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
                  Entre les soussignés
                </div>
                <div className="mt-[2.5mm] space-y-[2.5mm]">
                  {g.mandants.map((p, i) => (
                    <Mandant key={p.contactId ?? i} p={p} />
                  ))}
                  {!g.mandants.length && ou(undefined, "propriétaire")}
                </div>
                <P className="mt-[2.5mm]">{g.qualite ? <Texte t={g.qualite} /> : ou(undefined, "qualité")},</P>
                <P>Dénommé{plusieurs ? "s" : ""} ci-après « LE MANDANT » d&apos;une part,</P>
                <P>
                  Et la SAS PATRIM représentée par {g.signataire.nom || ou(undefined, "représentant")} agissant en sa qualité de {g.signataire.qualite || "président"}, dont le siège social est à
                  Toulouse, 45 allées Jean Jaurès (31000), titulaire de la carte professionnelle n° {SOCIETE.carte}, adhérent à la société de caution dénommée « {SOCIETE.garant} », pour un montant de{" "}
                  {SOCIETE.garantie}, dont le siège social est à {SOCIETE.garantAdresse}, laquelle caisse garantit les sommes et valeurs reçues au titre des activités de gestion immobilière.
                </P>
                <P>Dénommé ci-après « LE MANDATAIRE » d&apos;autre part,</P>
                <P className="font-semibold">IL A ÉTÉ FAIT ET CONVENU CE QUI SUIT :</P>
                <P>Le mandant confère par les présentes au mandataire, qui l&apos;accepte, mandat d&apos;administrer le bien suivant :</P>
              </section>

              <Section num="I" titre="Situation, désignation et consistance">
                <div className="acte-bloc rounded-[3mm] px-[5mm] py-[3.5mm]" style={{ background: C.cream }}>
                  <div className="flex flex-wrap gap-x-[5mm] gap-y-[1mm]">
                    {NATURES.filter((n) => n !== "Garage").map((n) => (
                      <Case key={n} on={g.nature === n}>
                        {n}
                        {n === "Autre" && g.nature === "Autre" && g.natureAutre ? ` : ${g.natureAutre}` : ""}
                      </Case>
                    ))}
                    <Case on={g.nature === "Garage" || !!g.garage}>Garage{g.garage ? ` n° ${g.garage}` : ""}</Case>
                    <Case on={!!g.cave}>Cave{g.cave ? ` n° ${g.cave}` : ""}</Case>
                  </div>
                  {g.usage === "habitation" || g.usage === "mixte" ? (
                    <P className="mt-[2.5mm]">
                      Identifiant fiscal du logement et de ses dépendances (location d&apos;habitation principale soumise à la loi du 6 juillet 1989) :{" "}
                      {g.identifiantFiscal?.trim() ? <strong>{g.identifiantFiscal}</strong> : ou(undefined, "identifiant fiscal")}
                    </P>
                  ) : null}
                  <P>Numéro(s) de lot(s) si copropriété : {g.lots?.trim() ? <strong>{g.lots}</strong> : "—"}</P>
                  <P>
                    Immeuble sis <strong>{ou(g.adresseBien, "adresse du bien")}</strong>
                  </P>
                  <P>
                    Équipements d&apos;accès aux technologies de l&apos;information et de la communication : <Case on={g.tic}>oui</Case>
                    <span className="ml-[4mm]">
                      <Case on={!g.tic}>non</Case>
                    </span>
                  </P>
                </div>
              </Section>

              <Section num="II" titre="Usage">
                <div className="flex flex-wrap gap-x-[6mm] gap-y-[1mm]">
                  {USAGES.map((u) => (
                    <Case key={u.v} on={g.usage === u.v}>
                      {u.label}
                    </Case>
                  ))}
                </div>
              </Section>

              <Section num="III" titre="Conditions de location">
                <P>
                  Le mandant s&apos;oblige à faire connaître par écrit au mandataire s&apos;il existe des sujétions particulières, notamment d&apos;ordre réglementaire, concernant le(s) bien(s)
                  (limitation à la fixation du loyer, encadrement des loyers, plafond de ressources, conventionnement…). En outre, le mandant déclare, sous sa responsabilité, ne faire l&apos;objet
                  d&apos;aucune procédure collective, et notamment de redressement judiciaire ou de liquidation de biens, et que les biens objets du présent mandat ne font l&apos;objet d&apos;aucune
                  procédure de saisie immobilière.
                </P>
                <P>{g.vacant ? "Les biens étant vacants lors de la signature, les conditions de leur location figurent en annexe 1 au présent mandat." : "Les biens sont loués lors de la signature : le mandant remet au mandataire le bail en cours, l'état des lieux d'entrée et le dépôt de garantie, ou à défaut tout justificatif de son montant."}</P>
              </Section>

              <Section num="IV" titre="Reddition des comptes">
                <P>
                  Le mandataire rendra compte de sa gestion tous les mois et remettra un état détaillé de tout ce qu&apos;il aura reçu et dépensé, le mandant s&apos;obligeant à lui rembourser tous
                  les frais et avances pour l&apos;exécution du présent mandat.
                </P>
                <P>
                  Modalités de règlement : <strong>virements mensuels</strong>.
                </P>
              </Section>

              <Section num="V" titre="Rémunération">
                <PrixBloc
                  label="Gestion courante"
                  montant={`${nb(g.tauxHt)} % HT + ${nb(g.fixeHt)} € HT par mois`}
                >
                  Soit {nb(ttc(g.tauxHt))} % TTC
                  <div>+ {eurosCts(ttc(g.fixeHt))} TTC par mois</div>
                </PrixBloc>
                <P className="mt-[2.5mm]">
                  Le mandataire aura droit, pour la gestion courante, à une rémunération fixée à {nb(g.tauxHt)} % hors taxes ({nb(ttc(g.tauxHt))} % TTC au taux de TVA de 20 %) des sommes
                  encaissées (loyers, charges, taxes diverses et indemnités d&apos;occupation), augmentée de {eurosCts(g.fixeHt)} hors taxes ({eurosCts(ttc(g.fixeHt))} TTC) par mois.
                </P>
                <P>
                  En sus, pour chaque location ou relocation, il aura droit à des honoraires de visite, de constitution du dossier, de rédaction du bail et d&apos;établissement de l&apos;état des
                  lieux d&apos;entrée, partagés entre le mandant et le locataire. Pour un logement loué vide ou meublé à titre de résidence principale, la part du locataire ne peut excéder celle du
                  mandant ni les plafonds fixés par le décret n° 2014-890 du 1er août 2014 (article 5 de la loi n° 89-462 du 6 juillet 1989) : en {PLAFONDS.annee}, en zone tendue,{" "}
                  {nb(PLAFONDS.bail.tendue)} € TTC par m² de surface habitable pour la visite, le dossier et le bail, et {nb(PLAFONDS.edl)} € TTC par m² pour l&apos;état des lieux. Le tarif de
                  l&apos;agence, périodiquement révisable, est le suivant :
                </P>
                <ul className="acte-bloc mt-[1mm]">
                  <Li>Location vide : {tarif(g.tarifNu, g.limiteNu)} ;</Li>
                  <Li>Location meublée : {tarif(g.tarifMeuble, g.limiteMeuble)}.</Li>
                </ul>
                <div className="mt-[2mm]">
                  <Case on={g.premiereOfferte}>Honoraires de la première mise en location offerts au mandant (la part du locataire reste due).</Case>
                </div>
                <P>
                  Pour les prestations supplémentaires, les honoraires seront calculés selon le tarif de l&apos;agence en annexe 2, périodiquement révisable. Réserve faite des honoraires de
                  location à la charge du locataire, ces rémunérations sont à la charge entière du mandant et seront prélevées sur le compte de gérance.
                </P>
              </Section>

              <Section num="VI" titre="Missions">
                <P>En conséquence du présent mandat, le mandant autorise expressément le mandataire à accomplir tous actes d&apos;administration, et notamment, au titre de la gestion courante :</P>
                <ul className="mt-[1mm] text-[9.2pt]">
                  <Li>
                    gérer le bien désigné ci-dessus ; rechercher des locataires après avoir avisé le mandant de la vacance du logement ; louer le bien, le relouer, renouveler les baux aux prix,
                    charges et conditions que le mandataire jugera à propos, dans le respect de la réglementation ; donner ou accepter tous congés ; dresser ou faire dresser tous états des lieux ;
                    signer ou résilier tous baux et accords ; procéder à la révision des loyers ;
                  </Li>
                  <Li>
                    encaisser, percevoir, déposer tous les loyers, charges, dépôts de garantie, indemnités d&apos;occupation, provisions, ainsi que toutes sommes ou valeurs relatives au bien géré ; en
                    délivrer quittances et décharges ; donner mainlevée de toute saisie et opposition ;
                  </Li>
                  <Li>procéder à tous règlements dans le cadre de la même administration, notamment des charges de copropriété ;</Li>
                  <Li>acquitter les sommes dues au titre des impositions et les recouvrer éventuellement auprès des locataires ; faire toutes réclamations et demandes de dégrèvement ;</Li>
                  <Li>
                    faire exécuter toutes réparations de faible coût, jusqu&apos;à <strong>{eurosCts(g.reparationsMax)} TTC</strong> maximum, et celles plus importantes mais urgentes en avisant
                    rapidement le mandant ; prendre les mesures conservatoires ;
                  </Li>
                  <Li>
                    représenter le mandant devant toutes administrations publiques ou privées, déposer et signer toutes pièces, engagements et contrats, solliciter la délivrance de tous certificats,
                    le tout relativement au bien géré ;
                  </Li>
                  <Li>représenter le mandant lors de la réception du bien objet du mandat ;</Li>
                  <Li>embaucher et congédier le personnel d&apos;entretien ou de gardiennage, fixer les salaires et les conditions de travail ;</Li>
                  <Li>
                    passer et signer tous actes et procès-verbaux, élire domicile, substituer en tout ou partie dans les présents pouvoirs et généralement faire tout ce que le mandataire jugera
                    convenable aux intérêts du mandant ;
                  </Li>
                  <Li>conserver le dépôt de garantie versé par le locataire, pour le compte du mandant, pendant la durée de la gestion.</Li>
                </ul>
              </Section>

              <Section num="VII" titre="Prestations supplémentaires">
                <P>Le mandataire pourra en outre, selon le tarif de l&apos;annexe 2 :</P>
                <ul className="mt-[1mm] text-[9.2pt]">
                  <Li>faire exécuter tous travaux importants après accord écrit du mandant, sauf urgence, et en régler les factures ;</Li>
                  <Li>
                    intervenir auprès des compagnies d&apos;assurances en cas de sinistre (dégât des eaux, incendie…) : {eurosCts(TARIFS.sinistre)} TTC ; en cas d&apos;expertise sur les lieux du
                    sinistre : {eurosCts(TARIFS.expertise)} TTC par vacation ;
                  </Li>
                  <Li>
                    représenter le mandant ou le faire représenter aux assemblées générales des copropriétaires, dans la mesure où le mandataire n&apos;est pas syndic de la copropriété ; le
                    représenter auprès des associations de locataires ; recevoir les convocations du syndic ;
                  </Li>
                  <Li>donner, sur demande du mandant, tous les éléments pour la déclaration annuelle de ses revenus fonciers ;</Li>
                  <Li>
                    en cas de difficultés et à défaut de paiement, exercer toutes poursuites judiciaires, faire tous commandements, sommations, assignations et citations devant tous tribunaux et
                    commissions administratives, se concilier ou requérir jugement, le faire signifier et exécuter, se faire remettre tous titres et pièces ;
                  </Li>
                  <Li>signer et résilier tout contrat, notamment d&apos;assurance.</Li>
                </ul>
                <P>
                  Le présent mandat confère au mandataire une obligation de moyens et non de résultat, sauf en ce qui concerne éventuellement le paiement des loyers dans la mesure où un contrat de
                  garantie des loyers a été souscrit pour le bien objet des présentes, et dans les conditions de ce contrat.
                </P>
                <P>
                  En cas de libération des locaux et de non-relocation à la demande du mandant, par exemple en cas de reprise des locaux ou de vente, celui-ci redevient le gardien juridique du bien. Il lui
                  appartient alors de prendre toute disposition pour assurer la conservation de son bien et de souscrire toute assurance qu&apos;il estimerait nécessaire.
                </P>
              </Section>

              <Section num="VIII" titre="Durée">
                <P className="font-semibold uppercase text-[9pt]">
                  Ce mandat est donné pour une durée d&apos;un an à compter du {g.date ? dateLettres(g.date) : ou(undefined, "date")}, renouvelable par tacite reconduction d&apos;année en année,
                  cette reconduction étant limitée à vingt-neuf ans. Chacune des parties pourra y mettre fin par lettre recommandée avec avis de réception adressée trois mois avant la date
                  anniversaire de la signature des présentes.
                </P>
                <P>
                  Conformément à l&apos;article L215-1 du code de la consommation, le mandataire informera le mandant, au plus tôt trois mois et au plus tard un mois avant le terme de chaque période,
                  de la possibilité de ne pas reconduire le mandat.
                </P>
                <P>S&apos;il accepte la résiliation du mandat en cours d&apos;année, le mandataire aura droit à une indemnité fixée au montant des honoraires de gestion d&apos;un trimestre.</P>
                <P>
                  En cas de décès du mandant, et par dérogation expresse à l&apos;article 2003 du Code civil, le présent mandat se poursuivra avec ses héritiers, fussent-ils mineurs ou autrement
                  incapables, sous réserve de la faculté de résiliation dans les conditions ci-dessus.
                </P>
              </Section>

              <Section num="IX" titre="Faculté de rétractation du mandant">
                <P>
                  Lorsque le présent mandat est conclu à distance, notamment par signature électronique, ou hors établissement, le mandant, s&apos;il agit en qualité de consommateur, a la faculté de
                  se rétracter dans un délai de QUATORZE JOURS à compter de sa signature, sans avoir à motiver sa décision (articles L221-18 et suivants du code de la consommation).
                </P>
                <P>
                  Pour l&apos;exercer, il utilise le formulaire figurant en annexe 4 ou toute autre déclaration dénuée d&apos;ambiguïté, adressée au mandataire par lettre recommandée avec avis de
                  réception ou par courrier électronique. Le délai expire le quatorzième jour à minuit ; s&apos;il expire un samedi, un dimanche ou un jour férié, il est prolongé jusqu&apos;au premier
                  jour ouvrable suivant.
                </P>
                <P>
                  Les missions du mandataire ne débutent qu&apos;à l&apos;expiration de ce délai, sauf demande expresse du mandant. Dans ce dernier cas, s&apos;il se rétracte, le mandant ne doit au
                  mandataire que la rémunération correspondant au service fourni jusqu&apos;à la communication de sa décision (article L221-25 du code de la consommation).
                </P>
                <div className="mt-[2mm]">
                  <Case on={!!g.executionImmediate}>
                    Le mandant demande expressément que l&apos;exécution du mandat commence avant la fin du délai de rétractation. Il conserve sa faculté de rétractation.
                  </Case>
                </div>
              </Section>

              <Section num="X" titre="Substitution, cession">
                <P>
                  Le mandant autorise expressément le mandataire ou ses ayants droit à se substituer, pour l&apos;exécution du présent mandat, toute personne physique ou morale de son choix, en cas de
                  décès ou d&apos;incapacité du mandataire, sous réserve que le substitué remplisse les conditions de la loi du 2 janvier 1970.
                </P>
                <P>
                  En cas de cession de son fonds de commerce par le mandataire, ou s&apos;il en confie l&apos;exploitation à un locataire-gérant, le présent mandat se poursuivra au profit du cessionnaire
                  ou du locataire-gérant, ce que le mandant accepte expressément, sous réserve que le successeur remplisse les conditions de la loi du 2 janvier 1970.
                </P>
                <P>
                  Dans tous ces cas, le mandant en sera avisé dans les meilleurs délais, et au plus tard dans les six mois de la substitution, de la cession ou de la location-gérance. Il pourra alors
                  résilier le présent mandat dans le mois qui suit la réception de cet avis, par lettre recommandée avec avis de réception adressée au nouveau mandataire ; la résiliation prendra effet
                  un mois après sa réception.
                </P>
              </Section>

              <Section num="XI" titre="Mise en vente du bien géré">
                <P>
                  Sans préjudice des pouvoirs ci-dessus conférés au mandataire, le mandant qui souhaite donner congé pour vente devra préalablement donner pouvoir exprès au mandataire à cet effet,
                  en précisant le prix et les conditions de la vente projetée. En cas de mise en vente du bien géré, et si la transaction n&apos;est pas confiée au mandataire, le mandant s&apos;oblige à
                  l&apos;en informer dans un délai de quinze jours.
                </P>
              </Section>

              <Section num="XII" titre="Conditions particulières">
                <P className="whitespace-pre-line">{g.conditionsParticulieres?.trim() ? <Texte t={g.conditionsParticulieres.trim()} /> : "Néant."}</P>
              </Section>

              <Section num="XIII" titre="Discrimination">
                <P>
                  Les parties prennent l&apos;engagement exprès de n&apos;opposer à un candidat à la location des présents biens aucun refus fondé sur un motif discriminatoire au sens de l&apos;article
                  225-1 du code pénal. Toute discrimination commise à l&apos;égard d&apos;une personne est punie de trois ans d&apos;emprisonnement et 45 000 euros d&apos;amende (article 225-2 du code
                  pénal).
                </P>
              </Section>

              <Section num="XIV" titre="Médiation, données personnelles">
                <P>
                  Tout consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable du litige qui l&apos;oppose à un professionnel (articles L611-1
                  et suivants du Code de la consommation). Notre médiateur : Association MEDIMMOCONSO, 1 allée du Parc de Mesemena, Bât A, CS 25222, 44505 La Baule Cedex. Site internet :
                  medimmoconso.fr/adresser-une-reclamation/
                </P>
                <P>
                  Le mandataire collecte et traite les données personnelles nécessaires à sa mission : exécuter le présent mandat, diffuser les données du bien à louer, exécuter les baux, administrer
                  le bien, établir les documents juridiques et comptables, faire réaliser des travaux et respecter ses obligations légales (lutte contre le blanchiment par exemple). Elles ne sont
                  communiquées qu&apos;aux personnes qui interviennent pour ces besoins (locataires, syndic, artisans, assureurs, administrations) et sont conservées pendant la durée du mandat, puis
                  pendant les délais de prescription légaux.
                </P>
                <div className="mt-[2mm]">
                  <Case on={g.prospection}>J&apos;accepte de recevoir de la prospection commerciale sur mon adresse mail.</Case>
                </div>
                <P>
                  Le mandant dispose d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de portabilité, de limitation et d&apos;opposition, ainsi que du droit d&apos;introduire une
                  réclamation auprès de la CNIL. Pour toute demande : SAS PATRIM, responsable du traitement, 45 allées Jean Jaurès, 31000 Toulouse.
                </P>
              </Section>

              <Section num="XV" titre="Signature électronique">
                <p className="text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                  Pour tous les actes ou documents relatifs à la présente gestion, comme pour tout acte y afférent (procès-verbaux, attestations, etc.), les parties acceptent une signature en la forme
                  « électronique » via notamment la plateforme de signature en ligne « ICSIGN ». Ces signatures en la forme « électronique » seront opérées sous l&apos;administration de la société
                  PATRIM, Société par actions simplifiée ayant son siège social à TOULOUSE (31000), 45, Allées Jean Jaurès, et immatriculée au registre du commerce et des sociétés de TOULOUSE (31) sous
                  le numéro 403 231 145. À ce titre, chacun des intéressés déclare et garantit que son numéro de téléphone portable et son adresse électronique mentionnés ci-dessous sont bien les
                  siens, qu&apos;ils l&apos;identifient personnellement et qu&apos;il est le seul à y avoir accès, de sorte que la signature en la forme « électronique » d&apos;un acte par ce biais
                  manifestera son consentement personnel aux obligations qui en découlent :
                </p>
                <div className="acte-bloc mt-[3mm] overflow-hidden rounded-[2.5mm] border text-[9pt]" style={{ borderColor: C.line }}>
                  {signataires.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-[4mm] border-b px-[5mm] py-[2.2mm] last:border-0" style={{ borderColor: C.line, background: i % 2 ? "#fff" : C.cream }}>
                      <span className="font-medium">
                        {s.nom || ou(undefined, "nom")}
                        <span className="ml-[2mm] text-[8pt] font-normal" style={{ color: C.muted }}>
                          {i < g.mandants.length ? "Mandant" : "Mandataire"}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {ou(s.email, "e-mail")} / {ou(telActe(s.tel), "portable")}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-[3mm] text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                  De même, chacun des signataires reconnaît que la signature électronique vaudra signature manuscrite, aura une valeur probante équivalente à une signature manuscrite pour lui-même ou
                  pour la partie à l&apos;acte dont il sera le signataire et qu&apos;il renonce de manière irrévocable et définitive à contester la valeur juridique et/ou l&apos;opposabilité de ladite
                  signature électronique. S&apos;agissant en la présente d&apos;un acte sous forme électronique, il sera communiqué aux parties des exemplaires numériques leur permettant de disposer
                  d&apos;un exemplaire sur support durable ou d&apos;y avoir accès.
                </p>
              </Section>

              <p className="acte-bloc pt-[2mm] text-center text-[9pt] font-semibold uppercase tracking-[0.12em]" style={{ color: C.brand }}>
                Fait par voie électronique à la date indiquée pour chaque signature par voie électronique, en autant d&apos;exemplaires que de parties
              </p>

              {/* Annexes */}
              <section className="acte-saut space-y-[5.5mm] pt-[6mm]">
                {g.vacant && (
                  <Annexe n={1} titre="Conditions de location">
                    <div className="acte-bloc rounded-[3mm] px-[5mm] py-[3.5mm]" style={{ background: C.cream }}>
                      <P>
                        Type de location : <Case on={!g.meuble}>vide</Case>
                        <span className="ml-[4mm]">
                          <Case on={!!g.meuble}>meublée</Case>
                        </span>
                      </P>
                      <P>Loyer mensuel souhaité, hors charges : {g.loyerSouhaite ? <strong>{eurosCts(g.loyerSouhaite)}</strong> : ou(undefined, "loyer")}</P>
                      <P>Provision ou forfait de charges par mois : {g.chargesSouhaitees != null ? <strong>{eurosCts(g.chargesSouhaitees)}</strong> : ou(undefined, "charges")}</P>
                      <P>Disponibilité : {g.disponible ? dateLettres(g.disponible) : "immédiate"}</P>
                    </div>
                    <P>
                      Le loyer sera fixé dans le respect des règles en vigueur à la date du bail (encadrement de l&apos;évolution des loyers à la relocation en zone tendue, gel des loyers des logements
                      classés F ou G, interdiction de louer les logements ne respectant pas le niveau de performance énergétique minimal).
                    </P>
                  </Annexe>
                )}

                <Annexe n={2} titre="Tarif des prestations supplémentaires">
                  <div className="acte-bloc overflow-hidden rounded-[2.5mm] border text-[9pt]" style={{ borderColor: C.line }}>
                    {(
                      [
                        ["Représentation à une assemblée générale de copropriétaires (l'envoi des consignes de vote est gratuit)", `${eurosCts(TARIFS.assemblee)} TTC`],
                        ["Aide à la déclaration des revenus fonciers", `${eurosCts(TARIFS.declaration)} TTC par an`],
                        ["Intervention auprès de l'assureur en cas de sinistre", `${eurosCts(TARIFS.sinistre)} TTC`],
                        ["Expertise sur les lieux du sinistre", `${eurosCts(TARIFS.expertise)} TTC par vacation`],
                      ] as [string, string][]
                    ).map(([l, v], i) => (
                      <div key={l} className="flex items-baseline justify-between gap-[4mm] border-b px-[5mm] py-[2mm] last:border-0" style={{ borderColor: C.line, background: i % 2 ? "#fff" : C.cream }}>
                        <span>{l}</span>
                        <span className="shrink-0 font-medium tabular-nums">{v}</span>
                      </div>
                    ))}
                  </div>
                  <P className="mt-[3mm] font-semibold">Assurances proposées par l&apos;intermédiaire de l&apos;agence (bulletin d&apos;adhésion séparé) :</P>
                  <div className="acte-bloc mt-[1.5mm] space-y-[1.2mm]">
                    <div>
                      <Case on={g.gli}>
                        Garantie des loyers impayés : {nb(TARIFS.gli)} % TTC des sommes encaissées. Le bailleur qui a souscrit cette garantie ne peut pas demander de caution, sauf au locataire étudiant
                        ou apprenti (article 22-1 de la loi du 6 juillet 1989).
                      </Case>
                    </div>
                    <div>
                      <Case on={g.pj}>
                        Protection juridique : {TARIFS.pj.habitation} € TTC par an et par lot d&apos;habitation, {TARIFS.pj.meuble} € pour un meublé, {TARIFS.pj.commercial} € pour un local commercial.
                      </Case>
                    </div>
                    <div>
                      <Case on={g.pno}>
                        Assurance propriétaire non occupant : {TARIFS.pno.appartement} € TTC par an pour un appartement, {TARIFS.pno.commercial} € pour un local commercial, professionnel ou mixte.
                      </Case>
                    </div>
                  </div>
                </Annexe>

                <Annexe n={3} titre="Synthèse du mandat de gestion">
                  <div className="acte-bloc grid grid-cols-2 gap-x-[6mm] gap-y-[1.2mm] text-[9pt]">
                    {SYNTHESE.map((s) => (
                      <Case key={s} on>
                        {s}
                      </Case>
                    ))}
                  </div>
                </Annexe>

                <div className="acte-bloc rounded-[3mm] border-[0.4mm] border-dashed px-[7mm] py-[6mm]" style={{ borderColor: C.line }}>
                  <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.coral }}>
                    Annexe 4
                  </div>
                  <h2 className="mt-[1mm] font-serif text-[16pt] font-semibold" style={{ color: C.brand }}>
                    Formulaire de rétractation
                  </h2>
                  <p className="mt-[1.5mm] text-[8.5pt] italic" style={{ color: C.muted }}>
                    Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du mandat de gestion n° {g.numero || "……"}.
                  </p>
                  <div className="mt-[4mm] space-y-[3mm] text-[9.6pt]">
                    <p>À l&apos;attention de SAS PATRIM, 45 allées Jean Jaurès, 31000 Toulouse – gestion@patrim.fr – Tél. 05 61 99 08 08.</p>
                    <p>
                      Je/Nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la prestation de services ci-dessous : mandat de gestion locative n°{" "}
                      {g.numero || "……"}.
                    </p>
                    <p>Signé le : ……………………………………</p>
                    <p>Nom du (des) mandant(s) : ……………………………………………………………………</p>
                    <p>Adresse du (des) mandant(s) : ……………………………………………………………………</p>
                    <p>Signature du (des) mandant(s) (uniquement en cas de notification du présent formulaire sur papier) :</p>
                    <div className="h-[22mm]" />
                    <p>Date : ……………………</p>
                    <p className="text-[8pt]" style={{ color: C.muted }}>
                      (*) Rayez la mention inutile.
                    </p>
                  </div>
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

function Annexe({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return (
    <section>
      <div className="acte-bloc acte-titre">
        <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.coral }}>
          Annexe {n}
        </div>
        <h2 className="mt-[1mm] font-serif text-[16pt] font-semibold" style={{ color: C.brand }}>
          {titre}
        </h2>
      </div>
      <div className="mt-[2.5mm]">{children}</div>
    </section>
  );
}

/** « Madame Prénom NOM demeurant …, née le … à … » + profession et coordonnées. */
function Mandant({ p }: { p: Partie }) {
  return (
    <div className="border-l-[0.8mm] pl-[4mm]" style={{ borderColor: C.coral }}>
      <p>
        <strong>{nomOffre(p) || ou(undefined, "nom")}</strong> demeurant {ou(p.adresse, "adresse complète")}, {ne(p)} le {ou(dateLettres(p.dateNaissance), "date de naissance")} à{" "}
        {ou(p.lieuNaissance, "lieu de naissance")}.
      </p>
      <p className="text-[9pt]" style={{ color: C.slate }}>
        Profession : {ou(p.profession, "profession")} · Portable : {ou(telActe(p.tel), "portable")} · Mail : {ou(p.email, "e-mail")}
      </p>
    </div>
  );
}
