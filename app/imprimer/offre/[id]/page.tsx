"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Printer, TriangleAlert } from "lucide-react";
import { AGENCE, C, MENTIONS, enLettres, montantComplet } from "@/components/documents/charte";
import { dateLettres, lireOffre, manquants, ne, nomOffre, type Offre, type Partie } from "@/components/offre/offre";

/* ============================================================
   Offre d'achat PATRIM, prête à « Enregistrer en PDF » puis à
   déposer sur ICSIGN pour la signature électronique des parties.
   Texte repris du modèle de l'agence (clause ICSIGN comprise).
   ============================================================ */

const PRINT_CSS = `
  @page {
    size: A4;
    margin: 14mm 0 16mm;
    @bottom-center { content: "PATRIM · 45, allées Jean Jaurès – 31000 Toulouse · 05 61 99 08 08 · www.patrim.fr · Page " counter(page) " / " counter(pages); font: 7pt Inter, sans-serif; color: #7a7f87; }
  }
  @media print {
    html, body, .offre-root { background: #fff !important; }
    .offre-sheet { box-shadow: none !important; margin: 0 !important; min-height: 0 !important; width: 210mm !important; zoom: 1 !important; }
    .offre-bloc { break-inside: avoid; page-break-inside: avoid; }
    .offre-trou { background: none !important; color: #b3261e !important; }
  }
  .offre-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** Information manquante, bien visible pour ne pas l'oublier. */
function Trou({ children }: { children: ReactNode }) {
  return (
    <span className="offre-trou rounded px-1" style={{ background: "#ef402a1f", color: "#b3261e" }}>
      [À compléter{children ? ` : ${children}` : ""}]
    </span>
  );
}
const ou = (v: ReactNode | undefined, quoi: string) => (v == null || v === "" ? <Trou>{quoi}</Trou> : v);

export default function OffrePdf() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<Offre | null | undefined>(undefined);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    setO(lireOffre(id));
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!o) return;
    const prev = document.title;
    const noms = o.acquereurs.map((p) => p.nom?.toUpperCase()).filter(Boolean).join(" ");
    const vend = o.vendeurs.map((p) => p.nom?.toUpperCase()).filter(Boolean).join(" ");
    document.title = `Offre d'achat ${[noms, vend].filter(Boolean).join(" – ")}`.trim();
    return () => {
      document.title = prev;
    };
  }, [o]);

  if (o === undefined) return null;
  if (!o)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Aucune offre en cours pour ce bien sur cet appareil.</p>
          <Link href={`/biens/${id}/offre`} className="mt-3 inline-block underline">
            Rédiger l&apos;offre
          </Link>
        </div>
      </div>
    );

  const plusieurs = o.acquereurs.length > 1;
  const net = o.prix != null && o.honoraires != null ? o.prix - o.honoraires : undefined;
  const pret = o.montantPret ?? (o.prix != null && o.apport != null ? o.prix - o.apport : undefined);
  const nbManquants = [...o.acquereurs, ...o.vendeurs].reduce((n, p) => n + manquants(p).length, 0) + (o.prix ? 0 : 1) + (/\[À compléter/.test(o.designation) ? 1 : 0);
  const parties = [...o.acquereurs, ...o.vendeurs];
  const precision = o.motifTexte?.trim().replace(/[.;]+$/, "");

  return (
    <div className="offre-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{PRINT_CSS}</style>

      {/* Barre d'outils (non imprimée) */}
      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/biens/${id}/offre`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
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
            <>Prêt pour ICSIGN : enregistre le PDF, puis dépose-le dans ICSIGN et ajoute les signataires (e-mail et portable repris dans l&apos;offre).</>
          )}
        </div>
      </div>

      <div className="flex justify-center py-4 sm:py-6">
        <article className="offre-sheet relative flex min-h-[297mm] w-[210mm] flex-col bg-white shadow-xl" style={{ zoom }}>
          <div className="h-[2mm]" style={{ background: C.brand }} />
          {/* En-tête */}
          <header className="flex items-start justify-between px-[18mm] pt-[11mm]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PATRIM" style={{ height: "14mm" }} />
            <div className="text-right text-[8.5pt] leading-relaxed" style={{ color: C.muted }}>
              <div className="uppercase tracking-[0.2em]">Transaction</div>
              {o.mandatNumero && <div>Mandat de vente n° {o.mandatNumero}</div>}
            </div>
          </header>

          <div className="px-[18mm] pt-[10mm]">
            <div className="h-[3px] w-[16mm]" style={{ background: C.coral }} />
            <h1 className="mt-[4mm] font-serif text-[34pt] font-semibold leading-none" style={{ color: C.brand }}>
              Offre d&apos;achat
            </h1>
            <div className="mt-[3mm] text-[10.5pt]" style={{ color: C.slate }}>
              {ou(o.adresseBien, "adresse du bien")}
            </div>
          </div>

          <div className="flex-1 space-y-[5.5mm] px-[18mm] pt-[7mm] pb-[6mm] text-[10pt] leading-[1.55]">
            {/* 01 Le promettant */}
            <Section num="01" titre={plusieurs ? "Les promettants" : "Le promettant"}>
              <p>
                {plusieurs ? "Nous soussignés" : o.acquereurs[0]?.civilite === "Mme" ? "Je soussignée" : o.acquereurs[0]?.civilite === "M." ? "Je soussigné" : "Je soussigné(e)"}
              </p>
              <div className="mt-[2.5mm] space-y-[2.5mm]">
                {o.acquereurs.map((p, i) => (
                  <Identite key={p.contactId ?? i} p={p} />
                ))}
                {!o.acquereurs.length && <Trou>acquéreur</Trou>}
              </div>
              <p className="mt-[2.5mm]">
                {plusieurs
                  ? "dénommés ici le promettant, nous engageons, par la présente offre, à acquérir le bien suivant :"
                  : `${o.acquereurs[0]?.civilite === "Mme" ? "dénommée" : "dénommé"} ici le promettant, m'engage, par la présente offre, à acquérir le bien suivant :`}
              </p>
            </Section>

            {/* 02 Le bien */}
            <Section num="02" titre="Le bien">
              <div className="offre-bloc rounded-[3mm] px-[6mm] py-[4.5mm]" style={{ background: C.cream }}>
                <p className="whitespace-pre-line">
                  <Texte t={o.designation} />
                </p>
                <p className="mt-[2mm]">
                  Sis <strong>{ou(o.adresseBien, "adresse du bien")}</strong>.
                </p>
                {o.vendeurs.length > 0 && (
                  <p className="mt-[2mm] text-[9.5pt]" style={{ color: C.slate }}>
                    Appartenant à {o.vendeurs.map((p) => nomOffre(p) || "[À compléter]").join(", ")}, ci-après dénommé{o.vendeurs.length > 1 ? "s" : ""} « le vendeur ».
                  </p>
                )}
              </div>
            </Section>

            {/* 03 Prix */}
            <Section num="03" titre="Le prix">
              <div className="offre-bloc flex items-center gap-[6mm] rounded-[3mm] px-[6mm] py-[5mm] text-white" style={{ background: C.brand }}>
                <div className="flex-1">
                  <div className="text-[7.5pt] uppercase tracking-[0.2em] text-white/70">Prix offert, honoraires inclus</div>
                  <div className="mt-[1mm] font-serif text-[24pt] font-semibold leading-none" style={{ fontVariantNumeric: "lining-nums" }}>
                    {o.prix ? `${o.prix.toLocaleString("fr-FR")} €` : "—"}
                  </div>
                </div>
                <div className="text-right text-[9pt] leading-relaxed text-white/85">
                  {o.honoraires != null && <div>dont {o.honoraires.toLocaleString("fr-FR")} € d&apos;honoraires</div>}
                  {net != null && <div className="font-semibold text-white">{net.toLocaleString("fr-FR")} € net vendeur</div>}
                </div>
              </div>
              <p className="mt-[3.5mm]">
                Au prix de <strong>{o.prix ? montantComplet(o.prix) : <Trou>prix</Trou>}</strong>
                {o.charge === "acquereur" ? (
                  <>
                    {" "}
                    dont <strong>{o.honoraires != null ? montantComplet(o.honoraires) : <Trou>honoraires</Trou>}</strong> d&apos;honoraires à la charge de l&apos;acquéreur, soit un total de{" "}
                    <strong>{net != null ? montantComplet(net) : <Trou>net vendeur</Trou>} net vendeur</strong>.
                  </>
                ) : (
                  <>
                    , honoraires de <strong>{o.honoraires != null ? montantComplet(o.honoraires) : <Trou>honoraires</Trou>}</strong> à la charge du vendeur inclus, soit{" "}
                    <strong>{net != null ? montantComplet(net) : <Trou>net vendeur</Trou>} net vendeur</strong>.
                  </>
                )}
              </p>
              <p className="mt-[2.5mm]">
                Cette négociation est assurée par le mandataire ci-nommé {AGENCE.societe} sis au 45, allées Jean Jaurès 31000 Toulouse (mandat de vente n° {ou(o.mandatNumero, "numéro")}).
              </p>
            </Section>

            {/* 04 Financement */}
            <Section num="04" titre="Financement et conditions">
              <p>En cas d&apos;acceptation, la somme sera payée intégralement le jour de la signature de l&apos;acte authentique de vente.</p>
              {o.financement === "pret" ? (
                <p className="mt-[2.5mm]">
                  L&apos;achat sera financé au moyen d&apos;un apport personnel de {o.apport != null ? `${o.apport.toLocaleString("fr-FR")} €` : <Trou>apport</Trou>} et d&apos;un prêt bancaire
                  {pret != null ? ` de ${pret.toLocaleString("fr-FR")} €` : ""}
                  {o.dureePret ? ` sur ${o.dureePret} ans` : ""}
                  {o.tauxMax ? ` au taux maximum de ${o.tauxMax.toLocaleString("fr-FR")} % (hors assurance)` : ""} pour le solde.
                </p>
              ) : (
                <p className="mt-[2.5mm]">
                  L&apos;achat sera financé {o.apport != null ? `au moyen de fonds propres d'un montant de ${o.apport.toLocaleString("fr-FR")} €, ` : "au moyen de fonds propres, "}
                  sans recours à un prêt.
                </p>
              )}
              <div className="offre-bloc mt-[3mm] flex gap-[3mm] rounded-[2.5mm] border px-[5mm] py-[3.5mm]" style={{ borderColor: C.line }}>
                <span className="mt-[0.6mm] grid size-[4.2mm] shrink-0 place-items-center rounded-[1mm] border-[0.4mm] text-[8pt] font-bold" style={{ borderColor: C.brand, color: C.brand }}>
                  {o.conditionSuspensive ? "✓" : ""}
                </span>
                <div>
                  {o.conditionSuspensive ? (
                    <>
                      <strong>Condition suspensive.</strong> La présente offre est faite sous condition suspensive{" "}
                      {o.motif === "pret" ? "d'obtention dudit prêt" : o.motif === "vente" ? "de la vente du bien suivant : " : ""}
                      {o.motif === "pret" ? (precision ? `. ${precision}` : "") : ou(precision, o.motif === "vente" ? "bien à vendre" : "motif")}.
                    </>
                  ) : (
                    <>
                      <strong>Sans condition suspensive.</strong> La présente offre n&apos;est soumise à aucune condition suspensive
                      {o.financement === "comptant" ? " ; l'acquéreur déclare ne pas recourir à un prêt pour financer cette acquisition" : ""}.
                    </>
                  )}
                </div>
              </div>
              {o.conditionsParticulieres?.trim() && (
                <div className="offre-bloc mt-[3mm]">
                  <div className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
                    Conditions particulières
                  </div>
                  <p className="mt-[1mm] whitespace-pre-line">
                    <Texte t={o.conditionsParticulieres.trim()} />
                  </p>
                </div>
              )}
            </Section>

            {/* 05 Durée */}
            <Section num="05" titre="Durée de l'offre">
              <p>
                Cette offre est ferme et irrévocable et prendra fin à l&apos;issue d&apos;un délai de <strong>{enLettres(o.validiteJours)} jour{o.validiteJours > 1 ? "s" : ""}</strong> à compter de ce
                jour{o.date ? `, le ${dateLettres(o.date)}` : ""}.
              </p>
            </Section>

            {/* 06 Signature électronique */}
            <Section num="06" titre="Signature électronique">
              <p className="text-[9pt] leading-[1.5]" style={{ color: C.slate }}>
                Pour tous les actes ou documents relatifs à la présente offre, les parties acceptent une signature en la forme « électronique » via notamment la plateforme de signature en ligne
                « ICSIGN ». Ces signatures en la forme « électronique » seront opérées sous l&apos;administration de la société PATRIM, Société par actions simplifiée ayant son siège social à
                TOULOUSE (31000), 45, Allées Jean Jaurès, et immatriculée au registre du commerce et des sociétés de TOULOUSE (31) sous le numéro 403 231 145. A ce titre, chacun des intéressés
                déclare et garantit que son numéro de téléphone portable et son adresse électronique mentionnés ci-dessous sont bien les siens, qu&apos;ils l&apos;identifient personnellement et
                qu&apos;il est le seul à y avoir accès, de sorte que la signature en la forme « électronique » d&apos;un acte par ce biais manifestera son consentement personnel aux obligations qui en
                découlent :
              </p>
              <div className="offre-bloc mt-[3mm] overflow-hidden rounded-[2.5mm] border text-[9.3pt]" style={{ borderColor: C.line }}>
                {parties.map((p, i) => (
                  <div key={(p.contactId ?? "") + i} className="flex flex-wrap items-baseline justify-between gap-x-[4mm] border-b px-[5mm] py-[2.4mm] last:border-0" style={{ borderColor: C.line, background: i % 2 ? "#fff" : C.cream }}>
                    <span className="font-medium">
                      {nomOffre(p) || <Trou>nom</Trou>}
                      <span className="ml-[2mm] text-[8pt] font-normal" style={{ color: C.muted }}>
                        {i < o.acquereurs.length ? "Acquéreur" : "Vendeur"}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      {ou(p.email, "e-mail")} / {ou(p.tel, "portable")}
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

            {/* Les signatures sont ajoutées par ICSIGN */}
            <p className="offre-bloc pt-[2mm] text-center text-[9pt] font-semibold uppercase tracking-[0.12em]" style={{ color: C.brand }}>
              Fait par voie électronique à la date indiquée pour chaque signature par voie électronique, en autant d&apos;exemplaires que de parties
            </p>
          </div>

          {/* Mentions de l'agence (à l'impression, un rappel court figure aussi en bas de chaque page) */}
          <footer className="offre-footer px-[18mm] pb-[8mm] text-center text-[7.3pt]" style={{ color: C.muted }}>
            {MENTIONS}
          </footer>
          <div className="h-[1.5mm]" style={{ background: C.coral }} />
        </article>
      </div>

    </div>
  );
}

function Section({ num, titre, children }: { num: string; titre: string; children: ReactNode }) {
  return (
    <section>
      <div className="offre-bloc flex items-baseline gap-[3mm]">
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

/** « Madame Prénom NOM, née le … à …, demeurant … » */
function Identite({ p }: { p: Partie }) {
  return (
    <p className="border-l-[0.8mm] pl-[4mm]" style={{ borderColor: C.coral }}>
      <strong>{nomOffre(p) || <Trou>nom</Trou>}</strong>, {ne(p)} le {ou(dateLettres(p.dateNaissance), "date de naissance")} à {ou(p.lieuNaissance, "lieu de naissance")}, et demeurant{" "}
      {ou(p.adresse, "adresse complète")},
    </p>
  );
}

/** Texte libre où les « [À compléter …] » restent repérables. */
function Texte({ t }: { t: string }) {
  const parts = t.split(/(\[À compléter[^\]]*\])/g);
  return (
    <>
      {parts.map((s, i) =>
        /^\[À compléter/.test(s) ? (
          <span key={i} className="offre-trou rounded px-1" style={{ background: "#ef402a1f", color: "#b3261e" }}>
            {s}
          </span>
        ) : (
          s
        )
      )}
    </>
  );
}
