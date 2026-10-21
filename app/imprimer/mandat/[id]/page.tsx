"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { C, MENTIONS, montantComplet, telActe } from "@/components/documents/charte";
import { useActe } from "@/components/documents/archive";
import { ACTE_PRINT_CSS, Pagine, Case, PrixBloc, Section, Texte, ou } from "@/components/documents/blocs";
import { dateLettres, manquants, ne, nomOffre, type Partie } from "@/components/offre/offre";
import { CHAMPS_MANDAT, DIAGNOSTICS, NATURES, avecExclusivite, dureeLettres, ecrireMandat, lireMandat, titreMandat, typeMandat, type Mandat } from "@/components/mandat/mandat";
import { BoutonPdf, nommerPdf } from "@/components/documents/BoutonPdf";

/* ============================================================
   Mandat de vente PATRIM (simple, semi-exclusif ou exclusif), prêt à
   « Enregistrer en PDF » puis à déposer sur ICSIGN. Texte du modèle
   de l'agence ; clauses d'exclusivité selon l'article 78 du décret
   n° 72-678 du 20 juillet 1972.
   ============================================================ */

const SOCIETE = {
  carte: "CPI 3101 2016 000 013 177",
  garant: "MONTE PASCHI BANQUE",
  garantie: "un million cinq cent soixante mille euros (1 560 000,00 €)",
  garantAdresse: "Paris, 96 av. Raymond Poincaré B.P.89-16 (75762 cedex 16)",
};

const P = ({ children, className = "" }: { children: ReactNode; className?: string }) => <p className={`mt-[2mm] first:mt-0 ${className}`}>{children}</p>;

export default function MandatPdf() {
  const { id } = useParams<{ id: string }>();
  const m = useActe(id, "mandat", lireMandat);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!m) return;
    const prev = document.title;
    document.title = nommerPdf(`${titreMandat(m)} ${m.mandants.map((p) => [p.civilite, p.nom?.toUpperCase()].filter(Boolean).join(" ")).join(" ")}`.trim());
    return () => {
      document.title = prev;
    };
  }, [m]);

  if (m === undefined) return null;
  if (!m)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Aucun mandat en cours pour ce bien sur cet appareil.</p>
          <Link href={`/biens/${id}/mandat`} className="mt-3 inline-block underline">
            Rédiger le mandat
          </Link>
        </div>
      </div>
    );

  const plusieurs = m.mandants.length > 1;
  const nous = (pl: string, sg: string) => (plusieurs ? pl : sg);
  const nbManquants =
    m.mandants.reduce((n, p) => n + manquants(p, CHAMPS_MANDAT).length, 0) + (m.netVendeur ? 0 : 1) + (m.honoraires != null ? 0 : 1) + (m.numero ? 0 : 1) + (m.signataire.email ? 0 : 1) + (m.signataire.tel ? 0 : 1) +
    (avecExclusivite(m) ? (m.actions?.trim() ? 0 : 1) + (m.comptesRendus?.trim() ? 0 : 1) : 0);
  const signataires: { nom: string; email?: string; tel?: string }[] = [...m.mandants.map((p) => ({ nom: nomOffre(p), email: p.email, tel: p.tel })), { nom: m.signataire.nom, email: m.signataire.email, tel: m.signataire.tel }];

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/biens/${id}/mandat`} onClick={() => ecrireMandat(m)} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
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
            <>Prêt pour ICSIGN : enregistre le PDF, puis dépose-le dans ICSIGN avec les signataires de la clause XVIII.</>
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
                {titreMandat(m).replace(/ (\S+)$/, "")} <span className="whitespace-nowrap">{titreMandat(m).split(" ").pop()}</span>
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
                {m.numero || "—"}
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
                {m.mandants.map((p, i) => (
                  <Mandant key={p.contactId ?? i} p={p} />
                ))}
                {!m.mandants.length && ou(undefined, "vendeur")}
              </div>
              <P className="mt-[2.5mm]">
                {m.qualite ? <Texte t={m.qualite} /> : ou(undefined, "qualité")}, {nous("vous mandatons", "vous mandate")} par la présente
                {typeMandat(m) === "exclusif" ? ", à titre exclusif," : typeMandat(m) === "semi_exclusif" ? ", à titre semi-exclusif," : ""} afin de rechercher un acquéreur et faire toutes les démarches en vue de vendre les biens et droits ci-dessous désignés,{" "}
                {nous("nous engageant", "m'engageant")} à produire toutes justifications de propriété.
              </P>
              <P>Dénommé ci-après « LE MANDANT » d&apos;une part,</P>
              <P>
                Et la SAS PATRIM représentée par {m.signataire.nom || ou(undefined, "représentant")} agissant en sa qualité de {m.signataire.qualite || "président"}, dont le siège social est à
                Toulouse, 45 allées Jean Jaurès (31000), titulaire de la carte professionnelle n° {SOCIETE.carte}, adhérent à la société de caution dénommée « {SOCIETE.garant} », pour un montant de{" "}
                {SOCIETE.garantie}, dont le siège social est à {SOCIETE.garantAdresse}, laquelle caisse garantit les sommes et valeurs reçues au titre des activités de transaction immobilière.
              </P>
              <P>Dénommé ci-après « LE MANDATAIRE » d&apos;autre part,</P>
              <P className="font-semibold">IL A ÉTÉ FAIT ET CONVENU CE QUI SUIT :</P>
              <P>Le mandant confère par les présentes au mandataire, qui l&apos;accepte, mandat de vendre le bien suivant :</P>
            </section>

            <Section num="I" titre="Situation, désignation et consistance">
              <div className="acte-bloc rounded-[3mm] px-[5mm] py-[3.5mm]" style={{ background: C.cream }}>
                <div className="flex flex-wrap gap-x-[5mm] gap-y-[1mm]">
                  {NATURES.map((n) => (
                    <Case key={n} on={m.nature === n}>
                      {n}
                      {n === "Autre" && m.nature === "Autre" && m.natureAutre ? ` : ${m.natureAutre}` : ""}
                    </Case>
                  ))}
                </div>
                <P className="mt-[2.5mm]">Numéro(s) de lot(s) si copropriété : {m.lots?.trim() ? <strong>{m.lots}</strong> : "—"}</P>
                <P>
                  Bien sis <strong>{ou(m.adresseBien, "adresse du bien")}</strong>
                </P>
                <P>
                  Le bien est vendu : <Case on={m.occupation === "libre"}>libre de toute occupation</Case>
                  <span className="ml-[4mm]">
                    <Case on={m.occupation === "loue"}>loué selon le contrat de bail ci-annexé</Case>
                  </span>
                </P>
              </div>
            </Section>

            <Section num="II" titre="Prix">
              <P>Le prix demandé par le mandant, vendeur des biens et droits ci-avant désignés, est, sauf accord ultérieur, de :</P>
              <PrixBloc className="mt-[2.5mm]" label="Prix net vendeur" montant={m.netVendeur ? `${m.netVendeur.toLocaleString("fr-FR")} €` : "—"}>
                {m.netVendeur != null && m.honoraires != null && (
                  <>
                    Prix de présentation
                    <div>{(m.netVendeur + m.honoraires).toLocaleString("fr-FR")} € honoraires inclus</div>
                  </>
                )}
              </PrixBloc>
              <P className="mt-[2.5mm]">
                <strong>{m.netVendeur ? montantComplet(m.netVendeur) : ou(undefined, "prix")} net vendeur</strong>, payable comptant le jour de la signature de l&apos;acte authentique, tant à
                l&apos;aide de prêts que de fonds propres de l&apos;acquéreur.
              </P>
            </Section>

            <Section num="III" titre="Honoraires d'agence">
              <P>
                Les honoraires seront de : <strong>{m.honoraires != null ? `${montantComplet(m.honoraires)} TTC` : ou(undefined, "honoraires")}</strong>.
              </P>
              <div className="mt-[1.5mm] flex flex-wrap gap-x-[6mm]">
                <Case on={m.charge === "acquereur"}>Honoraires à la charge de l&apos;acquéreur</Case>
                <Case on={m.charge === "vendeur"}>Honoraires à la charge du vendeur</Case>
              </div>
              <P>
                Ils seront exigibles le jour où l&apos;opération sera effectivement conclue et constatée dans un acte écrit, signé des deux parties, conformément à l&apos;article 74 du décret n° 72-678 du
                20 juillet 1972.
              </P>
            </Section>

            <Section num="IV" titre="Conditions particulières">
              <P className="whitespace-pre-line">{m.conditionsParticulieres?.trim() ? <Texte t={m.conditionsParticulieres.trim()} /> : "Néant."}</P>
            </Section>

            <Section num="V" titre="Superficie privative « loi Carrez »">
              <P>{m.carrez?.trim() ? <strong>{m.carrez}</strong> : m.lots?.trim() ? ou(undefined, "surface Carrez") : "Sans objet (hors copropriété) ou à fournir par le mandant."}</P>
            </Section>

            <Section num="VI" titre="Moyens de diffusion des annonces commerciales">
              <P>{ou(m.diffusion, "moyens de diffusion")}</P>
            </Section>

            <Section num="VII" titre="Actions particulières">
              <P className="whitespace-pre-line">{m.actions?.trim() || (avecExclusivite(m) ? ou(undefined, "actions de l'agence") : "Néant.")}</P>
            </Section>

            <Section num="VIII" titre="Modalités de comptes rendus">
              <P>{m.comptesRendus?.trim() || (avecExclusivite(m) ? ou(undefined, "comptes rendus") : "Néant.")}</P>
            </Section>

            <Section num="IX" titre="Dossier de diagnostic technique">
              <P>Documents déjà détenus par le mandant :</P>
              <div className="acte-bloc mt-[2mm] grid grid-cols-2 gap-x-[6mm] gap-y-[1mm] text-[9pt]">
                {DIAGNOSTICS.map((d) => (
                  <Case key={d} on={m.diagnostics.includes(d)}>
                    {d}
                  </Case>
                ))}
              </div>
              <P className="mt-[2.5mm]">À défaut de détention des expertises mentionnées ci-dessus par le(s) mandant(s), le mandataire pourra diligenter la réalisation des diagnostics techniques.</P>
            </Section>

            <Section num="X" titre="Plus-value et T.V.A.">
              <P>
                Les parties reconnaissent avoir été informées des dispositions fiscales concernant les plus-values et déclarent agir en toute connaissance de cause. Si la vente est assujettie à la
                T.V.A., le prix ci-dessus stipulé s&apos;entend T.V.A. incluse.
              </P>
            </Section>

            <Section num="XI" titre="Durée du mandat">
              <P className="font-semibold uppercase text-[9pt]">
                Ce mandat vous est consenti pour une durée de {dureeLettres(m.dureeMois)} mois ({m.dureeMois}) prenant effet ce jour{m.date ? `, ${dateLettres(m.date)}` : ""}, dont{" "}
                {avecExclusivite(m) ? "les trois premiers mois sont irrévocables" : "le premier mois est irrévocable"}. Au terme de cette période d&apos;irrévocabilité, le mandat pourra être dénoncé à tout moment par chacune des parties, à charge pour celle qui entend y mettre fin d&apos;en aviser
                l&apos;autre partie quinze jours à l&apos;avance par lettre recommandée avec avis de réception.
              </P>
              <P>Les prescriptions de l&apos;article L 136-1 recodifié à l&apos;article L 215-1 du code de la consommation ne sont pas applicables au présent contrat.</P>
            </Section>

            <Section num="XII" titre="Obligations du mandant">
              {typeMandat(m) === "exclusif" && (
                <div className="acte-bloc mb-[2.5mm] rounded-[2.5mm] border-[0.4mm] px-[5mm] py-[3mm] text-[9pt] font-semibold uppercase" style={{ borderColor: C.brand }}>
                  Clause d&apos;exclusivité : pendant toute la durée du présent mandat, {nous("nous nous interdisons", "je m'interdis")} de négocier ou de vendre, directement ou par
                  l&apos;intermédiaire d&apos;un autre mandataire, les biens objet des présentes. {nous("Nous nous engageons", "Je m'engage")} à diriger vers le mandataire toutes les demandes qui{" "}
                  {nous("nous", "me")} seraient adressées directement. Clause pénale : en cas de manquement à cette obligation, {nous("nous vous règlerons", "je vous règlerai")} une indemnité
                  compensatrice forfaitaire d&apos;un montant égal à la rémunération convenue au présent mandat (article 78 du décret n° 72-678 du 20 juillet 1972).
                </div>
              )}
              {typeMandat(m) === "semi_exclusif" && (
                <div className="acte-bloc mb-[2.5mm] rounded-[2.5mm] border-[0.4mm] px-[5mm] py-[3mm] text-[9pt] font-semibold uppercase" style={{ borderColor: C.brand }}>
                  Clause de semi-exclusivité : pendant toute la durée du présent mandat, {nous("nous nous interdisons", "je m'interdis")} de confier la vente des biens objet des présentes à
                  un autre intermédiaire. {nous("Nous conservons", "Je conserve")} toutefois la faculté de vendre directement, sans intermédiaire, à un acquéreur trouvé par{" "}
                  {nous("nos", "mes")} propres moyens et qui ne {nous("nous", "m'")}
                  {plusieurs ? " " : ""}aurait pas été présenté par le mandataire, à un prix net vendeur qui ne pourra être inférieur à celui fixé aux présentes, à charge d&apos;en informer le
                  mandataire sans délai par lettre recommandée avec avis de réception, en lui indiquant les coordonnées de l&apos;acquéreur et du notaire chargé de la vente ; dans ce cas, aucune
                  rémunération ne sera due au mandataire. Clause pénale : en cas de manquement à ces obligations, {nous("nous vous règlerons", "je vous règlerai")} une indemnité compensatrice
                  forfaitaire d&apos;un montant égal à la rémunération convenue au présent mandat (article 78 du décret n° 72-678 du 20 juillet 1972).
                </div>
              )}
              <P>
                Pendant une période de deux ans après expiration du mandat, {nous("nous nous interdisons", "je m'interdis")} de vendre sans votre concours, y compris par un autre intermédiaire, à un
                acquéreur qui {nous("nous", "m'")}
                {plusieurs ? " " : ""}aurait été présenté par vous pendant la période de validité du mandat.
              </P>
              <P className="font-semibold uppercase text-[9pt]">
                Clause pénale : en cas de violation de {nous("notre", "mon")} obligation énoncée ci-dessus, {nous("nous vous règlerons", "je vous règlerai")} une indemnité compensatrice forfaitaire,
                d&apos;un montant égal à la rémunération convenue au présent mandat.
              </P>
              <P>
                Pendant la durée du mandat, {nous("nous nous engageons", "je m'engage")} à examiner toutes les offres reçues par votre intermédiaire. En cas de présentation d&apos;une offre aux prix et
                conditions des présentes et de refus de {nous("notre", "ma")} part de vendre {nous("notre", "mon")} bien au candidat acquéreur présenté sans motif,{" "}
                {nous("nous conviendrons", "je conviendrai")} d&apos;un avenant au présent mandat en vue de modifier le prix ou les autres conditions de vente désormais désirées afin de poursuivre la
                commercialisation. À défaut, vous aurez la faculté de renoncer à votre mandat sans préavis, {nous("notre", "mon")} refus vous empêchant d&apos;accomplir votre mission.
              </P>
            </Section>

            <Section num="XIII" titre="Pouvoirs du mandataire">
              <P>En considération du mandat présentement accordé, tous pouvoirs sont donnés au mandataire pour mener à bien ladite mission. Notamment :</P>
              <ol className="mt-[2mm] list-decimal space-y-[1.6mm] pl-[5mm] text-[9.2pt]">
                <li>
                  Faire tout ce qui sera utile pour parvenir à la vente, et notamment toute publicité sur tous supports adéquats, y compris sur fichiers informatiques librement accessibles (internet…)
                  mais aux frais seulement du mandataire ; apposer un panneau de mise en vente à l&apos;endroit jugé le plus approprié ; publier toute photographie, étant entendu que les mandants sont
                  seuls propriétaires du droit à l&apos;image dudit bien. Le bien ne pourra faire l&apos;objet d&apos;une campagne publicitaire publique qu&apos;à compter de la transmission au
                  mandataire du DPE, de l&apos;audit énergétique et de l&apos;état des risques, du nombre de lots de la copropriété, du montant du budget prévisionnel pour le lot et des procédures en
                  cours.
                </li>
                <li>Réclamer toutes les pièces utiles auprès de toutes personnes privées ou publiques, notamment le certificat d&apos;urbanisme.</li>
                <li>Indiquer, présenter et faire visiter les biens à vendre à toutes personnes. À cet effet, le mandant s&apos;oblige à assurer le moyen de visiter pendant le cours du présent mandat.</li>
                <li>
                  Satisfaire, s&apos;il y a lieu, à la déclaration d&apos;intention d&apos;aliéner exigée par la loi. En cas d&apos;exercice du droit de préemption, négocier avec l&apos;organisme
                  préempteur, bénéficiaire de ce droit, à la condition d&apos;en avertir le mandant, étant entendu que celui-ci garde le droit d&apos;accepter ou refuser le prix proposé par le préempteur,
                  si ce prix est inférieur au prix demandé.
                </li>
                <li>
                  Séquestre : en vue de garantir la bonne exécution des présentes et de leur suite, les fonds ou valeurs qu&apos;il est d&apos;usage de faire verser par l&apos;acquéreur seront détenus
                  par tout séquestre habilité à cet effet (notaire ou agence titulaire d&apos;une garantie financière).
                </li>
                <li>
                  Application de l&apos;article 46 de la loi n° 65-557 du 10 juillet 1965 (vente d&apos;un lot ou d&apos;une fraction de lot, dite loi Carrez) : si le mandant ne fournit pas
                  l&apos;attestation des surfaces sous huitaine, il autorise le mandataire à faire établir à ses frais, par un homme de l&apos;art, une attestation mentionnant les métrés de la partie
                  privative des biens objet du présent mandat.
                </li>
                <li>
                  Dossier de diagnostic technique : le vendeur fera effectuer sans délai l&apos;ensemble des constats, états et diagnostics obligatoires. Ce dossier devra être annexé à
                  l&apos;engagement des parties.
                </li>
                <li>Adjoindre ou substituer tout professionnel de son choix pour l&apos;accomplissement des présentes.</li>
                <li>
                  Copropriété : le mandant autorise expressément le mandataire à demander au syndic, en son nom et à ses frais, communication et copie des documents devant être présentés ou fournis à
                  l&apos;acquéreur, notamment le règlement de copropriété, le carnet d&apos;entretien de l&apos;immeuble, le plan pluriannuel de travaux, le diagnostic technique, les diagnostics amiante,
                  plomb et termites concernant les parties communes et l&apos;état prévu par l&apos;article 721-2 du CCH. Cette autorisation ne concerne que les documents que le vendeur copropriétaire
                  n&apos;aurait pas déjà fournis au mandataire. Les documents ainsi obtenus sont réputés la propriété du mandant et lui seront restitués en fin de mission.
                </li>
                <li>
                  Le mandataire informera le mandant, par LRAR ou par tout autre écrit remis contre récépissé ou émargement, dans les huit jours de l&apos;opération, de l&apos;accomplissement du
                  mandat, en joignant le cas échéant une copie de la quittance ou du reçu délivré, conformément à l&apos;article 77 du décret n° 72-678 du 20 juillet 1972.
                </li>
              </ol>
              <P className="mt-[2mm]">
                Le mandataire, professionnel de l&apos;immobilier, doit s&apos;assurer de l&apos;identité du client et, le cas échéant, du bénéficiaire effectif de l&apos;opération en vérifiant
                celle-ci par des documents officiels. Cette obligation de vigilance s&apos;applique tout au long de la relation d&apos;affaires.
              </P>
            </Section>

            <Section num="XIV" titre="Faculté de rétractation du mandant">
              <P>Le mandant a la faculté de renoncer au mandat dans le délai de QUATORZE JOURS à compter de la date de signature des présentes.</P>
              <P>
                Si le mandant entend utiliser cette faculté, il utilisera le formulaire ci-joint ou procédera à toute autre déclaration dénuée d&apos;ambiguïté, exprimant sa volonté de se rétracter, et
                l&apos;adressera, par exemple, par lettre envoyée par la poste en recommandé avec demande d&apos;avis de réception, télécopie, courrier électronique au mandataire désigné ou, s&apos;il le
                permet, sur le site internet du mandataire, dans un délai de QUATORZE JOURS, qui commence à courir le jour de la signature des présentes, étant précisé que le jour de ce point de départ
                n&apos;est pas compté, le décompte de ce délai commence le lendemain à 0 heure et expire le 14e jour à minuit. En cas de rétractation en ligne, le mandataire en accusera réception sans
                délai sur un support durable.
              </P>
              <P>
                L&apos;exercice de la faculté de rétractation par le mandant ne donnera lieu à aucune indemnité ni frais. Les prestations devant être exécutées par le mandataire, dans le cadre des
                présentes, et notamment la diffusion d&apos;annonces portant sur l&apos;offre de vente des biens, ne débuteront qu&apos;à l&apos;expiration de ce délai de rétractation.
              </P>
              <P>
                Si le mandant demande que l&apos;exécution du mandat débute avant l&apos;expiration du délai de rétractation, cette demande d&apos;exécution immédiate du mandat ne le prive pas de sa
                faculté de rétractation pendant le délai de 14 jours tant que l&apos;agence n&apos;a pas pleinement exécuté sa mission.
              </P>
            </Section>

            <Section num="XV" titre="Discrimination">
              <P>
                Les parties prennent l&apos;engagement exprès de n&apos;opposer à un candidat à l&apos;acquisition des présents biens aucun refus fondé sur un motif discriminatoire au sens de
                l&apos;article 225-1 du code pénal. Toute discrimination commise à l&apos;égard d&apos;une personne est punie de trois ans d&apos;emprisonnement et 45 000 euros d&apos;amende (article
                225-2 du code pénal).
              </P>
            </Section>

            <Section num="XVI" titre="Médiation des litiges de la consommation">
              <P>
                Tout consommateur a le droit de recourir gratuitement à un médiateur de la consommation en vue de la résolution amiable du litige qui l&apos;oppose à un professionnel. À cet effet, le
                professionnel garantit au consommateur le recours effectif à un dispositif de médiation de la consommation, en vertu des articles L611-1 et suivants du Code de la consommation.
              </P>
              <P>
                Notre médiateur de la consommation : Association MEDIMMOCONSO, 1 allée du Parc de Mesemena, Bât A, CS 25222, 44505 La Baule Cedex. Site internet :
                medimmoconso.fr/adresser-une-reclamation/
              </P>
            </Section>

            <Section num="XVII" titre="Informatique, libertés, RGPD">
              <P>
                Le mandataire informe le mandant qu&apos;il collecte et traite des données personnelles nécessaires pour l&apos;accomplissement de sa mission, et notamment pour exécuter le présent
                mandat, diffuser les données du bien à vendre sur tous supports, établir les documents juridiques et comptables y afférents, effectuer de la prospection commerciale, mettre en relation
                avec son réseau ou ses partenaires, et respecter ses obligations légales (lutte anti-blanchiment par exemple).
              </P>
              <div className="mt-[2mm]">
                <Case on={m.prospection}>J&apos;accepte de recevoir de la prospection commerciale sur mon adresse mail.</Case>
              </div>
              <P>
                Le mandant dispose d&apos;un droit d&apos;opposition et d&apos;un droit à la limitation du traitement des données le concernant, ainsi que d&apos;un droit d&apos;accès, de
                rectification, de portabilité et d&apos;effacement de ses données, de même que de déposer une réclamation auprès de la CNIL. Pour toute demande sur le traitement de ses données, il peut
                s&apos;adresser au responsable du traitement : SAS PATRIM, 45 allées Jean Jaurès, 31000 Toulouse.
              </P>
              <P>Le mandant reconnaît avoir pris connaissance de ladite politique et l&apos;accepter.</P>
            </Section>

            <Section num="XVIII" titre="Signature électronique">
              <p className="text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                Pour tous les actes ou documents relatifs au présent mandat, comme pour tout acte y afférent (procès-verbaux, attestations, etc.), les parties acceptent une signature en la forme
                « électronique » via notamment la plateforme de signature en ligne « ICSIGN ». Ces signatures en la forme « électronique » seront opérées sous l&apos;administration de la société
                PATRIM, Société par actions simplifiée ayant son siège social à TOULOUSE (31000), 45, Allées Jean Jaurès, et immatriculée au registre du commerce et des sociétés de TOULOUSE (31) sous le
                numéro 403 231 145. À ce titre, chacun des intéressés déclare et garantit que son numéro de téléphone portable et son adresse électronique mentionnés ci-dessous sont bien les siens,
                qu&apos;ils l&apos;identifient personnellement et qu&apos;il est le seul à y avoir accès, de sorte que la signature en la forme « électronique » d&apos;un acte par ce biais manifestera son
                consentement personnel aux obligations qui en découlent :
              </p>
              <div className="acte-bloc mt-[3mm] overflow-hidden rounded-[2.5mm] border text-[9pt]" style={{ borderColor: C.line }}>
                {signataires.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-[4mm] border-b px-[5mm] py-[2.2mm] last:border-0" style={{ borderColor: C.line, background: i % 2 ? "#fff" : C.cream }}>
                    <span className="font-medium">
                      {s.nom || ou(undefined, "nom")}
                      <span className="ml-[2mm] text-[8pt] font-normal" style={{ color: C.muted }}>
                        {i < m.mandants.length ? "Mandant" : "Mandataire"}
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

            {/* Annexe : formulaire de rétractation */}
            <section className="acte-saut pt-[6mm]">
              <div className="rounded-[3mm] border-[0.4mm] border-dashed px-[7mm] py-[6mm]" style={{ borderColor: C.line }}>
                <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.coral }}>
                  Annexe
                </div>
                <h2 className="mt-[1mm] font-serif text-[16pt] font-semibold" style={{ color: C.brand }}>
                  Formulaire de rétractation
                </h2>
                <p className="mt-[1.5mm] text-[8.5pt] italic" style={{ color: C.muted }}>
                  Veuillez compléter et renvoyer le présent formulaire uniquement si vous souhaitez vous rétracter du mandat n° {m.numero || "……"}.
                </p>
                <div className="mt-[4mm] space-y-[3mm] text-[9.6pt]">
                  <p>À l&apos;attention de SAS PATRIM, 45 allées Jean Jaurès, 31000 Toulouse – Tél. 05 61 99 08 08.</p>
                  <p>Je/Nous (*) vous notifie/notifions (*) par la présente ma/notre (*) rétractation du contrat portant sur la prestation de services ci-dessous : mandat de vente n° {m.numero || "……"}.</p>
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
