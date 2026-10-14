"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ETAT_LABEL, asPlus, etageLabel, resumeBien, typeLabel, ventesDe, type Vente } from "@/components/estimations/shared";
import { dateCourte, eur } from "@/lib/format";
import { useCollection, useDoc } from "@/lib/store";

/* ============================================================
   Avis de valeur imprimable (A4) — charte PATRIM.
   Couleurs fixes (pas de thème sombre) pour un rendu identique
   à l'écran, à l'impression et en PDF.
   ============================================================ */

const C = {
  brand: "#6c191e",
  coral: "#ef402a",
  ink: "#1b1e23",
  slate: "#4a4f55",
  muted: "#7a7f87",
  line: "#e5e0da",
  cream: "#f8f5f0",
};

const AGENCE = {
  nom: "PATRIM",
  adresse: "45 allées Jean Jaurès, 31000 Toulouse",
  tel: "05 61 99 08 08",
  conseiller: "Quentin Delsol",
  conseillerTitre: "Conseiller en vente",
  conseillerTel: "06 52 45 96 54",
};

const DPE_COLORS: Record<string, string> = { A: "#009c6d", B: "#52b153", C: "#78bd76", D: "#f4e70f", E: "#f0b50f", F: "#eb8235", G: "#d7221f" };

export default function AvisDeValeur() {
  const { id } = useParams<{ id: string }>();
  const { doc: e } = useDoc("estimations", id);
  const { items: contacts } = useCollection("contacts");
  const [zoom, setZoom] = useState(1);
  const [afficherNom, setAfficherNom] = useState(true);
  const [attente, setAttente] = useState(true);

  useEffect(() => {
    const fit = () => setZoom(Math.min(1, (window.innerWidth - 24) / 794));
    fit();
    window.addEventListener("resize", fit);
    const t = setTimeout(() => setAttente(false), 1500);
    return () => {
      window.removeEventListener("resize", fit);
      clearTimeout(t);
    };
  }, []);

  const ventes = useMemo(() => ventesDe(e).filter((v) => !v.exclu), [e]);
  const rue = e ? e.adresse.replace(/\s*\d{5}\s+.*$/, "").trim() || e.adresse : "";

  useEffect(() => {
    if (!e) return;
    const prev = document.title;
    document.title = `Avis de valeur – ${rue}`;
    return () => {
      document.title = prev;
    };
  }, [e, rue]);

  if (!e) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-sm" style={{ background: "#ece8e2", color: C.ink }}>
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
  const proprio = contacts.find((c) => c.id === e.proprietaireId);
  const nomProprio = proprio ? [proprio.civilite, proprio.prenom, proprio.nom].filter(Boolean).join(" ") : "";
  const villeLigne = [e.codePostal, e.ville].filter(Boolean).join(" ");
  const dateAvis = new Date(e.updatedAt || e.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const conseille = e.prixConseille ?? r?.median;
  const tableau = ventes.slice(0, 12);
  const total = 4;

  const caracteristiques: [string, ReactNode][] = [
    ["Type de bien", typeLabel(e.type)],
    ["Surface", `${e.surface.toLocaleString("fr-FR")} m²${e.type === "appartement" ? " (Carrez)" : " habitables"}`],
    ["Nombre de pièces", e.pieces ?? "[À compléter]"],
    ...(p.surfaceTerrain ? ([["Terrain", `${p.surfaceTerrain.toLocaleString("fr-FR")} m²`]] as [string, ReactNode][]) : []),
    ...(e.type === "appartement" ? ([["Étage", etageLabel(e.etage, e.ascenseur) ?? "[À compléter]"]] as [string, ReactNode][]) : []),
    ["Extérieur", e.exterieur || "Aucun"],
    ["Stationnement", e.parking ? "Oui" : "Non"],
    ["État général", e.etat ? ETAT_LABEL[e.etat] : "[À compléter]"],
    [
      "Diagnostic énergie",
      e.dpe ? (
        <span key="dpe" className="inline-flex items-center gap-2">
          <span className="inline-grid size-[22px] place-items-center rounded text-[11px] font-bold" style={{ background: DPE_COLORS[e.dpe], color: e.dpe === "D" ? "#333" : "#fff" }}>
            {e.dpe}
          </span>
          Classe {e.dpe}
        </span>
      ) : (
        "Non communiqué"
      ),
    ],
  ];

  return (
    <div className="avis-root min-h-dvh pb-10" style={{ background: "#ece8e2", color: C.ink }}>
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body, .avis-root { background: #fff !important; }
          .avis-pages { zoom: 1 !important; gap: 0 !important; padding: 0 !important; }
          .avis-page { box-shadow: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
          .avis-page:last-child { break-after: auto; page-break-after: auto; }
        }
        .avis-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      {/* Barre d'outils (non imprimée) */}
      <div className="no-print sticky top-0 z-10 border-b backdrop-blur" style={{ background: "rgba(255,255,255,.85)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <Link href={`/estimations/${e.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Retour
          </Link>
          {proprio && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs" style={{ color: C.slate }}>
              <input type="checkbox" checked={afficherNom} onChange={(ev) => setAfficherNom(ev.target.checked)} className="size-4 accent-[#6c191e]" />
              <span className="hidden sm:inline">Nom du propriétaire</span>
              <span className="sm:hidden">Nom</span>
            </label>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className={`${proprio ? "" : "ml-auto "}inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white shadow-sm active:scale-[.98]`}
            style={{ background: C.brand }}
          >
            <Printer size={16} /> Imprimer / PDF
          </button>
        </div>
      </div>

      <div className="avis-pages mx-auto flex w-[210mm] flex-col items-center gap-6 py-6" style={{ zoom }}>
        {/* ============ 1. COUVERTURE ============ */}
        <section className="avis-page relative flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white shadow-xl">
          <div className="flex items-center justify-between px-[18mm] pt-[16mm]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PATRIM" style={{ height: "15mm" }} />
            <div className="text-right text-[9pt] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
              Transaction
            </div>
          </div>

          <div className="px-[18mm] pt-[42mm]">
            <div className="h-[3px] w-[18mm]" style={{ background: C.coral }} />
            <div className="mt-[6mm] text-[10pt] uppercase tracking-[0.28em]" style={{ color: C.slate }}>
              Estimation de la valeur de marché
            </div>
            <h1 className="mt-[3mm] font-serif text-[46pt] font-semibold leading-[1.05]" style={{ color: C.brand }}>
              Avis de valeur
            </h1>
            <div className="mt-[12mm] font-serif text-[20pt] leading-tight">{rue}</div>
            {villeLigne && <div className="mt-1 text-[12pt]" style={{ color: C.slate }}>{villeLigne}{p.quartier ? ` · ${p.quartier}` : ""}</div>}
            <div className="mt-[5mm] text-[11pt]" style={{ color: C.slate }}>
              {resumeBien(e)}
            </div>
            <div className="mt-[14mm] grid max-w-[120mm] grid-cols-2 gap-[6mm] text-[9.5pt]">
              {afficherNom && nomProprio && (
                <div>
                  <div className="uppercase tracking-[0.16em] text-[7.5pt]" style={{ color: C.muted }}>
                    Établi pour
                  </div>
                  <div className="mt-1 font-medium">{nomProprio}</div>
                </div>
              )}
              <div>
                <div className="uppercase tracking-[0.16em] text-[7.5pt]" style={{ color: C.muted }}>
                  Date
                </div>
                <div className="mt-1 font-medium">{dateAvis}</div>
              </div>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/arcades.png" alt="" className="absolute inset-x-0 bottom-[44mm] w-full opacity-90" />

          <div className="mt-auto px-[18mm] py-[11mm] text-white" style={{ background: C.brand }}>
            <div className="flex items-end justify-between gap-6">
              <div>
                <div className="text-[7.5pt] uppercase tracking-[0.2em] text-white/60">Votre conseiller</div>
                <div className="mt-1 font-serif text-[15pt]">{AGENCE.conseiller}</div>
                <div className="text-[9.5pt] text-white/85">
                  {AGENCE.conseillerTitre} · {AGENCE.conseillerTel}
                </div>
              </div>
              <div className="text-right text-[9pt] leading-relaxed text-white/85">
                <div className="font-semibold tracking-[0.2em] text-white">PATRIM</div>
                <div>{AGENCE.adresse}</div>
                <div>{AGENCE.tel}</div>
              </div>
            </div>
          </div>
          <div className="h-[2mm]" style={{ background: C.coral }} />
        </section>

        {/* ============ 2. LE BIEN ET LA MÉTHODE ============ */}
        <Page n={2} total={total} rue={rue}>
          <Titre num="01" titre="Le bien" />
          <div className="mt-[6mm] grid grid-cols-2 gap-x-[10mm]">
            {caracteristiques.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 border-b py-[2.6mm] text-[10pt]" style={{ borderColor: C.line }}>
                <span style={{ color: C.muted }}>{k}</span>
                <span className="text-right font-medium">{v}</span>
              </div>
            ))}
          </div>
          <p className="mt-[4mm] text-[8.5pt] italic" style={{ color: C.muted }}>
            Caractéristiques déclarées par le propriétaire lors de notre visite du {dateCourte(e.createdAt)}, non vérifiées par un diagnostiqueur ou un géomètre.
          </p>

          <Titre num="02" titre="Notre méthode" className="mt-[12mm]" />
          <div className="mt-[5mm] space-y-[3mm] text-[10pt] leading-[1.6]" style={{ color: C.slate }}>
            {p.rayon ? (
              <p>
                Nous partons des <strong style={{ color: C.ink }}>ventes réellement signées</strong> chez le notaire autour du bien, publiées par l&apos;administration fiscale (base DVF, Demandes de
                valeurs foncières). Nous retenons les {e.type === "maison" ? "maisons" : "appartements"} de surface comparable vendus dans un rayon de {p.rayon.toLocaleString("fr-FR")} m
                {p.periode ? `, entre ${p.periode.replace(" – ", " et ")}` : ""}, en écartant les ventes atypiques.
              </p>
            ) : (
              <p>
                Faute de ventes publiques exploitables à proximité immédiate, nous retenons un prix de référence au m² issu de notre connaissance du secteur (ventes de l&apos;agence, références
                notariales).
              </p>
            )}
            <p>Le prix médian au m² obtenu est ensuite ajusté selon les caractéristiques propres au bien : état, étage, extérieur, stationnement, performance énergétique.</p>
          </div>

          {r && p.marche && (
            <div className="mt-[7mm] overflow-hidden rounded-[3mm] border" style={{ borderColor: C.line }}>
              <Ligne label={p.rayon ? `Prix médian de ${p.marche.count} ventes comparables` : "Prix de référence du secteur"} value={`${p.marche.medianSqm.toLocaleString("fr-FR")} €/m²`} />
              {(r.ajustements ?? []).map((a) => (
                <Ligne key={a.label} label={a.label} value={`${a.pct > 0 ? "+" : ""}${Math.round(a.pct * 100)} %`} tone={a.pct > 0 ? "#167f54" : "#b5631a"} />
              ))}
              {!r.ajustements?.length && <Ligne label="Aucun ajustement : bien dans la moyenne du secteur" value="0 %" />}
              <div className="flex items-center justify-between px-[5mm] py-[3.2mm] text-[10.5pt] font-semibold text-white" style={{ background: C.brand }}>
                <span>Prix au m² retenu pour votre bien</span>
                <span className="tabular-nums">{r.prixM2.toLocaleString("fr-FR")} €/m²</span>
              </div>
            </div>
          )}

          {p.marche && p.rayon && (
            <div className="mt-[8mm] grid grid-cols-3 gap-[4mm]">
              <Chiffre label="Ventes analysées" value={String(p.marche.count)} />
              <Chiffre label="Médiane du secteur" value={`${p.marche.medianSqm.toLocaleString("fr-FR")} €/m²`} />
              <Chiffre label="Moitié des ventes entre" value={`${p.marche.p25.toLocaleString("fr-FR")} et ${p.marche.p75.toLocaleString("fr-FR")} €`} />
            </div>
          )}
        </Page>

        {/* ============ 3. LES VENTES COMPARABLES ============ */}
        <Page n={3} total={total} rue={rue}>
          <Titre num="03" titre="Les ventes comparables" />
          {tableau.length ? (
            <>
              <p className="mt-[4mm] text-[9.5pt]" style={{ color: C.slate }}>
                {ventes.length > tableau.length ? `Les ${tableau.length} ventes les plus proches de votre bien parmi les ${ventes.length} retenues.` : `Les ${ventes.length} ventes retenues pour le calcul.`} Source : DVF
                (DGFiP), prix hors frais de notaire.
              </p>
              <Nuage ventes={ventes} median={p.marche?.medianSqm} retenu={r?.prixM2} />
              <table className="mt-[5mm] w-full border-collapse text-[8.8pt]">
                <thead>
                  <tr style={{ color: C.muted }} className="text-left text-[7.5pt] uppercase tracking-[0.08em]">
                    <th className="pb-[2mm] font-medium">Adresse</th>
                    <th className="pb-[2mm] font-medium">Vente</th>
                    <th className="pb-[2mm] text-right font-medium">Surface</th>
                    <th className="pb-[2mm] text-right font-medium">Pièces</th>
                    <th className="pb-[2mm] text-right font-medium">Prix</th>
                    <th className="pb-[2mm] text-right font-medium">€/m²</th>
                    <th className="pb-[2mm] text-right font-medium">Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {tableau.map((v, i) => (
                    <tr key={v.id} style={{ background: i % 2 ? "transparent" : C.cream }}>
                      <td className="max-w-[58mm] truncate py-[2.2mm] pl-[2mm] pr-[2mm]">{v.adresse}</td>
                      <td className="whitespace-nowrap py-[2.2mm] pr-[2mm]">{new Date(v.date + "T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}</td>
                      <td className="py-[2.2mm] pr-[2mm] text-right tabular-nums">{Math.round(v.surface)} m²</td>
                      <td className="py-[2.2mm] pr-[2mm] text-right tabular-nums">{v.pieces ?? "—"}</td>
                      <td className="whitespace-nowrap py-[2.2mm] pr-[2mm] text-right tabular-nums">{eur(v.prix)}</td>
                      <td className="py-[2.2mm] pr-[2mm] text-right font-semibold tabular-nums" style={{ color: C.brand }}>
                        {v.prixM2.toLocaleString("fr-FR")}
                      </td>
                      <td className="whitespace-nowrap py-[2.2mm] pr-[2mm] text-right tabular-nums" style={{ color: C.muted }}>
                        {v.distance != null ? `${v.distance} m` : v.source === "agence" ? "Agence" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="mt-[6mm] text-[10pt]" style={{ color: C.slate }}>
              Aucune vente publique suffisamment comparable n&apos;a été trouvée à proximité immédiate. Notre avis s&apos;appuie sur un prix de référence de{" "}
              {p.prixM2Manuel ? `${p.prixM2Manuel.toLocaleString("fr-FR")} €/m²` : "[À compléter]"}, issu de notre connaissance du secteur.
            </p>
          )}
        </Page>

        {/* ============ 4. NOTRE AVIS ============ */}
        <Page n={4} total={total} rue={rue}>
          <Titre num="04" titre="Notre avis de valeur" />
          {r ? (
            <>
              <div className="mt-[6mm] rounded-[3mm] px-[8mm] py-[7mm]" style={{ background: C.cream }}>
                <BarreFourchette bas={r.bas} median={r.median} haut={r.haut} conseille={conseille} />
              </div>
              <div className="mt-[7mm] flex items-center gap-[8mm] rounded-[3mm] px-[8mm] py-[6mm] text-white" style={{ background: C.brand }}>
                <div className="flex-1">
                  <div className="text-[8pt] uppercase tracking-[0.2em] text-white/70">Prix de présentation conseillé</div>
                  <div className="mt-1 font-serif text-[30pt] font-semibold leading-none tabular-nums">{eur(conseille)}</div>
                </div>
                <div className="text-right text-[9.5pt] text-white/85">
                  <div>soit {conseille ? Math.round(conseille / e.surface).toLocaleString("fr-FR") : "—"} €/m²</div>
                  <div>valeur hors frais d&apos;acquisition</div>
                </div>
              </div>
            </>
          ) : (
            <p className="mt-[6mm]">[À compléter]</p>
          )}

          {r?.commentaire && (
            <div className="mt-[8mm]">
              <div className="text-[8pt] font-semibold uppercase tracking-[0.18em]" style={{ color: C.brand }}>
                Notre analyse
              </div>
              <div className="mt-[3mm] space-y-[2.5mm] text-[9.8pt] leading-[1.62]" style={{ color: C.slate }}>
                {r.commentaire.split(/\n+/).filter(Boolean).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto pt-[8mm]">
            <div className="flex items-end justify-between gap-[10mm]">
              <div className="text-[9pt]">
                <div className="text-[7.5pt] uppercase tracking-[0.16em]" style={{ color: C.muted }}>
                  Votre conseiller
                </div>
                <div className="mt-1 font-serif text-[13pt]" style={{ color: C.brand }}>
                  {AGENCE.conseiller}
                </div>
                <div style={{ color: C.slate }}>
                  {AGENCE.conseillerTitre} · {AGENCE.conseillerTel}
                </div>
                <div style={{ color: C.slate }}>
                  PATRIM · {AGENCE.adresse} · {AGENCE.tel}
                </div>
              </div>
              <div className="w-[55mm] border-t pt-[2mm] text-center text-[8pt]" style={{ borderColor: C.line, color: C.muted }}>
                Fait à Toulouse, le {dateAvis}
              </div>
            </div>
            <div className="mt-[6mm] border-t pt-[3mm] text-[7.3pt] leading-[1.5]" style={{ borderColor: C.line, color: C.muted }}>
              Le présent avis de valeur est établi à partir des informations communiquées par le propriétaire et des ventes publiées dans la base DVF de la Direction générale des finances
              publiques. Il ne constitue pas une expertise immobilière : il n&apos;a pas valeur d&apos;expertise au sens de la Charte de l&apos;expertise en évaluation immobilière et ne peut se
              substituer à l&apos;avis d&apos;un expert (succession, donation, divorce, déclaration fiscale…). Il reflète notre appréciation de la valeur de marché à la date indiquée ; celle-ci
              peut évoluer avec le marché. Avis remis à titre gracieux, valable trois mois. Valeurs exprimées hors frais d&apos;acquisition ; honoraires d&apos;agence à définir au mandat.
            </div>
          </div>
        </Page>
      </div>
    </div>
  );
}

/* ---------- Éléments de mise en page ---------- */

function Page({ n, total, rue, children }: { n: number; total: number; rue: string; children: ReactNode }) {
  return (
    <section className="avis-page flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white shadow-xl">
      <header className="flex items-center justify-between border-b px-[18mm] pb-[4mm] pt-[11mm]" style={{ borderColor: C.line }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="PATRIM" style={{ height: "8mm" }} />
        <div className="max-w-[100mm] truncate text-right text-[8pt]" style={{ color: C.muted }}>
          Avis de valeur · {rue}
        </div>
      </header>
      <div className="flex flex-1 flex-col px-[18mm] pt-[9mm] pb-[6mm]">{children}</div>
      <footer className="flex items-center justify-between px-[18mm] pb-[9mm] text-[7.5pt]" style={{ color: C.muted }}>
        <span>
          PATRIM · {AGENCE.adresse} · {AGENCE.tel}
        </span>
        <span className="tabular-nums">
          {n} / {total}
        </span>
      </footer>
      <div className="h-[1.5mm]" style={{ background: C.coral }} />
    </section>
  );
}

function Titre({ num, titre, className }: { num: string; titre: string; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline gap-[4mm]">
        <span className="font-serif text-[12pt]" style={{ color: C.coral }}>
          {num}
        </span>
        <h2 className="font-serif text-[22pt] font-semibold" style={{ color: C.brand }}>
          {titre}
        </h2>
      </div>
      <div className="mt-[2mm] h-[2px] w-[14mm]" style={{ background: C.coral }} />
    </div>
  );
}

function Ligne({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between border-b px-[5mm] py-[2.8mm] text-[10pt]" style={{ borderColor: C.line }}>
      <span style={{ color: C.slate }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: tone ?? C.ink }}>
        {value}
      </span>
    </div>
  );
}

function Chiffre({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[3mm] px-[4mm] py-[4mm]" style={{ background: C.cream }}>
      <div className="text-[7.5pt] uppercase tracking-[0.12em]" style={{ color: C.muted }}>
        {label}
      </div>
      <div className="mt-[1.5mm] font-serif text-[13pt] font-semibold" style={{ color: C.brand }}>
        {value}
      </div>
    </div>
  );
}

/** Nuage de points : chaque vente selon son prix au m², avec la médiane et le prix retenu. */
function Nuage({ ventes, median, retenu }: { ventes: Vente[]; median?: number; retenu?: number }) {
  if (ventes.length < 3) return null;
  const vals = ventes.map((v) => v.prixM2);
  const all = [...vals, median ?? vals[0], retenu ?? vals[0]];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.06 || 100;
  const lo = min - pad;
  const hi = max + pad;
  const W = 600;
  const H = 96;
  const x = (v: number) => 10 + ((v - lo) / (hi - lo)) * (W - 20);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="mt-[5mm] w-full" role="img" aria-label="Répartition des prix au m²">
      <line x1={10} x2={W - 10} y1={H - 10} y2={H - 10} stroke={C.line} strokeWidth={1.5} />
      {ventes.map((v, i) => (
        <circle key={v.id} cx={x(v.prixM2)} cy={20 + ((i * 37) % 58)} r={4.2} fill={C.brand} fillOpacity={0.35} stroke={C.brand} strokeOpacity={0.6} strokeWidth={0.8} />
      ))}
      {median != null && (
        <g>
          <line x1={x(median)} x2={x(median)} y1={8} y2={H - 10} stroke={C.slate} strokeDasharray="3 3" strokeWidth={1} />
          <text x={x(median)} y={H + 4} textAnchor="middle" fontSize={10} fill={C.slate}>
            Médiane {median.toLocaleString("fr-FR")} €
          </text>
        </g>
      )}
      {retenu != null && (
        <g>
          <line x1={x(retenu)} x2={x(retenu)} y1={8} y2={H - 10} stroke={C.coral} strokeWidth={2} />
          <text x={x(retenu)} y={H + 17} textAnchor="middle" fontSize={10} fontWeight={600} fill={C.coral}>
            Votre bien {retenu.toLocaleString("fr-FR")} €
          </text>
        </g>
      )}
      {ticks.map((t, i) => (
        <text key={i} x={x(t)} y={H - 14} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"} fontSize={8.5} fill={C.muted}>
          {Math.round(t).toLocaleString("fr-FR")} €/m²
        </text>
      ))}
    </svg>
  );
}

function BarreFourchette({ bas, median, haut, conseille }: { bas: number; median: number; haut: number; conseille?: number }) {
  const min = Math.min(bas, conseille ?? bas);
  const max = Math.max(haut, conseille ?? haut);
  const span = max - min || 1;
  const lo = min - span * 0.12;
  const hi = max + span * 0.12;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const Col = ({ label, v, strong }: { label: string; v: number; strong?: boolean }) => (
    <div className="absolute top-[9mm] -translate-x-1/2 text-center" style={{ left: pos(v) }}>
      <div className="text-[7.5pt] uppercase tracking-[0.14em]" style={{ color: C.muted }}>
        {label}
      </div>
      <div className={`mt-[1mm] whitespace-nowrap tabular-nums ${strong ? "font-serif text-[15pt] font-semibold" : "text-[11pt] font-medium"}`} style={{ color: strong ? C.brand : C.ink }}>
        {eur(v)}
      </div>
    </div>
  );
  return (
    <div className="relative h-[24mm]">
      <div className="absolute inset-x-0 top-[3mm] h-[3mm] rounded-full" style={{ background: C.line }} />
      <div className="absolute top-[3mm] h-[3mm] rounded-full" style={{ left: pos(bas), right: `calc(100% - ${pos(haut)})`, background: `linear-gradient(90deg, ${C.brand}66, ${C.brand}, ${C.brand}66)` }} />
      {[bas, haut].map((v) => (
        <div key={v} className="absolute top-[2mm] h-[5mm] w-[1.2mm] -translate-x-1/2 rounded-full" style={{ left: pos(v), background: C.brand }} />
      ))}
      <div className="absolute top-[1.5mm] size-[6mm] -translate-x-1/2 rounded-full border-[1.5mm] bg-white" style={{ left: pos(median), borderColor: C.brand }} />
      {conseille != null && Math.abs(conseille - median) / median > 0.004 && (
        <div className="absolute -top-[3mm] -translate-x-1/2" style={{ left: pos(conseille) }}>
          <div className="mx-auto h-[9mm] w-[0.6mm]" style={{ background: C.coral }} />
        </div>
      )}
      <Col label="Valeur basse" v={bas} />
      <Col label="Valeur médiane" v={median} strong />
      <Col label="Valeur haute" v={haut} />
    </div>
  );
}
