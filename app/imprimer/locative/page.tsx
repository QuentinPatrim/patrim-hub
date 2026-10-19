"use client";

import { ArrowLeft, Banknote, CheckCircle, Home, KeyRound, Leaf, Mail, Printer, Star, ThumbsDown, ThumbsUp, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FitToPage, MAX_DENSITY } from "@/components/estimations/FitToPage";
import { useSignature } from "@/lib/profil";
import { nomConseiller } from "@/lib/equipe";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { useCollection } from "@/lib/store";
import { nomComplet } from "@/lib/format";
import type { Contact } from "@/lib/types";

/* ============================================================
   Avis locatif express — version imprimable (A4), mise en page
   calquée sur l'avis de valeur de vente : couverture, charte
   (bordeaux #8a0e01, corail #d35f52), en-têtes numérotés,
   footer légal PATRIM, rail DPE, signature du conseiller.
   Reçoit les données par query params. Couleurs fixes pour un
   rendu identique à l'écran, à l'impression et en PDF.
   ============================================================ */

const COLORS = { primary: "#8a0e01", secondary: "#d35f52" };
const DPE_COLORS: Record<string, string> = { A: "#00A06D", B: "#52B153", C: "#A5CC74", D: "#F3E724", E: "#F0B328", F: "#EB8235", G: "#D7221F" };
const CONSEILLER = {
  get nom() {
    return nomConseiller();
  },
  role: "Service Transaction",
};

const nombre = (n: number) => Math.round(n).toLocaleString("fr-FR");
const eur = (n: number) => `${nombre(n)} €`;
const surf = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const pad2 = (n: number) => String(n).padStart(2, "0");

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton h-64" />}>
      <AvisLocatif />
    </Suspense>
  );
}

function AvisLocatif() {
  const p = useSearchParams();
  const g = (k: string) => p.get(k) ?? undefined;
  const adresse = g("adresse") ?? "";
  const ville = g("ville");
  const quartier = g("quartier");
  const type = g("type") === "maison" ? "Maison" : "Appartement";
  const surface = Number(g("surface"));
  const pieces = g("pieces");
  const meuble = g("meuble") === "1";
  const bas = Number(g("bas"));
  const central = Number(g("central"));
  const haut = Number(g("haut"));
  const loyerM2 = Number(g("loyerM2"));
  const confiance = g("confiance");
  const conseille = Number(g("conseille"));
  const commentaire = g("commentaire");
  const exterieur = g("exterieur");
  const parking = g("parking") === "1";
  const etage = g("etage");
  const ascenseur = g("ascenseur") === "1";
  const etat = g("etat");
  const proprioId = g("proprio");
  const avantages = (g("avantages") ?? "").split("§").filter(Boolean);
  const vigilances = (g("vigilances") ?? "").split("§").filter(Boolean);
  const comps = (g("comps") ?? "").split("§").map((c) => c.split("|")).filter((x) => x.length >= 3);
  const refQuartier = (g("refQuartier") ?? "").split("|").map(Number);

  const signature = useSignature();
  const { items: contacts } = useCollection("contacts");
  const [zoom, setZoom] = useState(1);
  const [afficherNom, setAfficherNom] = useState(true);
  const [attente, setAttente] = useState(true);
  const [mail, setMail] = useState(false);

  const proprio = proprioId ? contacts.find((c) => c.id === proprioId) : undefined;

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    const t = setTimeout(() => setAttente(false), 1200);
    return () => {
      window.removeEventListener("resize", fit);
      clearTimeout(t);
    };
  }, []);

  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const cpMatch = adresse.match(/,?\s*(\d{5}\s+.+)$/);
  const street = (cpMatch ? adresse.slice(0, cpMatch.index) : adresse.split(",")[0]).replace(/,\s*$/, "").trim() || "Votre bien";
  const city = ville || (cpMatch ? cpMatch[1].trim() : "");
  const totalPages = 2;
  const hasDpe = !!g("dpe");
  const dpeLetter = (g("dpe") ?? "").toUpperCase().slice(0, 1);
  const loyerConseille = conseille || central;

  const PAGE = "print-page relative mx-auto bg-white overflow-hidden w-[210mm] h-[297mm] flex flex-col mb-8 rounded-[6px] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]";
  const LABEL = "text-[8.5px] font-semibold uppercase tracking-[0.08em] text-[#86868b]";

  const renderHeader = (n: number, title: string) => (
    <div className="flex shrink-0 items-center justify-between px-[14mm] pt-[11mm]">
      <div className="flex items-center gap-2.5">
        <span className="text-[10px] font-bold tabular-nums" style={{ color: COLORS.primary }}>
          {pad2(n)}
        </span>
        <span className="h-3 w-px bg-[#d2d2d7]" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#86868b]">{title}</span>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-patrim.png" alt="Patrim" className="h-[18px] object-contain" />
    </div>
  );

  const renderFooter = (n: number) => (
    <div className="mt-auto shrink-0 px-[14mm] pb-[8mm] pt-[4mm]">
      <div className="mb-[3mm] h-px bg-[#e8e8ed]" />
      <div className="flex items-center justify-between text-[7.5px] text-[#86868b]">
        <span>Agence Patrim · 45, allées Jean Jaurès, 31000 Toulouse · 05 61 99 08 08 · patrim.fr</span>
        <span className="font-semibold tabular-nums">{n} / {totalPages}</span>
      </div>
    </div>
  );

  const renderSignature = () => (
    <div className="flex items-end justify-between gap-6">
      <div>
        <p className={LABEL}>Fait à Toulouse, le {today}</p>
        <p className="mt-2 text-[14px] font-semibold text-[#1d1d1f]">{CONSEILLER.nom}</p>
        <p className="text-[10px] text-[#6e6e73]">{CONSEILLER.role} · Patrim Toulouse</p>
      </div>
      {signature && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signature} alt="Signature" className="w-auto max-w-[38mm] object-contain mix-blend-multiply" style={{ height: "15mm" }} />
      )}
    </div>
  );

  const sujet = `Avis locatif – ${street}`;
  const corpsMail = [
    `Bonjour${proprio ? ` ${proprio.civilite === "M." ? "Monsieur" : "Madame"} ${proprio.nom}` : ""},`,
    "",
    `Comme convenu, vous trouverez ci-joint l'avis locatif concernant votre bien${street && street !== "Votre bien" ? ` : ${street}${city ? `, ${city}` : ""}` : ""}.`,
    "",
    commentaire ? `En résumé : le loyer de marché estimé est de ${eur(loyerConseille)} par mois hors charges, avec une fourchette de ${eur(bas)} à ${eur(haut)}.` : "",
    "",
    "Ce document reste indicatif : je reste à votre disposition pour en discuter et affiner ensemble le loyer de présentation.",
    "",
    `Bien cordialement,`,
    CONSEILLER.nom,
    "Patrim Toulouse · 05 61 99 08 08",
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .pdf-font { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-font-smoothing: antialiased; letter-spacing: -0.005em; }
        .pdf-stage * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #ffffff !important; }
          body { margin: 0 !important; padding: 0 !important; }
          .pdf-stage { zoom: 1 !important; padding: 0 !important; background: none !important; }
          .print-page { margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; break-after: page; page-break-after: always; }
          .print-page:last-child { break-after: auto; page-break-after: auto; }
        }
      `,
        }}
      />
      {/* Barre d'outils (non imprimée) */}
      <div className="no-print sticky top-0 z-10 border-b border-black/5 bg-white/85 backdrop-blur">
        <div className="safe-top mx-auto flex max-w-[860px] items-center gap-1.5 px-3 py-2.5 text-[#1d1d1f]">
          <Link href="/locatives" className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Retour
          </Link>
          {proprio && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-[#6e6e73]">
              <input type="checkbox" checked={afficherNom} onChange={(ev) => setAfficherNom(ev.target.checked)} className="size-4 accent-[#8a0e01]" />
              <span className="hidden sm:inline">Nom du propriétaire</span>
              <span className="sm:hidden">Nom</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => (proprio?.email ? setMail(true) : window.print())}
            className={`${proprio ? "" : "ml-auto "}inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white active:scale-[.98]`}
            style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, boxShadow: "0 8px 24px -8px rgba(138,14,1,0.6)" }}
          >
            {proprio?.email ? <><Mail size={16} /> Envoyer au propriétaire</> : <><Printer size={16} /> PDF</>}
          </button>
          {proprio?.email ? (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d2d2d7] px-4 text-sm font-medium text-[#1d1d1f] hover:bg-black/5 active:scale-[.98]"
            >
              <Printer size={16} /> PDF
            </button>
          ) : null}
        </div>
      </div>

      <div className="pdf-stage pdf-font min-h-screen py-6 sm:py-10" style={{ backgroundColor: "#e5e5ea", zoom }}>
        {/* ============ PAGE 1 : COUVERTURE ============ */}
        <div className={PAGE}>
          <div className="relative h-[168mm] shrink-0" style={{ background: "radial-gradient(120% 100% at 20% 0%, #5a1208, #120807 70%)" }}>
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.25) 100%)" }} />
            <div className="absolute inset-x-[14mm] top-[11mm] flex items-start justify-between">
              <span className="inline-flex items-center rounded-[14px] bg-white px-3.5 py-2.5 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-patrim.png" alt="Patrim" className="h-[26px] object-contain" />
              </span>
              <div className="text-right text-white" style={{ textShadow: "0 1px 8px rgba(0,0,0,0.35)" }}>
                <p className="text-[8.5px] font-semibold uppercase tracking-[0.08em] opacity-80">Document établi le</p>
                <p className="mt-0.5 text-[13px] font-semibold">{today}</p>
              </div>
            </div>
            <div className="absolute inset-x-[14mm] bottom-[10mm] flex items-end justify-between text-white">
              <div>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] backdrop-blur-sm">
                  <KeyRound size={12} /> Avis locatif
                </p>
                <h1 className="mt-3 text-[34px] font-bold leading-[1.05] tracking-[-0.03em]" style={{ textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}>
                  {street}
                </h1>
                {city && <p className="mt-1 text-[15px] opacity-90">{city}</p>}
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col px-[14mm] pt-[10mm]">
            <div className="flex flex-wrap gap-1.5">
              {[
                type,
                surface > 0 ? `${surf(surface)} m²` : "",
                pieces ? `${pieces} pièce${Number(pieces) > 1 ? "s" : ""}` : "",
                meuble ? "Meublé" : "Location vide",
                quartier ? `Quartier ${quartier}` : "",
              ]
                .filter(Boolean)
                .map((t) => (
                  <span key={t} className="rounded-full bg-[#f5f5f7] px-3 py-1.5 text-[10px] font-medium text-[#1d1d1f]">
                    {t}
                  </span>
                ))}
              {dpeLetter && DPE_COLORS[dpeLetter] && (
                <span className="rounded-full px-3 py-1.5 text-[10px] font-bold" style={{ backgroundColor: DPE_COLORS[dpeLetter], color: "CD".includes(dpeLetter) ? "#1d1d1f" : "#fff" }}>
                  DPE {dpeLetter}
                </span>
              )}
            </div>

            <div className="mt-[11mm] rounded-[18px] border border-[#e8e8ed] px-[7mm] py-[6mm]">
              <p className={LABEL}>Loyer de marché estimé</p>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="font-semibold leading-none tabular-nums tracking-[-0.02em] text-[#1d1d1f] text-[28px]">
                  {central ? `${eur(central)}` : "—"}
                  <span className="ml-1.5 text-[12px] font-normal text-[#6e6e73]">/ mois HC</span>
                </p>
                <p className="text-[10.5px] tabular-nums text-[#6e6e73]">
                  {bas && haut ? `Fourchette ${eur(bas)} – ${eur(haut)}` : ""}
                  {loyerM2 > 0 ? ` · ${nombre(loyerM2)} €/m²` : ""}
                  {confiance ? ` · Fiabilité ${confiance}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-[5mm] grid grid-cols-3 rounded-[18px] bg-[#f5f5f7] py-[4.5mm]">
              {[
                { l: "Loyer conseillé", v: loyerConseille ? eur(loyerConseille) : "—", u: "HC / mois" },
                { l: "Loyer au m²", v: surface > 0 && loyerConseille ? `${(Math.round((loyerConseille / surface) * 10) / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} €` : "—", u: "par mois" },
                { l: "Référence quartier", v: refQuartier.length === 2 ? `${refQuartier[0]}–${refQuartier[1]}` : "—", u: "€/m²" },
              ].map((k, i) => (
                <div key={k.l} className={`px-[5mm] ${i > 0 ? "border-l border-[#e3e3e8]" : ""}`}>
                  <p className={LABEL}>{k.l}</p>
                  <p className="mt-1.5 font-bold leading-none tabular-nums tracking-[-0.03em] text-[#1d1d1f] text-[20px]">{k.v}</p>
                  <p className="mt-1 text-[8.5px] text-[#86868b]">{k.u}</p>
                </div>
              ))}
            </div>

            <div className="mt-auto grid grid-cols-2 gap-8 border-t border-[#e8e8ed] pt-[6mm]">
              <div>
                <p className={LABEL}>Établi pour</p>
                <p className="mt-1.5 text-[14px] font-semibold text-[#1d1d1f]">
                  {afficherNom && proprio ? nomComplet(proprio) : "—"}
                </p>
                {afficherNom && proprio?.adresse && <p className="mt-0.5 text-[10px] leading-snug text-[#6e6e73]">{proprio.adresse}</p>}
              </div>
              <div>
                <p className={LABEL}>Votre conseiller</p>
                <p className="mt-1.5 text-[14px] font-semibold text-[#1d1d1f]">{CONSEILLER.nom}</p>
                <p className="mt-0.5 text-[10px] text-[#6e6e73]">{CONSEILLER.role} · Patrim Toulouse</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between px-[14mm] pb-[8mm] pt-[6mm] text-[7.5px] text-[#86868b]">
            <span>SAS Patrim · Carte professionnelle CPI 3101 2016 000 013 177 · RCS Toulouse B 403 231 145</span>
            <span className="font-semibold tabular-nums">1 / {totalPages}</span>
          </div>
        </div>

        {/* ============ PAGE 2 : LE BIEN, LE MARCHÉ, NOTRE ESTIMATION ============ */}
        <div className={PAGE}>
          {renderHeader(1, "Le bien et le marché locatif")}
          <div className="shrink-0 px-[14mm] pb-[4mm] pt-[7mm]">
            <h2 className="text-[26px] font-bold leading-[1.05] tracking-[-0.03em] text-[#1d1d1f]">Votre bien sur le marché locatif</h2>
            {quartier && <p className="mt-1 text-[12px] text-[#6e6e73]">Quartier {quartier}{city ? ` · ${city}` : ""}</p>}
          </div>
          <FitToPage className="px-[14mm]" columnStyle={(d) => ({ gap: `${5 - 2.6 * (d / MAX_DENSITY)}mm`, justifyContent: d > 0 ? "space-between" : undefined })}>
            {(d) => {
              const t = d / MAX_DENSITY;
              const mix = (loose: number, tight: number, from = 0) => {
                const k = Math.min(1, Math.max(0, (t - from) / (1 - from)));
                return Math.round((loose + (tight - loose) * k) * 100) / 100;
              };
              const mm = (loose: number, tight: number) => `${mix(loose, tight)}mm`;
              return (
                <>
                  {/* Caractéristiques */}
                  <div className="grid shrink-0 rounded-[18px] bg-[#f5f5f7] py-[5mm]" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
                    {[
                      { l: "Surface", v: surface > 0 ? surf(surface) : "—", u: "m²" },
                      { l: "Pièces", v: pieces ? String(pieces) : "—", u: "" },
                      { l: "Étage", v: etage != null ? (etage === "0" ? "RDC" : `${etage}${etage === "1" ? "er" : "e"}`) : "—", u: etage && etage !== "0" ? (ascenseur ? "avec asc." : "sans asc.") : "" },
                      { l: "Location", v: meuble ? "Meublée" : "Vide", u: parking ? "parking" : "" },
                    ].map((k, i) => (
                      <div key={k.l} className={`px-[5mm] ${i > 0 ? "border-l border-[#e3e3e8]" : ""}`}>
                        <p className={LABEL}>{k.l}</p>
                        <p className="mt-1.5 whitespace-nowrap leading-none text-[#1d1d1f]">
                          <span className="text-[22px] font-bold tabular-nums tracking-[-0.03em]">{k.v}</span>
                          {k.u && <span className="ml-1 text-[10px] font-medium text-[#6e6e73]">{k.u}</span>}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* DPE */}
                  {hasDpe && (
                    <div className="grid shrink-0 rounded-[18px] border border-[#e8e8ed] p-[5mm]">
                      <p className="mb-[4mm] flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                        <Leaf size={13} className="text-[#248a3d]" /> Performance énergétique
                      </p>
                      <div className="flex h-[26px] items-end gap-[3px]">
                        {["A", "B", "C", "D", "E", "F", "G"].map((l) => {
                          const on = dpeLetter === l;
                          return (
                            <div
                              key={l}
                              className={`flex flex-1 items-center justify-center rounded-[5px] font-bold ${on ? "h-[26px] text-[11px] shadow-[0_2px_6px_rgba(0,0,0,0.18)]" : "h-[12px] text-[7px] opacity-30"}`}
                              style={{ backgroundColor: DPE_COLORS[l], color: "CD".includes(l) ? "#1d1d1f" : "#fff" }}
                            >
                              {l}
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-[8.5px] text-[#86868b]">
                        {dpeLetter ? `Classe ${dpeLetter}` : "Non communiquée"} · La classe énergie conditionne le montant du loyer autorisé (encadrement des loyers à Toulouse).
                      </p>
                    </div>
                  )}

                  {/* Loyers comparables */}
                  {comps.length > 0 && (
                    <div className="shrink-0 rounded-[18px] border border-[#e8e8ed] p-[5mm]">
                      <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                        <CheckCircle size={13} className="text-[#248a3d]" /> Loyers observés <span className="font-normal text-[#86868b]">· locations comparables du secteur</span>
                      </p>
                      <div>
                        {comps.map((c, i) => (
                          <div key={i} className={`flex items-center gap-3.5 border-b border-[#f0f0f2] py-[2.2mm] last:border-b-0`}>
                            <div className="flex h-[11.5mm] w-[11.5mm] shrink-0 items-center justify-center rounded-[10px] bg-[#f5f5f7]">
                              <Home size={13} className="text-[#aeaeb2]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[10.5px] font-semibold text-[#1d1d1f]">{c[0]}</p>
                              <p className="mt-0.5 truncate text-[8.5px] text-[#86868b]">{c[2]}</p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[12px] font-bold tabular-nums text-[#1d1d1f]">{eur(Number(c[3]))}</p>
                              <p className="text-[8.5px] font-semibold tabular-nums text-[#248a3d]">{nombre(Number(c[4]))} €/m²</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Points forts / vigilance */}
                  {(avantages.length > 0 || vigilances.length > 0) && (
                    <div className="grid shrink-0 grid-cols-2 gap-[4mm]">
                      {[
                        { t: "Points forts", items: avantages, icon: ThumbsUp, c: "#248a3d", bg: "#e8f7ec" },
                        { t: "Points de vigilance", items: vigilances, icon: ThumbsDown, c: "#c93400", bg: "#fff1e6" },
                      ]
                        .filter((b) => b.items.length > 0)
                        .map((b) => (
                          <div key={b.t} className="rounded-[18px] border border-[#e8e8ed]" style={{ padding: mm(5, 2.8) }}>
                            <p className="flex items-center gap-2 text-[12px] font-semibold text-[#1d1d1f]" style={{ marginBottom: mix(10, 5) }}>
                              <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: b.bg }}>
                                <b.icon size={12} style={{ color: b.c }} />
                              </span>
                              {b.t}
                            </p>
                            <ul className="flex flex-col" style={{ gap: mix(6, 2.5) }}>
                              {b.items.slice(0, 6).map((s, i) => (
                                <li key={i} className="flex gap-2 leading-snug text-[#3a3a3c]" style={{ fontSize: mix(10.5, 9.5, 0.5) }}>
                                  <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: b.c }} />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Commentaire */}
                  {commentaire && (
                    <div className="shrink-0 rounded-[18px] bg-[#f5f5f7]" style={{ padding: mm(6, 3.2) }}>
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]" style={{ marginBottom: mix(8, 4) }}>
                        <Star size={13} style={{ color: COLORS.primary }} /> L&apos;analyse de votre conseiller
                      </p>
                      <p className="line-clamp-[12] whitespace-pre-wrap text-[#3a3a3c]" style={{ fontSize: mix(11, 10, 0.5), lineHeight: mix(1.6, 1.4) }}>
                        {commentaire}
                      </p>
                    </div>
                  )}

                  {/* Méthode */}
                  <div className="grid shrink-0 grid-cols-3 gap-[3mm]">
                    {[
                      { n: "1", t: "Loyers du terrain", d: comps.length ? `${comps.length} location${comps.length > 1 ? "s" : ""} comparable${comps.length > 1 ? "s" : ""} du secteur` : "Références de l'agence sur le quartier" },
                      { n: "2", t: "Référence du quartier", d: refQuartier.length === 2 ? `Loyers habituels de ${refQuartier[0]} à ${refQuartier[1]} €/m²` : "Ordres de grandeur constatés par l'agence" },
                      { n: "3", t: "Visite du bien", d: "État, prestations, étage, extérieurs, stationnement et classe énergie" },
                    ].map((m) => (
                      <div key={m.n} className="rounded-[16px] border border-[#e8e8ed]" style={{ padding: mm(4, 2.4) }}>
                        <div className={t >= 0.75 ? "flex items-center gap-2" : ""}>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})` }}>
                            {m.n}
                          </span>
                          <p className={`text-[11px] font-semibold text-[#1d1d1f] ${t >= 0.75 ? "" : "mt-2"}`}>{m.t}</p>
                        </div>
                        <p className="mt-0.5 text-[9px] leading-snug text-[#6e6e73]">{m.d}</p>
                      </div>
                    ))}
                  </div>

                  <div className={`shrink-0 ${d > 0 ? "" : "mt-auto pt-[2mm]"}`}>{renderSignature()}</div>
                </>
              );
            }}
          </FitToPage>
          <div className="mt-auto shrink-0 px-[14mm] pt-[4mm]">
            <p className="text-justify text-[6.5px] leading-[1.55] text-[#aeaeb2]">
              Avis indicatif établi à partir des loyers constatés par l&apos;agence sur le secteur et des références disponibles le jour de sa réalisation. Ce document ne constitue ni une offre de location ni une
              expertise locative : le loyer définitif dépend de l&apos;état réel du bien le jour de la visite, des pièces justificatives et de la réglementation en vigueur (encadrement des loyers, décence,
              ..). Le loyer de marché estimé s&apos;entend hors charges ; les charges récupérables et le montant du dépôt de garantie sont déterminés selon la loi en vigueur.
            </p>
          </div>
          {renderFooter(2)}
        </div>
      </div>

      {mail && proprio && (
        <BrouillonMail
          open
          onClose={() => setMail(false)}
          titre={`Envoyer l'avis locatif à ${nomComplet(proprio)}`}
          to={proprio.email}
          tel={proprio.tel}
          sujet={sujet}
          corps={corpsMail}
        />
      )}
    </>
  );
}
