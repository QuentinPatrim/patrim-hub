"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Printer } from "lucide-react";
import { AGENCE, C, MENTIONS, telActe } from "@/components/documents/charte";
import { useActe } from "@/components/documents/archive";
import { ACTE_PRINT_CSS, Pagine } from "@/components/documents/blocs";
import { TraceSvg } from "@/components/bon/SignaturePad";
import { MENTION_DONNEES, descriptionBien, engagement, nomVisiteur, prixTexte, quand, type BonVisite } from "@/components/bon/bon";

/* ============================================================
   Bon de visite PATRIM en A4 : signé sur le téléphone, ou à faire
   signer sur ICSIGN ou sur papier. Remis au visiteur : rien sur
   le vendeur.
   ============================================================ */

const CARTE = "CPI 3101 2016 000 013 177";
const aucun = () => null;
const TZ = "Europe/Paris";
const jourCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }).replace(/^1 /, "1er ");
const heureDe = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", "h");

function Bloc({ titre, extra, children }: { titre: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="acte-bloc">
      <div className="flex items-baseline justify-between gap-[4mm]">
        <span className="text-[8pt] font-semibold uppercase tracking-[0.16em]" style={{ color: C.brand }}>
          {titre}
        </span>
        {extra}
      </div>
      <div className="mt-[2.5mm]">{children}</div>
    </section>
  );
}

export default function BonPdf() {
  const { id } = useParams<{ id: string }>();
  const bon = useActe<BonVisite>(id, "bon", aucun);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [id]);

  useEffect(() => {
    if (!bon) return;
    const prev = document.title;
    const jour = new Date(bon.visite).toLocaleDateString("sv-SE", { timeZone: TZ });
    document.title = `Bon de visite ${jour} ${bon.visiteurs.map((v) => [v.civilite, v.nom?.toUpperCase()].filter(Boolean).join(" ")).join(" ")}`.replace(/\s+/g, " ").trim();
    return () => {
      document.title = prev;
    };
  }, [bon]);

  if (bon === undefined) return null;
  if (!bon)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: C.paper, color: C.ink }}>
        <div>
          <p>Ce bon de visite est introuvable.</p>
          <Link href="/agenda" className="mt-3 inline-block underline">
            Retour à l&apos;agenda
          </Link>
        </div>
      </div>
    );

  const plusieurs = bon.visiteurs.length > 1;
  const prix = prixTexte(bon.bien);

  return (
    <div className="acte-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{ACTE_PRINT_CSS}</style>

      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/agenda/bon/${bon.rdvId}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Bon de visite
          </Link>
          <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm active:scale-[.98]" style={{ background: C.brand }}>
            <Printer size={16} /> Enregistrer en PDF
          </button>
        </div>
        <div className="mx-auto max-w-[860px] px-4 pb-2.5 text-[12px] leading-snug" style={{ color: C.slate }}>
          {bon.signeLe ? (
            <span className="inline-flex items-start gap-1.5" style={{ color: "#1d7a46" }}>
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> Signé sur place le {quand(bon.signeLe)}.
            </span>
          ) : (
            <>Pas encore signé : faites-le signer sur le téléphone depuis l&apos;agenda, ou enregistrez ce PDF pour ICSIGN ou pour l&apos;imprimer.</>
          )}
        </div>
      </div>

      <div className="flex justify-center py-4 sm:py-6">
        <article className="acte-sheet relative flex min-h-[297mm] w-[210mm] flex-col bg-white shadow-xl" style={{ zoom }}>
          <div className="acte-barre h-[2mm]" style={{ background: C.brand }} />
          <Pagine>
            <header className="flex items-start justify-between px-[18mm] pt-[8mm]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="PATRIM" style={{ height: "13mm" }} />
              <div className="text-right text-[8pt] leading-relaxed" style={{ color: C.muted }}>
                <div className="font-semibold" style={{ color: C.slate }}>
                  SAS PATRIM
                </div>
                <div>45, allées Jean Jaurès – 31000 Toulouse</div>
                <div>Carte professionnelle n° {CARTE}</div>
                <div>RCS 403 231 145</div>
              </div>
            </header>

            <div className="flex items-end justify-between gap-[6mm] px-[18mm] pt-[5mm]">
              <div>
                <div className="h-[3px] w-[16mm]" style={{ background: C.coral }} />
                <h1 className="mt-[3mm] font-serif text-[28pt] font-semibold leading-[1.05]" style={{ color: C.brand }}>
                  Bon de visite
                </h1>
              </div>
              <div className="shrink-0 rounded-[2.5mm] border px-[5mm] py-[3mm] text-center" style={{ borderColor: C.line }}>
                <div className="text-[7pt] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
                  Visite du
                </div>
                <div className="font-serif text-[15pt] font-semibold leading-tight" style={{ color: C.ink }}>
                  {jourCourt(bon.visite)}
                </div>
                <div className="mt-[1mm] text-[8pt]" style={{ color: C.muted }}>
                  à {heureDe(bon.visite)}
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-[4.5mm] px-[18mm] pt-[5mm] text-[9.5pt] leading-[1.5]">
              <Bloc titre="Le bien visité">
                <div className="rounded-[3mm] px-[5mm] py-[3mm]" style={{ background: C.cream }}>
                  <p className="flex items-baseline justify-between gap-[4mm]">
                    <span className="font-semibold">{descriptionBien(bon.bien)}</span>
                    {bon.bien.mandat && (
                      <span className="shrink-0 text-[8.5pt]" style={{ color: C.muted }}>
                        Mandat n° {bon.bien.mandat}
                      </span>
                    )}
                  </p>
                  <p>{bon.bien.adresse}</p>
                  {prix && <p>Prix : {prix}</p>}
                </div>
              </Bloc>

              <Bloc titre={plusieurs ? "Les visiteurs" : "Le visiteur"}>
                <div className="space-y-[2.5mm]">
                  {bon.visiteurs.map((v, i) => (
                    <div key={v.contactId ?? i} className="border-l-[0.8mm] pl-[4mm]" style={{ borderColor: C.coral }}>
                      <p>
                        <strong>{nomVisiteur(v)}</strong>
                        {v.adresse ? `, demeurant ${v.adresse}` : ""}
                      </p>
                      {(v.tel || v.email) && (
                        <p className="text-[9pt]" style={{ color: C.slate }}>
                          {[v.tel && `Portable : ${telActe(v.tel)}`, v.email && `Mail : ${v.email}`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Bloc>

              <Bloc titre="Engagement">
                <div className="space-y-[2.5mm]">
                  {engagement(bon).map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>
              </Bloc>

              <Bloc titre={plusieurs ? "Signatures" : "Signature"} extra={<span>Fait à {bon.bien.ville || "Toulouse"}, le {jourCourt(bon.signeLe ?? bon.visite)}</span>}>
                <div className="grid grid-cols-2 gap-[6mm]">
                  {bon.visiteurs.map((v, i) => (
                    <div key={v.contactId ?? i}>
                      <div className="text-[8.5pt]" style={{ color: C.slate }}>
                        {nomVisiteur(v)}
                      </div>
                      <div className="mt-[1.5mm] h-[22mm] rounded-[2.5mm] border p-[2mm]" style={{ borderColor: C.line }}>
                        {v.signature && <TraceSvg t={v.signature} className="h-full w-full" color={C.ink} />}
                      </div>
                      {bon.signeLe && v.signature && (
                        <div className="mt-[1mm] text-[7.5pt]" style={{ color: C.muted }}>
                          Signé sur place le {jourCourt(bon.signeLe)} à {heureDe(bon.signeLe)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-[4mm] text-[9pt]" style={{ color: C.slate }}>
                  Pour l&apos;agence : {bon.conseiller}, {AGENCE.conseillerTitre.toLowerCase()} · {telActe(AGENCE.conseillerTel)} · {AGENCE.conseillerMail}
                </p>
              </Bloc>

              <p className="acte-bloc text-[7.8pt] leading-snug" style={{ color: C.muted }}>
                {MENTION_DONNEES}
              </p>
            </div>

            <footer className="no-print px-[18mm] pb-[8mm] text-center text-[7.3pt]" style={{ color: C.muted }}>
              {MENTIONS}
            </footer>
          </Pagine>
          <div className="acte-barre h-[1.5mm]" style={{ background: C.coral }} />
        </article>
      </div>
    </div>
  );
}
