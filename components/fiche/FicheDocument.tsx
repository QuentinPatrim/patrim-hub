"use client";

import type { ReactNode } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { AGENCE, C, DPE_COLORS, GES_COLORS, MENTIONS } from "@/components/documents/charte";
import type { FichePublique } from "./fiche";

/* ============================================================
   Fiche du bien : page web soignée sur téléphone, et document
   A4 propre une fois « Enregistrée en PDF ». Couleurs fixes.
   ============================================================ */

const TYPE: Record<FichePublique["type"], string> = { appartement: "Appartement", maison: "Maison", terrain: "Terrain", local: "Local", immeuble: "Immeuble", parking: "Parking" };
const nb = (n: number, d = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: d });
const eur = (n: number) => `${nb(Math.round(n))} €`;

export const FICHE_PRINT_CSS = `
  @page { size: A4; margin: 12mm 0 14mm; }
  @media print {
    html, body, .fiche-root { background: #fff !important; }
    .fiche-sheet { box-shadow: none !important; border-radius: 0 !important; margin: 0 auto !important; max-width: none !important; width: 210mm !important; }
    .fiche-pad { padding-left: 16mm !important; padding-right: 16mm !important; }
    .fiche-bloc { break-inside: avoid; page-break-inside: avoid; }
    .fiche-hero { height: 92mm !important; }
    .fiche-grid-photos { grid-template-columns: repeat(3, 1fr) !important; }
  }
  .fiche-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

export function FicheDocument({ f, contact = true }: { f: FichePublique; contact?: boolean }) {
  const [cover, ...autres] = f.photos;
  const habitable = f.type !== "terrain" && f.type !== "parking";
  const chiffres: [string, string][] = [
    ...(f.surface ? ([[f.type === "appartement" ? "Surface Carrez" : "Surface", `${nb(f.surface, 2)} m²`]] as [string, string][]) : []),
    ...(habitable && f.pieces ? ([["Pièces", String(f.pieces)]] as [string, string][]) : []),
    ...(habitable && f.chambres ? ([["Chambres", String(f.chambres)]] as [string, string][]) : []),
    ...(f.surfaceTerrain ? ([["Terrain", `${nb(f.surfaceTerrain)} m²`]] as [string, string][]) : []),
    ...(f.etage != null && f.type === "appartement" ? ([["Étage", f.etage === 0 ? "RDC" : `${f.etage}e${f.nbEtages ? ` / ${f.nbEtages}` : ""}`]] as [string, string][]) : []),
  ].slice(0, 4);

  const carac: [string, ReactNode][] = (
    [
      ["Type de bien", TYPE[f.type]],
      ["Ascenseur", f.ascenseur == null ? undefined : f.ascenseur ? "Oui" : "Non"],
      ["Extérieur", f.exterieur],
      ["Stationnement", f.parking],
      ["Cave", f.cave == null ? undefined : f.cave ? "Oui" : "Non"],
      ["Année de construction", f.anneeConstruction],
      ["Chauffage", f.chauffage],
      ["Lots de copropriété", f.lotsCopro],
      ["Charges de copropriété", f.chargesAnnuelles ? `${eur(f.chargesAnnuelles)} / an` : undefined],
      ["Taxe foncière", f.taxeFonciere ? `${eur(f.taxeFonciere)} / an` : undefined],
    ] as [string, ReactNode][]
  ).filter(([, v]) => v != null && v !== "");

  const message = `Bonjour, je souhaite des informations sur le bien « ${f.titre} »${f.ref ? ` (réf. ${f.ref})` : ""}.`;

  return (
    <article className="fiche-sheet mx-auto w-full max-w-[210mm] overflow-hidden bg-white sm:rounded-[6mm] sm:shadow-xl" style={{ color: C.ink }}>
      {/* En-tête */}
      <header className="fiche-pad flex items-center justify-between gap-4 px-5 sm:px-[14mm] pt-5 sm:pt-[10mm] pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="PATRIM" className="h-9 sm:h-[12mm] w-auto" />
        <div className="text-right text-[11px] sm:text-[8.5pt] uppercase tracking-[0.2em]" style={{ color: C.muted }}>
          Fiche du bien
          {f.ref && <div className="mt-0.5 font-mono normal-case tracking-normal">Réf. {f.ref}</div>}
        </div>
      </header>

      {/* Photo principale */}
      <div className="fiche-hero relative h-[56vw] max-h-[110mm] min-h-[200px]" style={{ background: C.cream }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={f.titre} className="absolute inset-0 size-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/arcades.png" alt="" className="absolute inset-x-0 bottom-0 w-full opacity-60" />
        )}
        {!f.disponible ? (
          <Bandeau>Ce bien n&apos;est plus disponible</Bandeau>
        ) : f.sousOffre ? (
          <Bandeau>Sous offre</Bandeau>
        ) : null}
      </div>
      <div className="h-[3px]" style={{ background: C.coral }} />

      {/* Titre et prix */}
      <section className="fiche-pad fiche-bloc px-5 sm:px-[14mm] pt-6 sm:pt-[9mm]">
        <div className="text-[11px] sm:text-[8.5pt] font-medium uppercase tracking-[0.2em]" style={{ color: C.slate }}>
          {TYPE[f.type]}
          {f.secteur ? ` · ${f.secteur}` : ""}
        </div>
        <h1 className="mt-2 font-serif text-[28px] sm:text-[26pt] font-semibold leading-[1.12]" style={{ color: C.brand }}>
          {f.titre}
        </h1>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <div className="text-[22px] sm:text-[16pt] font-semibold leading-none tabular-nums" style={{ color: C.ink, fontVariantNumeric: "lining-nums" }}>
              {f.prix ? eur(f.prix) : "Prix sur demande"}
            </div>
            {f.prix && (
              <div className="mt-1.5 text-[12px] sm:text-[8.5pt] leading-snug" style={{ color: C.slate }}>
                Honoraires inclus
                {f.honorairesCharge === "acquereur" && f.honorairesPct
                  ? ` · ${nb(f.honorairesPct, 1)} % TTC à la charge de l'acquéreur, soit ${eur(f.prixHorsHonoraires!)} hors honoraires`
                  : f.honorairesCharge === "vendeur"
                    ? " · honoraires à la charge du vendeur"
                    : ""}
              </div>
            )}
          </div>
          {f.surface && f.prix ? (
            <div className="text-[13px] sm:text-[9.5pt]" style={{ color: C.muted }}>
              {eur(f.prix / f.surface)} / m²
            </div>
          ) : null}
        </div>
      </section>

      {/* Chiffres clés */}
      {chiffres.length > 0 && (
        <section className="fiche-pad fiche-bloc px-5 sm:px-[14mm] pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {chiffres.map(([k, v]) => (
              <div key={k} className="rounded-2xl px-4 py-3" style={{ background: C.cream }}>
                <div className="text-[11px] sm:text-[7.5pt] uppercase tracking-[0.12em]" style={{ color: C.muted }}>
                  {k}
                </div>
                <div className="mt-1 font-serif text-[22px] sm:text-[15pt] font-semibold leading-none" style={{ color: C.brand, fontVariantNumeric: "lining-nums" }}>
                  {v}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Description */}
      {(f.description || f.pointsForts?.length) && (
        <section className="fiche-pad px-5 sm:px-[14mm] pt-8">
          <Titre>Le bien</Titre>
          {f.pointsForts && f.pointsForts.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {f.pointsForts.map((p) => (
                <span key={p} className="rounded-full px-3 py-1 text-[12px] sm:text-[8.5pt] font-medium" style={{ background: "#6c191e12", color: C.brand }}>
                  {p}
                </span>
              ))}
            </div>
          )}
          {f.description && (
            <div className="mt-3 space-y-2.5 text-[15px] sm:text-[10pt] leading-[1.65]" style={{ color: C.slate }}>
              {f.description
                .split(/\n+/)
                .filter((p) => p.trim())
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          )}
        </section>
      )}

      {/* Photos */}
      {autres.length > 0 && (
        <section className="fiche-pad px-5 sm:px-[14mm] pt-8">
          <div className="fiche-grid-photos grid grid-cols-2 sm:grid-cols-3 gap-2">
            {autres.slice(0, 9).map((p, i) => (
              <div key={p} className={`fiche-bloc relative overflow-hidden rounded-xl ${i === 0 && autres.length % 2 === 0 ? "col-span-2 sm:col-span-1" : ""}`} style={{ background: C.cream, aspectRatio: "4 / 3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Caractéristiques + énergie */}
      <section className="fiche-pad px-5 sm:px-[14mm] pt-8 grid gap-8 sm:grid-cols-[1fr_74mm]">
        {carac.length > 0 && (
          <div className="fiche-bloc">
            <Titre>Caractéristiques</Titre>
            <dl className="mt-3">
              {carac.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4 border-b py-2.5 text-[14px] sm:text-[9.5pt]" style={{ borderColor: C.line }}>
                  <dt style={{ color: C.muted }}>{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <div className="fiche-bloc">
          <Titre>Performance énergétique</Titre>
          <div className="mt-3 space-y-4">
            <Echelle label="Consommation énergétique (DPE)" valeur={f.dpe} couleurs={DPE_COLORS} />
            <Echelle label="Émissions de gaz à effet de serre (GES)" valeur={f.ges} couleurs={GES_COLORS} />
          </div>
        </div>
      </section>

      {/* Conseiller */}
      <section className="fiche-pad fiche-bloc px-5 sm:px-[14mm] pt-9 pb-6">
        <div className="relative overflow-hidden rounded-3xl px-6 py-6 sm:px-[9mm] sm:py-[7mm] text-white" style={{ background: C.brand }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/arcades.png" alt="" className="pointer-events-none absolute inset-x-0 -bottom-2 w-full opacity-[0.07]" style={{ filter: "brightness(0) invert(1)" }} />
          <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            <div>
              <div className="text-[11px] sm:text-[7.5pt] uppercase tracking-[0.2em] text-white/60">Votre conseiller</div>
              <div className="mt-1 font-serif text-[24px] sm:text-[17pt] leading-tight">{AGENCE.conseiller}</div>
              <div className="text-[13px] sm:text-[9pt] text-white/80">
                {AGENCE.conseillerTitre} · PATRIM Toulouse
              </div>
              <div className="mt-2 text-[14px] sm:text-[10pt] font-medium">
                {AGENCE.conseillerTel} · {AGENCE.conseillerMail}
              </div>
            </div>
            {contact && (
              <div className="no-print grid grid-cols-3 gap-2 sm:flex">
                <a href={`tel:${AGENCE.conseillerTel.replace(/\s/g, "")}`} className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-3 text-sm font-semibold" style={{ color: C.brand }}>
                  <Phone size={16} /> Appeler
                </a>
                <a
                  href={`https://wa.me/33${AGENCE.conseillerTel.replace(/\s/g, "").slice(1)}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white/12 px-3 text-sm font-semibold ring-1 ring-white/25"
                >
                  <MessageCircle size={16} /> WhatsApp
                </a>
                <a
                  href={`mailto:${AGENCE.conseillerMail}?subject=${encodeURIComponent(`Bien ${f.ref ?? f.titre}`)}&body=${encodeURIComponent(message)}`}
                  className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white/12 px-3 text-sm font-semibold ring-1 ring-white/25"
                >
                  <Mail size={16} /> E-mail
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="fiche-pad px-5 sm:px-[14mm] pb-6 sm:pb-[8mm] text-[10.5px] sm:text-[7pt] leading-relaxed" style={{ color: C.muted }}>
        Informations non contractuelles, communiquées sous réserve d&apos;erreur ou d&apos;omission et de disponibilité du bien. Fiche mise à jour le{" "}
        {new Date(f.majLe + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.
        <div className="mt-1.5">{MENTIONS}</div>
      </footer>
      <div className="h-[5px]" style={{ background: C.coral }} />
    </article>
  );
}

function Bandeau({ children }: { children: ReactNode }) {
  return (
    <div className="absolute left-4 top-4 rounded-full px-4 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-white shadow" style={{ background: C.brand }}>
      {children}
    </div>
  );
}

function Titre({ children }: { children: ReactNode }) {
  return (
    <div>
      <h2 className="font-serif text-[21px] sm:text-[15pt] font-semibold" style={{ color: C.brand }}>
        {children}
      </h2>
      <div className="mt-1.5 h-[2px] w-10" style={{ background: C.coral }} />
    </div>
  );
}

/** Échelle A à G avec la classe du bien mise en avant. */
function Echelle({ label, valeur, couleurs }: { label: string; valeur?: string; couleurs: Record<string, string> }) {
  const lettres = ["A", "B", "C", "D", "E", "F", "G"];
  return (
    <div>
      <div className="text-[12px] sm:text-[8pt]" style={{ color: C.muted }}>
        {label}
      </div>
      {valeur ? (
        <div className="mt-1.5 flex gap-1">
          {lettres.map((l) => {
            const actif = l === valeur;
            return (
              <div
                key={l}
                className="grid flex-1 place-items-center rounded-md font-bold transition"
                style={{
                  background: couleurs[l],
                  color: (couleurs === DPE_COLORS && ["C", "D", "E"].includes(l)) || (couleurs === GES_COLORS && ["A", "B"].includes(l)) ? "#1b1e23" : "#fff",
                  height: actif ? 34 : 24,
                  fontSize: actif ? 15 : 10,
                  opacity: actif ? 1 : 0.38,
                  boxShadow: actif ? "0 0 0 2px #fff, 0 0 0 3.5px #1b1e23" : undefined,
                  alignSelf: "center",
                }}
              >
                {l}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1 text-[14px] sm:text-[9.5pt] font-medium">Non communiqué</div>
      )}
    </div>
  );
}
