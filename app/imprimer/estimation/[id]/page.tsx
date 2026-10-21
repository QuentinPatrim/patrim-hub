"use client";

import { ArrowLeft, Banknote, BarChart3, CheckCircle, Home, Leaf, Pencil, Printer, Star, ThumbsDown, ThumbsUp, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { asPlus, typeLabel, ventesDe, type Vente } from "@/components/estimations/shared";
import { avisComplet, type BienEnVente } from "@/components/estimations/avis";
import { FitToPage, MAX_DENSITY } from "@/components/estimations/FitToPage";
import { SituationMap } from "@/components/estimations/SituationMap";
import { useCollection, useDoc } from "@/lib/store";
import { useSignature } from "@/lib/profil";
import { nomConseiller } from "@/lib/equipe";

/* ============================================================
   Avis de valeur imprimable (A4), mise en page reprise à
   l'identique de l'outil d'estimation Immotech : couverture
   photo, le bien, le marché, notre estimation, photographies.
   Couleurs fixes (pas de thème sombre) pour un rendu identique
   à l'écran, à l'impression et en PDF.
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
const moisAnnee = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const pad2 = (n: number) => String(n).padStart(2, "0");
const etageCourt = (etage: number) => (etage === 0 ? "RDC" : `${etage}${etage === 1 ? "er" : "e"}`);

/** Comparable affiché sur la page « Le marché » (vente notariée ou bien en vente). */
type Comp = { id: string; adresse: string; prix: number; surface?: number; sqm: number; meta: string };

export default function AvisDeValeur() {
  const { id } = useParams<{ id: string }>();
  const { doc: e } = useDoc("estimations", id);
  const { items: contacts } = useCollection("contacts");
  const { items: biens } = useCollection("biens");
  const [zoom, setZoom] = useState(1);
  const [afficherNom, setAfficherNom] = useState(true);
  const [attente, setAttente] = useState(true);
  const signature = useSignature();

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    const t = setTimeout(() => setAttente(false), 1500);
    return () => {
      window.removeEventListener("resize", fit);
      clearTimeout(t);
    };
  }, []);

  const ventes = useMemo(() => ventesDe(e).filter((v) => !v.exclu), [e]);
  const addr = e?.adresse ?? "";
  const cpMatch = addr.match(/,?\s*(\d{5}\s+.+)$/);
  const street = (cpMatch ? addr.slice(0, cpMatch.index) : addr.split(",")[0]).replace(/,\s*$/, "").trim() || "Votre bien";

  useEffect(() => {
    if (!e) return;
    const prev = document.title;
    document.title = `Avis de valeur – ${street}`;
    return () => {
      document.title = prev;
    };
  }, [e, street]);

  if (!e) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: "#e5e5ea", color: "#1d1d1f" }}>
        {attente ? (
          "Préparation de l'avis de valeur…"
        ) : (
          <div>
            <p>Estimation introuvable.</p>
            <Link href="/estimations" className="mt-3 inline-block underline">
              Retour aux estimations
            </Link>
          </div>
        )}
      </div>
    );
  }

  const p = asPlus(e);
  const r = e.resultat;
  const bien = e.bienId ? biens.find((b) => b.id === e.bienId) : undefined;
  const avis = avisComplet(e, bien);
  const proprio = contacts.find((c) => c.id === e.proprietaireId);
  const clientName = afficherNom && proprio ? [proprio.civilite, proprio.prenom, proprio.nom].filter(Boolean).join(" ") : "";
  const clientAddress = afficherNom ? avis.clientAdresse ?? proprio?.adresse : undefined;
  const city = cpMatch ? cpMatch[1].trim() : [e.codePostal, e.ville].filter(Boolean).join(" ");
  const today = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const surface = e.surface || 0;
  const propertyType = typeLabel(e.type);
  const dpeLetter = (e.dpe || "").toUpperCase().slice(0, 1);

  // Valeurs : fourchette du calcul, valeur centrale = prix de présentation conseillé
  const low = r?.bas || 0;
  const high = r?.haut || 0;
  const central = e.prixConseille || r?.median || (low && high ? Math.round((low + high) / 2) : low || high);
  const estimatedPriceSqm = central / (surface || 1);
  const singleValue = !!central && (!low || !high || low === high);

  // Marché : ventes notariées (DVF) les plus proches et biens en vente saisis
  const marketStats =
    p.marche && p.rayon
      ? { median: p.marche.medianSqm, count: p.marche.count, radius: p.rayon, years: (p.periode ?? "").split(/\s*–\s*/).filter(Boolean) }
      : null;
  const proches = [...ventes].sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
  const versComp = (v: Vente): Comp => ({
    id: v.id,
    adresse: [v.adresse, v.ville].filter(Boolean).join(", "),
    prix: v.prix,
    surface: v.surface,
    sqm: v.prixM2 || (v.surface ? v.prix / v.surface : 0),
    meta: [v.surface ? `${surf(v.surface)} m²` : "", v.date ? `vendu en ${moisAnnee(v.date)}` : "", v.distance != null ? `à ${v.distance} m` : v.source === "agence" ? "vente de l'agence" : ""]
      .filter(Boolean)
      .join(" · "),
  });
  const enVente: Comp[] = (avis.enVente ?? []).map((c: BienEnVente) => ({
    id: c.id,
    adresse: c.adresse,
    prix: c.prix,
    surface: c.surface,
    sqm: c.surface ? c.prix / c.surface : 0,
    meta: [c.surface ? `${surf(c.surface)} m²` : "", c.portail ?? ""].filter(Boolean).join(" · "),
  }));
  const vendus = proches.map(versComp);
  const allComps = [...vendus, ...enVente];
  const hasMarketPage = allComps.length > 0;
  const soldList = vendus.slice(0, 5);
  const saleList = enVente.slice(0, Math.max(3, 8 - soldList.length));
  const compactComps = soldList.length + saleList.length > 6 || (soldList.length + saleList.length > 5 && !!marketStats);

  // Photos : la première en couverture, trois suivantes sur la page « Le bien », toute la galerie en fin de document
  const photos = avis.photos ?? [];
  const mainPhoto = photos[0];
  const bienPhotos = photos.length > 1 ? photos.slice(1, 4) : [];
  const galleryPhotos = avis.pagesPhotos && photos.length > 1 ? photos : [];
  const PHOTOS_PER_PAGE = 8;
  const photoChunks: string[][] = [];
  for (let i = 0; i < galleryPhotos.length; i += PHOTOS_PER_PAGE) photoChunks.push(galleryPhotos.slice(i, i + PHOTOS_PER_PAGE));
  const hasPhotoPage = photoChunks.length > 0;
  const totalPages = 3 + (hasMarketPage ? 1 : 0) + photoChunks.length;
  const pageOf = (n: number) => `${n} / ${totalPages}`;
  const conclusionPage = hasMarketPage ? 4 : 3;

  const pricesPerSqm = allComps.map((c) => c.sqm).filter((x) => x > 0);
  let minPriceGraph = Math.min(...pricesPerSqm, estimatedPriceSqm || Infinity);
  let maxPriceGraph = Math.max(...pricesPerSqm, estimatedPriceSqm || 0);
  if (minPriceGraph === Infinity) minPriceGraph = 0;
  minPriceGraph = minPriceGraph * 0.92;
  maxPriceGraph = maxPriceGraph * 1.08;
  const getPositionPercent = (price: number) => (maxPriceGraph === minPriceGraph ? 50 : ((price - minPriceGraph) / (maxPriceGraph - minPriceGraph)) * 100);

  const hasCharges = (avis.taxeFonciere ?? 0) > 0 || !!avis.copro;
  const strengths = avis.pointsForts ?? [];
  const weaknesses = avis.pointsVigilance ?? [];
  const hasOpinion = strengths.length > 0 || weaknesses.length > 0;
  const analyse = (avis.analyse ?? r?.commentaire ?? "").trim();
  const loyer = avis.loyer ?? 0;
  const amenityLabels = avis.equipements ?? [];

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
  const renderTitle = (title: string, subtitle?: string) => (
    <div className="shrink-0 px-[14mm] pb-[6mm] pt-[7mm]">
      <h2 className="text-[30px] font-bold leading-[1.05] tracking-[-0.03em] text-[#1d1d1f]">{title}</h2>
      {subtitle && <p className="mt-1.5 text-[12px] text-[#6e6e73]">{subtitle}</p>}
    </div>
  );
  const renderFooter = (n: number) => (
    <div className="mt-auto shrink-0 px-[14mm] pb-[8mm] pt-[4mm]">
      <div className="mb-[3mm] h-px bg-[#e8e8ed]" />
      <div className="flex items-center justify-between text-[7.5px] text-[#86868b]">
        <span>Agence Patrim · 45, allées Jean Jaurès, 31000 Toulouse · 05 61 99 08 08 · patrim.fr</span>
        <span className="font-semibold tabular-nums">{pageOf(n)}</span>
      </div>
    </div>
  );
  const renderEnergyRail = (current: string, label: string, caption: string) => {
    const cur = (current || "").toUpperCase().slice(0, 1);
    return (
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className={LABEL}>{label}</p>
          <p className="text-[8px] text-[#86868b]">{caption}</p>
        </div>
        <div className="flex h-[26px] items-end gap-[3px]">
          {["A", "B", "C", "D", "E", "F", "G"].map((l) => {
            const on = cur === l;
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
        {!cur && <p className="mt-1.5 text-[8px] text-[#86868b]">Non communiqué</p>}
      </div>
    );
  };
  const renderSignature = (imgMm = 15) => (
    <div className="flex items-end justify-between gap-6">
      <div>
        <p className={LABEL}>Fait à Toulouse, le {today}</p>
        <p className={`text-[14px] font-semibold text-[#1d1d1f] ${imgMm < 15 ? "mt-1" : "mt-2"}`}>{CONSEILLER.nom}</p>
        <p className="text-[10px] text-[#6e6e73]">{CONSEILLER.role} · Patrim Toulouse</p>
      </div>
      {signature && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signature} alt="Signature" className="w-auto max-w-[38mm] object-contain mix-blend-multiply" style={{ height: `${imgMm}mm` }} />
      )}
    </div>
  );
  const renderCompRow = (comp: Comp, accent: string) => {
    const ref = estimatedPriceSqm > 0 ? estimatedPriceSqm : pricesPerSqm.length ? pricesPerSqm.reduce((a, b) => a + b, 0) / pricesPerSqm.length : 0;
    const delta = ref > 0 && comp.sqm > 0 ? Math.round(((comp.sqm - ref) / ref) * 100) : null;
    return (
      <div key={comp.id} className={`flex items-center gap-3.5 border-b border-[#f0f0f2] last:border-b-0 ${compactComps ? "py-[1.7mm]" : "py-[2.6mm]"}`}>
        <div className={`${compactComps ? "h-[11.5mm] w-[11.5mm]" : "h-[15mm] w-[15mm]"} flex shrink-0 items-center justify-center rounded-[10px] bg-[#f5f5f7]`}>
          <Home size={15} className="text-[#aeaeb2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-[#1d1d1f]">{comp.adresse}</p>
          <p className="mt-0.5 truncate text-[9px] text-[#86868b]">{comp.meta}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[13px] font-bold tabular-nums tracking-[-0.01em] text-[#1d1d1f]">{eur(comp.prix)}</p>
          <div className="mt-0.5 flex items-center justify-end gap-1.5">
            {comp.sqm > 0 && (
              <span className="text-[9px] font-semibold tabular-nums" style={{ color: accent }}>
                {nombre(comp.sqm)} €/m²
              </span>
            )}
            {delta !== null && (
              <span className={`rounded-full px-1.5 py-[1px] text-[8px] font-bold tabular-nums ${delta > 0 ? "bg-[#e8f7ec] text-[#248a3d]" : "bg-[#fdecec] text-[#d70015]"}`}>
                {delta > 0 ? "+" : ""}
                {delta} %
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };
  const photoGrid = (n: number) => ({ cols: n === 1 ? 1 : 2, rows: n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4 });

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
          <Link href={`/estimations/${e.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Retour
          </Link>
          <Link href={`/estimations/${e.id}#avis`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium hover:bg-black/5">
            <Pencil size={15} /> Compléter
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
            onClick={() => window.print()}
            className={`${proprio ? "" : "ml-auto "}inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white active:scale-[.98]`}
            style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`, boxShadow: "0 8px 24px -8px rgba(138,14,1,0.6)" }}
          >
            <Printer size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="pdf-stage pdf-font min-h-screen py-6 sm:py-10" style={{ backgroundColor: "#e5e5ea", zoom }}>
        {/* ============ PAGE 1 : COUVERTURE ============ */}
        <div className={PAGE}>
          <div className="relative h-[168mm] shrink-0 bg-[#1c1c1e]">
            {mainPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mainPhoto} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: "radial-gradient(120% 100% at 20% 0%, #5a1208, #120807 70%)" }} />
            )}
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
          </div>
          <div className="flex flex-1 flex-col px-[14mm] pt-[10mm]">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: COLORS.primary }}>
              Avis de valeur
            </p>
            <h1 className="mt-2 text-[40px] font-bold leading-[1.02] tracking-[-0.035em] text-[#1d1d1f]">{street}</h1>
            {city && <p className="mt-1.5 text-[15px] text-[#6e6e73]">{city}</p>}
            <div className="mt-5 flex flex-wrap gap-1.5">
              {[
                propertyType,
                surface > 0 ? `${surf(surface)} m²` : "",
                e.pieces ? `${e.pieces} pièce${e.pieces > 1 ? "s" : ""}` : "",
                e.type === "appartement" && e.etage != null ? (e.etage === 0 ? "Rez-de-chaussée" : `${etageCourt(e.etage)} étage`) : "",
                avis.annee ? `Construit en ${avis.annee}` : "",
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
            <div className="mt-[11mm]">
              <p className={`${LABEL} mb-2.5`}>Sommaire</p>
              <div className="grid grid-cols-2 gap-x-8">
                {[
                  { t: "Le bien", p: 2 },
                  ...(hasMarketPage ? [{ t: "Le marché", p: 3 }] : []),
                  { t: "Notre estimation", p: conclusionPage },
                  ...(hasPhotoPage ? [{ t: "Photographies", p: conclusionPage + 1 }] : []),
                ].map((x, i) => (
                  <div key={x.t} className="flex items-baseline gap-3 border-b border-[#f0f0f2] py-2">
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: COLORS.primary }}>
                      {pad2(i + 1)}
                    </span>
                    <span className="flex-1 text-[11.5px] font-medium text-[#1d1d1f]">{x.t}</span>
                    <span className="text-[9.5px] tabular-nums text-[#86868b]">p. {x.p}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-8 border-t border-[#e8e8ed] pt-[6mm]">
              <div>
                <p className={LABEL}>Établi pour</p>
                <p className="mt-1.5 text-[14px] font-semibold text-[#1d1d1f]">{clientName || "—"}</p>
                {clientAddress && <p className="mt-0.5 text-[10px] leading-snug text-[#6e6e73]">{clientAddress}</p>}
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
            <span className="font-semibold tabular-nums">{pageOf(1)}</span>
          </div>
        </div>

        {/* ============ PAGE 2 : LE BIEN ============ */}
        <div className={PAGE}>
          {renderHeader(1, "Le bien")}
          {renderTitle("Le bien", `${propertyType}${surface > 0 ? ` de ${surf(surface)} m²` : ""}${e.pieces ? ` · ${e.pieces} pièces` : ""}${city ? ` · ${city}` : ""}`)}
          <div className="flex min-h-0 flex-1 flex-col gap-[5mm] px-[14mm] pb-[2mm]">
            {(() => {
              const keys = [
                { l: "Surface", v: surface > 0 ? surf(surface) : "—", u: "m²", sub: "surface déclarée" },
                { l: "Pièces", v: e.pieces ? String(e.pieces) : "—", u: "", sub: "" },
                e.type === "maison"
                  ? { l: "Terrain", v: p.surfaceTerrain ? nombre(p.surfaceTerrain) : "—", u: p.surfaceTerrain ? "m²" : "", sub: "" }
                  : { l: "Étage", v: e.etage != null ? etageCourt(e.etage) : "—", u: "", sub: e.etage != null && e.etage > 0 ? (e.ascenseur ? "avec ascenseur" : "sans ascenseur") : "" },
                ...(avis.annee ? [{ l: "Construction", v: String(avis.annee), u: "", sub: "" }] : []),
              ];
              return (
                <div className="grid rounded-[18px] bg-[#f5f5f7] py-[5mm]" style={{ gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))` }}>
                  {keys.map((k, i) => (
                    <div key={k.l} className={`px-[5mm] ${i > 0 ? "border-l border-[#e3e3e8]" : ""}`}>
                      <p className={LABEL}>{k.l}</p>
                      <p className="mt-1.5 whitespace-nowrap leading-none text-[#1d1d1f]">
                        <span className="text-[26px] font-bold tabular-nums tracking-[-0.03em]">{k.v}</span>
                        {k.u && <span className="ml-1 text-[10px] font-medium text-[#6e6e73]">{k.u}</span>}
                      </p>
                      {k.sub && <p className="mt-1.5 text-[8.5px] text-[#86868b]">{k.sub}</p>}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Mosaïque : photos du bien et plan de situation */}
            {(() => {
              const hasMap = e.lat != null && e.lon != null;
              const cells: ({ kind: "photo"; url: string } | { kind: "map" })[] = bienPhotos.map((url) => ({ kind: "photo" as const, url }));
              if (hasMap && cells.length < 4) cells.push({ kind: "map" });
              const n = cells.length;
              if (!n) return null;
              const layout = n === 1 ? { cols: 1, rows: 1 } : n === 2 ? { cols: 2, rows: 1 } : n === 3 ? { cols: 3, rows: 2 } : { cols: 4, rows: 2 };
              const span = (i: number) => (n >= 3 && i === 0 ? "col-span-2 row-span-2" : n === 4 && i === 3 ? "col-span-2" : "");
              return (
                <div className="grid min-h-[62mm] flex-1 gap-[3mm]" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))` }}>
                  {cells.map((c, i) => (
                    <div key={i} className={`relative min-h-0 overflow-hidden rounded-[16px] bg-[#f5f5f7] ${span(i)}`}>
                      {c.kind === "photo" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <>
                          <SituationMap lat={e.lat!} lon={e.lon!} color={COLORS.primary} />
                          <span className="absolute left-[3mm] top-[3mm] rounded-full bg-white/90 px-2 py-1 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-[#1d1d1f] shadow-sm">
                            Situation{city ? ` · ${city.replace(/^\d{5}\s*/, "")}` : ""}
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Énergie et charges */}
            <div className={`grid gap-[4mm] ${hasCharges ? "grid-cols-[1.35fr_1fr]" : "grid-cols-1"}`}>
              <div className="rounded-[18px] border border-[#e8e8ed] p-[5mm]">
                <p className="mb-[4mm] flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                  <Leaf size={13} className="text-[#248a3d]" /> Performance énergétique
                </p>
                <div className="grid grid-cols-2 gap-[6mm]">
                  {renderEnergyRail(e.dpe ?? "", "DPE", "énergie")}
                  {renderEnergyRail(avis.ges ?? "", "GES", "climat")}
                </div>
              </div>
              {hasCharges && (
                <div className="rounded-[18px] border border-[#e8e8ed] p-[5mm]">
                  <p className="mb-[4mm] flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                    <Banknote size={13} style={{ color: COLORS.primary }} /> Charges annuelles
                  </p>
                  <div className="space-y-2.5">
                    {(avis.taxeFonciere ?? 0) > 0 && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10.5px] text-[#6e6e73]">Taxe foncière</span>
                        <span className="text-[14px] font-bold tabular-nums text-[#1d1d1f]">{eur(avis.taxeFonciere!)}</span>
                      </div>
                    )}
                    {avis.copro && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10.5px] text-[#6e6e73]">Charges de copropriété</span>
                        <span className="text-[14px] font-bold tabular-nums text-[#1d1d1f]">{avis.chargesMois ? eur(avis.chargesMois * 12) : "—"}</span>
                      </div>
                    )}
                    {avis.copro && !!avis.chargesMois && <p className="text-right text-[9px] text-[#86868b]">soit {eur(avis.chargesMois)} par mois</p>}
                  </div>
                </div>
              )}
            </div>

            {amenityLabels.length > 0 && (
              <div>
                <p className={`${LABEL} mb-2`}>Équipements et annexes</p>
                <div className="flex flex-wrap gap-1.5">
                  {amenityLabels.map((l) => (
                    <span key={l} className="rounded-full bg-[#f5f5f7] px-3 py-1.5 text-[10px] font-medium text-[#1d1d1f]">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {avis.descriptif?.trim() && (
              <div>
                <p className={`${LABEL} mb-2`}>Descriptif et prestations</p>
                <p className="line-clamp-[10] whitespace-pre-wrap text-[10.5px] leading-[1.55] text-[#3a3a3c]">{avis.descriptif}</p>
              </div>
            )}
          </div>
          {renderFooter(2)}
        </div>

        {/* ============ PAGE 3 : MARCHÉ ============ */}
        {hasMarketPage && (
          <div className={PAGE}>
            {renderHeader(2, "Le marché")}
            {renderTitle("Le marché", "Ventes notariées et biens actuellement en vente autour de l'adresse")}
            <div className={`flex min-h-0 flex-col px-[14mm] ${compactComps ? "gap-[3.5mm]" : "gap-[5mm]"}`}>
              {marketStats && (
                <div className="grid grid-cols-4 rounded-[18px] bg-[#f5f5f7] py-[4.5mm]">
                  {[
                    { l: "Prix médian vendu", v: nombre(marketStats.median), u: "€/m²" },
                    { l: "Ventes analysées", v: String(marketStats.count), u: "actes DVF" },
                    { l: "Périmètre", v: marketStats.radius >= 1000 ? `${marketStats.radius / 1000}` : String(marketStats.radius), u: marketStats.radius >= 1000 ? "km" : "m" },
                    { l: "Notre estimation", v: estimatedPriceSqm > 0 ? nombre(estimatedPriceSqm) : "—", u: "€/m²", accent: true },
                  ].map((k, i) => (
                    <div key={k.l} className={`px-[5mm] ${i > 0 ? "border-l border-[#e3e3e8]" : ""}`}>
                      <p className={LABEL}>{k.l}</p>
                      <p className="mt-1.5 leading-none">
                        <span className="text-[21px] font-bold tabular-nums tracking-[-0.03em]" style={{ color: k.accent ? COLORS.primary : "#1d1d1f" }}>
                          {k.v}
                        </span>
                        <span className="ml-1 text-[9.5px] font-medium text-[#6e6e73]">{k.u}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {central > 0 && pricesPerSqm.length > 0 && (
                <div className={`rounded-[18px] border border-[#e8e8ed] px-[6mm] pb-[3mm] ${compactComps ? "pt-[4mm]" : "pt-[5mm]"}`}>
                  <div className="flex items-baseline justify-between">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                      <BarChart3 size={13} style={{ color: COLORS.primary }} /> Positionnement au m²
                    </p>
                    {marketStats && marketStats.years.length > 0 && (
                      <p className="text-[8.5px] text-[#86868b]">
                        Ventes {marketStats.years[0]}
                        {marketStats.years.length > 1 ? `–${marketStats.years[marketStats.years.length - 1]}` : ""}
                      </p>
                    )}
                  </div>
                  <div className={`relative mt-2 w-full ${compactComps ? "h-[24mm]" : "h-[27mm]"}`}>
                    <div className="absolute inset-x-0 h-[4px] rounded-full bg-[#f0f0f2]" style={{ top: "12mm" }} />
                    {!singleValue && (
                      <div
                        className="absolute h-[4px] rounded-full"
                        style={{
                          top: "12mm",
                          background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.secondary})`,
                          left: `${getPositionPercent(low / (surface || 1))}%`,
                          width: `${Math.max(0, getPositionPercent(high / (surface || 1)) - getPositionPercent(low / (surface || 1)))}%`,
                        }}
                      />
                    )}
                    {(() => {
                      const points = allComps
                        .filter((c) => c.sqm > 0)
                        .map((c, i) => ({ i, pct: getPositionPercent(c.sqm), sqm: Math.round(c.sqm) }))
                        .sort((a, b) => a.pct - b.pct);
                      // Étiquettes sur deux lignes, sans chevauchement : une valeur trop proche des deux précédentes n'est pas écrite
                      const GAP = 5.5;
                      const lanes = [-Infinity, -Infinity];
                      const estPct = getPositionPercent(estimatedPriceSqm);
                      const labelled = points.map((pt) => {
                        if (Math.abs(pt.pct - estPct) < 1.2) return { ...pt, lane: -1 };
                        const lane = lanes.findIndex((end) => pt.pct - end >= GAP);
                        if (lane >= 0) lanes[lane] = pt.pct;
                        return { ...pt, lane };
                      });
                      return labelled.map((pt) => (
                        <div key={pt.i} className="absolute h-[9px] w-[9px] -translate-x-1/2 rounded-full border-2 border-white bg-[#aeaeb2]" style={{ top: "calc(12mm - 2.5px)", left: `${pt.pct}%` }}>
                          {pt.lane >= 0 && (
                            <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[7.5px] font-medium tabular-nums text-[#6e6e73]" style={{ top: pt.lane === 0 ? "11px" : "22px" }}>
                              {nombre(pt.sqm)}
                            </span>
                          )}
                        </div>
                      ));
                    })()}
                    <div
                      className="absolute h-[18px] w-[18px] -translate-x-1/2 rounded-full border-[3px] border-white shadow-[0_2px_8px_rgba(138,14,1,0.45)]"
                      style={{ top: "calc(12mm - 7px)", left: `${getPositionPercent(estimatedPriceSqm)}%`, background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})` }}
                    >
                      <span
                        className="absolute -top-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[9.5px] font-bold tabular-nums shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
                        style={{ color: COLORS.primary }}
                      >
                        Notre estimation · {nombre(estimatedPriceSqm)} €/m²
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {soldList.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                    <CheckCircle size={13} className="text-[#248a3d]" /> Vendus récemment <span className="font-normal text-[#86868b]">· ventes notariées</span>
                  </p>
                  <div>{soldList.map((c) => renderCompRow(c, "#248a3d"))}</div>
                </div>
              )}
              {saleList.length > 0 && (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]">
                    <TrendingUp size={13} className="text-[#c93400]" /> Actuellement en vente <span className="font-normal text-[#86868b]">· concurrence</span>
                  </p>
                  <div>{saleList.map((c) => renderCompRow(c, "#c93400"))}</div>
                </div>
              )}
            </div>
            {renderFooter(3)}
          </div>
        )}

        {/* ============ PAGE 4 : ESTIMATION ============ */}
        <div className={PAGE}>
          {renderHeader(hasMarketPage ? 3 : 2, "Notre estimation")}
          {renderTitle("Notre estimation", "Valeur vénale du bien au regard du marché et de ses caractéristiques")}
          {/* Le contenu s'adapte à la hauteur de la page : densité 0 (aéré) → MAX_DENSITY (serré) ; aucun bloc n'est coupé. */}
          <FitToPage className="px-[14mm]" columnStyle={(d) => ({ gap: `${5 - 2.6 * (d / MAX_DENSITY)}mm`, justifyContent: d > 0 ? "space-between" : undefined })}>
            {(d) => {
              const t = d / MAX_DENSITY;
              /** Valeur entre « aéré » et « serré » ; from = part de la course à partir de laquelle elle commence à bouger */
              const mix = (loose: number, tight: number, from = 0) => {
                const k = Math.min(1, Math.max(0, (t - from) / (1 - from)));
                return Math.round((loose + (tight - loose) * k) * 100) / 100;
              };
              const mm = (loose: number, tight: number) => `${mix(loose, tight)}mm`;
              const compact = t >= 0.75;
              return (
                <>
                  {avis.loue ? (
                    <div className="grid shrink-0 grid-cols-2 gap-[4mm]">
                      {[
                        { t: "Valeur libre", lo: low, hi: high, c: central },
                        { t: "Valeur occupée (vendu loué)", lo: avis.basLoue ?? 0, hi: avis.hautLoue ?? 0, c: 0 },
                      ].map((v) => {
                        const c = v.c || (v.lo && v.hi ? Math.round((v.lo + v.hi) / 2) : v.lo || v.hi);
                        return (
                          <div key={v.t} className="rounded-[18px] border border-[#e8e8ed] text-[#1d1d1f]" style={{ padding: mm(6, 3.4) }}>
                            <p className={LABEL}>{v.t}</p>
                            <p className="mt-2 font-semibold leading-none tabular-nums tracking-[-0.02em]" style={{ fontSize: mix(22, 18, 0.25) }}>
                              {c ? eur(c) : "—"}
                            </p>
                            {v.lo > 0 && v.hi > 0 && v.lo !== v.hi && (
                              <p className="mt-2 text-[10.5px] tabular-nums text-[#6e6e73]">
                                de {eur(v.lo)} à {eur(v.hi)}
                              </p>
                            )}
                            {c > 0 && surface > 0 && (
                              <span className="inline-block text-[9.5px] font-medium tabular-nums text-[#6e6e73]" style={{ marginTop: mix(10, 5) }}>
                                {nombre(c / surface)} €/m²
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="shrink-0 rounded-[18px] border border-[#e8e8ed] px-[7mm]" style={{ paddingTop: mm(6, 3.4), paddingBottom: mm(6, 3.4) }}>
                      <p className={LABEL}>Valeur vénale estimée</p>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2" style={{ marginTop: mix(8, 4) }}>
                        <p className="font-semibold leading-none tabular-nums tracking-[-0.02em] text-[#1d1d1f]" style={{ fontSize: mix(28, 22, 0.25) }}>
                          {central ? eur(central) : "—"}
                        </p>
                        <p className="text-[10.5px] tabular-nums text-[#6e6e73]">
                          {[
                            !singleValue ? `Fourchette ${eur(low)} – ${eur(high)}` : "",
                            central > 0 && surface > 0 ? `${nombre(central / surface)} €/m²` : "",
                            marketStats ? `Médiane du secteur ${nombre(marketStats.median)} €/m²` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  )}

                  {loyer > 0 && (
                    <div className="grid shrink-0 grid-cols-3 rounded-[18px] bg-[#f5f5f7]" style={{ paddingTop: mm(4.5, 2.3), paddingBottom: mm(4.5, 2.3) }}>
                      {[
                        { l: "Valeur locative", v: eur(loyer), u: "HC / mois" },
                        { l: "Rendement brut", v: `${(((loyer * 12) / (central || 1)) * 100).toFixed(1).replace(".", ",")} %`, u: "sur la valeur centrale" },
                        { l: "Loyer au m²", v: `${Math.round(loyer / (surface || 1))} €`, u: "par mois" },
                      ].map((k, i) => (
                        <div key={k.l} className={`px-[5mm] ${i > 0 ? "border-l border-[#e3e3e8]" : ""}`}>
                          <p className={LABEL}>{k.l}</p>
                          <p className="mt-1.5 font-bold leading-none tabular-nums tracking-[-0.03em] text-[#1d1d1f]" style={{ fontSize: mix(20, 16, 0.5) }}>
                            {k.v}
                          </p>
                          <p className="mt-1 text-[8.5px] text-[#86868b]">{k.u}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {hasOpinion && (
                    <div className="grid shrink-0 grid-cols-2 gap-[4mm]">
                      {[
                        { t: "Points forts", items: strengths, icon: ThumbsUp, c: "#248a3d", bg: "#e8f7ec" },
                        { t: "Points de vigilance", items: weaknesses, icon: ThumbsDown, c: "#c93400", bg: "#fff1e6" },
                      ]
                        .filter((b) => b.items.length > 0)
                        .map((b) => (
                          <div key={b.t} className="rounded-[18px] border border-[#e8e8ed]" style={{ padding: mm(5, 2.8) }}>
                            <p className="flex items-center gap-2 text-[12px] font-semibold text-[#1d1d1f]" style={{ marginBottom: mix(12, 5) }}>
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

                  {analyse && (
                    <div className="shrink-0 rounded-[18px] bg-[#f5f5f7]" style={{ padding: mm(6, 3.2) }}>
                      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[#1d1d1f]" style={{ marginBottom: mix(8, 4) }}>
                        <Star size={13} style={{ color: COLORS.primary }} /> L&apos;analyse de votre conseiller
                      </p>
                      <p className="line-clamp-[12] whitespace-pre-wrap text-[#3a3a3c]" style={{ fontSize: mix(11, 10, 0.5), lineHeight: mix(1.6, 1.4) }}>
                        {analyse}
                      </p>
                    </div>
                  )}

                  <div className="grid shrink-0 grid-cols-3 gap-[3mm]">
                    {[
                      {
                        n: "1",
                        t: "Ventes réelles",
                        d: marketStats
                          ? `${marketStats.count} ventes notariées (DVF) à moins de ${marketStats.radius >= 1000 ? `${marketStats.radius / 1000} km` : `${marketStats.radius} m`}`
                          : `${vendus.length} ventes comparables du secteur`,
                      },
                      {
                        n: "2",
                        t: "Offre concurrente",
                        d: enVente.length ? `${enVente.length} bien${enVente.length > 1 ? "s" : ""} comparable${enVente.length > 1 ? "s" : ""} actuellement en vente` : "Biens en vente du quartier analysés",
                      },
                      { n: "3", t: "Visite du bien", d: "État, prestations, étage, extérieurs et performance énergétique" },
                    ].map((m) => (
                      <div key={m.n} className="rounded-[16px] border border-[#e8e8ed]" style={{ padding: mm(4, 2.4) }}>
                        <div className={compact ? "flex items-center gap-2" : ""}>
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                            style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})` }}
                          >
                            {m.n}
                          </span>
                          <p className={`text-[11px] font-semibold text-[#1d1d1f] ${compact ? "" : "mt-2"}`}>{m.t}</p>
                        </div>
                        <p className="mt-0.5 text-[9px] leading-snug text-[#6e6e73]">{m.d}</p>
                      </div>
                    ))}
                  </div>

                  <div className={`shrink-0 ${d > 0 ? "" : "mt-auto pt-[2mm]"}`}>{renderSignature(mix(15, 12, 0.5))}</div>
                </>
              );
            }}
          </FitToPage>
          <div className="mt-auto shrink-0 px-[14mm] pt-[4mm]">
            <p className="text-justify text-[6.5px] leading-[1.55] text-[#aeaeb2]">
              Sous réserve que l&apos;étude des diagnostics techniques et du carnet numérique du logement ne révèle pas d&apos;anomalie ni de non-conformité affectant sa valeur. Document à usage
              strictement privé. Conformément à la réglementation, le professionnel de l&apos;immobilier n&apos;est en aucun cas qualifié pour déterminer la surface du bien de manière
              réglementaire. La surface indiquée a été communiquée par le propriétaire, lue sur le titre de propriété ou sur l&apos;avis de taxe foncière. Pour toute commercialisation de ce bien,
              le mandant fera appel à un diagnostiqueur professionnel dont la loi impose la qualification pour attester de la surface Carrez s&apos;il s&apos;agit d&apos;un bien en copropriété ou de
              la surface de plancher pour les maisons de ville ou pavillons. Le professionnel de l&apos;immobilier, rédacteur du présent avis de valeur, n&apos;assume aucune responsabilité sur la
              surface qui serait attestée par le diagnostiqueur et qui servirait de base juridique dans l&apos;avant-contrat et l&apos;acte définitif, ni sur les conséquences qui y seraient liées. De
              même, le présent document n&apos;engage pas la responsabilité du professionnel de l&apos;immobilier quant à la conformité de l&apos;état du bâti face aux divers diagnostics (amiante,
              plomb, gaz, électricité, assainissement, termites, mérules).
            </p>
          </div>
          {renderFooter(conclusionPage)}
        </div>

        {/* ============ PAGES PHOTOS : toute la galerie ============ */}
        {photoChunks.map((chunk, k) => {
          const g = photoGrid(chunk.length);
          return (
            <div key={`photos-${k}`} className={PAGE}>
              {renderHeader(hasMarketPage ? 4 : 3, "Photographies")}
              {renderTitle(k === 0 ? "Le bien en images" : "Le bien en images (suite)", `${galleryPhotos.length} vue${galleryPhotos.length > 1 ? "s" : ""} · ${street}`)}
              <div className="min-h-0 flex-1 px-[14mm]">
                <div className="grid h-full gap-[3mm]" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${g.rows}, minmax(0, 1fr))` }}>
                  {chunk.map((url, i) => (
                    <div key={i} className={`min-h-0 overflow-hidden rounded-[14px] bg-[#f5f5f7] ${chunk.length > 1 && chunk.length % 2 === 1 && i === chunk.length - 1 ? "col-span-2" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
              {renderFooter(conclusionPage + 1 + k)}
            </div>
          );
        })}
      </div>
    </>
  );
}
