"use client";

/* Affiche vitrine A4 d'un bien, avec le QR code qui mène à sa page web
   (photos, fiche complète, « Demander une visite »). */

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { C } from "@/components/documents/charte";
import { useCollection, useDoc } from "@/lib/store";
import { useRetour } from "@/lib/retour";
import { qrSvg } from "@/components/qr/qr";
import { empreinteFiche, fichePageWeb, lienPageWeb, pageWebDe, publierPageWeb } from "@/components/pageweb/pageweb";
import type { Contact } from "@/lib/types";

const CSS = `
  @page { size: A4; margin: 0; }
  @media print { html, body, .vitrine-root { background: #fff !important; } .vitrine-feuille { box-shadow: none !important; margin: 0 !important; } }
  .vitrine-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;
const DPE: Record<string, string> = { A: "#009c6d", B: "#52b153", C: "#78bd76", D: "#f4e70f", E: "#f0b40f", F: "#eb8235", G: "#d7221f" };
const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export default function AfficheVitrine() {
  const { id } = useParams<{ id: string }>();
  const retour = useRetour(`/biens/${id}`);
  const { doc: b } = useDoc("biens", id);
  const { items: contacts } = useCollection("contacts");
  const [err, setErr] = useState("");
  const vendeurs = useMemo(() => contacts.filter((c) => b?.vendeurIds?.includes(c.id)) as Contact[], [contacts, b?.vendeurIds]);
  const f = useMemo(() => (b ? fichePageWeb(b, vendeurs) : null), [b, vendeurs]);
  const page = b ? pageWebDe(b) : undefined;

  // L'affiche a besoin d'une page web à jour : on la publie si besoin.
  useEffect(() => {
    if (!b || !f || (page && page.empreinte === empreinteFiche(f))) return;
    publierPageWeb(b, f).catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id, f && empreinteFiche(f), page?.id]);

  const qr = useMemo(() => (page ? qrSvg(lienPageWeb(page.id), C.brand) : ""), [page]);

  if (!b || !f) return <div className="p-6 text-sm">Chargement…</div>;
  const chiffres = [
    f.surface ? `${f.surface.toLocaleString("fr-FR")} m²` : "",
    f.pieces ? `${f.pieces} pièce${f.pieces > 1 ? "s" : ""}` : "",
    f.chambres ? `${f.chambres} chambre${f.chambres > 1 ? "s" : ""}` : "",
    f.surfaceTerrain ? `Terrain ${f.surfaceTerrain.toLocaleString("fr-FR")} m²` : "",
    f.exterieur ?? "",
    f.parking ?? "",
  ].filter(Boolean);

  return (
    <div className="vitrine-root min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{CSS}</style>
      <div className="no-print sticky top-0 z-10 border-b backdrop-blur print:hidden" style={{ background: "rgba(255,255,255,.88)", borderColor: C.line }}>
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-3 py-2.5 safe-top">
          <button type="button" onClick={retour} className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium hover:bg-black/5">
            <ArrowLeft size={16} /> Retour
          </button>
          <button type="button" disabled={!qr} onClick={() => window.print()} className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-white disabled:opacity-50" style={{ background: C.brand }}>
            <Printer size={16} /> Imprimer
          </button>
        </div>
        {err && <p className="px-4 pb-2 text-sm text-red-700">{err}</p>}
      </div>

      <div className="overflow-x-auto py-4 print:p-0">
        <div className="vitrine-feuille mx-auto flex flex-col bg-white shadow-xl" style={{ width: "210mm", height: "297mm" }}>
          <div className="flex items-center justify-between px-[14mm] py-[8mm]" style={{ background: C.brand }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PATRIM" className="h-[12mm] w-auto brightness-0 invert" />
            <span className="text-[13pt] font-semibold uppercase tracking-[0.2em] text-white/90">{f.sousOffre ? "Sous offre" : f.disponible ? "À vendre" : "Vendu"}</span>
          </div>
          {f.photos[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.photos[0]} alt="" className="h-[105mm] w-full object-cover" />
          ) : (
            <div className="h-[30mm]" style={{ background: C.cream }} />
          )}
          <div className="flex flex-1 flex-col px-[14mm] pt-[8mm]">
            <h1 className="text-[26pt] font-bold leading-tight">{f.titre}</h1>
            <p className="mt-[1mm] text-[14pt]" style={{ color: C.slate }}>{f.secteur}</p>
            {chiffres.length > 0 && <p className="mt-[4mm] text-[14pt] font-medium">{chiffres.join("  ·  ")}</p>}
            <div className="mt-[6mm] flex items-end gap-[8mm]">
              <div className="flex-1">
                {f.prix ? <div className="text-[34pt] font-bold leading-none" style={{ color: C.brand }}>{eur(f.prix)}</div> : null}
                <p className="mt-[2mm] text-[10pt]" style={{ color: C.slate }}>
                  Honoraires inclus
                  {f.honorairesCharge === "acquereur" && f.honorairesPct && f.prixHorsHonoraires
                    ? ` : ${f.honorairesPct.toLocaleString("fr-FR")} % TTC à la charge de l'acquéreur, soit ${eur(f.prixHorsHonoraires)} hors honoraires`
                    : f.honorairesCharge === "vendeur"
                      ? ", à la charge du vendeur"
                      : ""}
                  {f.lotsCopro ? `. Copropriété de ${f.lotsCopro} lots` : ""}
                  {f.chargesAnnuelles ? `, charges ${eur(f.chargesAnnuelles)} par an` : ""}.
                </p>
                <div className="mt-[5mm] flex gap-[4mm]">
                  <Classe label="Classe énergie" v={f.dpe} />
                  <Classe label="Classe climat" v={f.ges} />
                </div>
                {(f.dpe === "F" || f.dpe === "G") && <p className="mt-[2mm] text-[9pt]" style={{ color: C.slate }}>Logement à consommation énergétique excessive.</p>}
              </div>
              <div className="w-[52mm] shrink-0 text-center">
                {qr ? <div className="w-[52mm]" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="grid h-[52mm] place-items-center text-[9pt]" style={{ color: C.muted }}>QR code en préparation…</div>}
                <p className="mt-[1mm] text-[10pt] font-semibold leading-tight" style={{ color: C.brand }}>Scannez pour voir les photos et demander une visite</p>
              </div>
            </div>
            <div className="mt-auto flex items-center justify-between border-t py-[6mm] text-[11pt]" style={{ borderColor: C.line }}>
              <span>
                <b>{f.conseiller?.nom}</b> · {f.conseiller?.tel}
              </span>
              <span style={{ color: C.slate }}>PATRIM · 45 allées Jean Jaurès, Toulouse{f.ref ? ` · Réf. ${f.ref}` : ""}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Classe({ label, v }: { label: string; v?: string }) {
  return (
    <div className="flex items-center gap-[2mm]">
      <span className="grid size-[11mm] place-items-center rounded-[2mm] text-[18pt] font-bold text-white" style={{ background: v ? DPE[v] : "#bbb" }}>
        {v ?? "?"}
      </span>
      <span className="text-[9pt] leading-tight" style={{ color: C.slate }}>{label}</span>
    </div>
  );
}
