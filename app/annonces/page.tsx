"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";
import { locationSeule } from "@/components/location/bienLocation";
import { REGLAGES_DEFAUT, aDiffuser, diffusable, nomPaquet, paquetPoliris, refDe, verifier, type ReglagesExport } from "@/components/annonce/poliris";
import { useCollection } from "@/lib/store";
import type { Bien } from "@/lib/types";

/* ============================================================
   Export des annonces pour les portails (format Poliris de
   SeLoger, lu aussi par les multidiffuseurs). Produit un ZIP
   sur l'appareil, à faire valider avant tout branchement : rien
   n'est envoyé ni publié d'ici.
   ============================================================ */

const CLE = "patrim-hub:poliris";
const lire = (): ReglagesExport => {
  try {
    return { ...REGLAGES_DEFAUT, ...JSON.parse(localStorage.getItem(CLE) || "{}") };
  } catch {
    return REGLAGES_DEFAUT;
  }
};

export default function ExportAnnoncesPage() {
  const { items: biens } = useCollection("biens");
  const [r, setR] = useState<ReglagesExport>(REGLAGES_DEFAUT);
  const [choix, setChoix] = useState<Set<string> | null>(null);

  useEffect(() => setR(lire()), []);
  const majR = (p: Partial<ReglagesExport>) =>
    setR((x) => {
      const n = { ...x, ...p };
      try {
        localStorage.setItem(CLE, JSON.stringify(n));
      } catch {}
      return n;
    });

  const liste = useMemo(() => (biens as Bien[]).filter(diffusable).map((b) => ({ b, v: verifier(b, r) })), [biens, r]);
  // Sélection par défaut : biens en vente et à louer, sans champ obligatoire manquant.
  useEffect(() => {
    if (choix === null && liste.length) setChoix(new Set(liste.filter(({ b, v }) => aDiffuser(b) && !v.bloquant.length).map(({ b }) => b.id)));
  }, [liste, choix]);
  const sel = choix ?? new Set<string>();
  const basculer = (id: string) =>
    setChoix((c) => {
      const n = new Set(c ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const retenus = liste.filter(({ b, v }) => sel.has(b.id) && !v.bloquant.length).map(({ b }) => b);
  const telecharger = () => {
    const url = URL.createObjectURL(paquetPoliris(retenus, r));
    const lien = document.createElement("a");
    lien.href = url;
    lien.download = nomPaquet(r);
    lien.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const groupes: [string, typeof liste][] = [
    ["Ventes", liste.filter(({ b }) => !locationSeule(b))],
    ["Locations", liste.filter(({ b }) => locationSeule(b))],
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Export portails"
        subtitle="Le fichier des annonces au format des portails (Poliris), à faire tester avant tout branchement. Rien n'est envoyé ni publié d'ici."
        back="/biens"
      />

      <Card title="Réglages du flux">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Identifiant agence" hint="Fourni par le portail ou le multidiffuseur. Laisser vide pour un test.">
            <input className="input" value={r.agence} onChange={(e) => majR({ agence: e.target.value.trim() })} placeholder="ex. patrim31" />
          </Field>
          <Field label="Lien du barème des honoraires" hint="Page du site où figure le barème (obligation loi Alur).">
            <input className="input" inputMode="url" value={r.bareme} onChange={(e) => majR({ bareme: e.target.value })} placeholder="https://www.patrim.fr/…" />
          </Field>
        </div>
      </Card>

      {!liste.length && (
        <div className="card">
          <Empty title="Aucun bien à diffuser" />
        </div>
      )}

      {groupes.map(([titre, g]) =>
        g.length ? (
          <Card key={titre} title={`${titre} (${g.filter(({ b }) => sel.has(b.id)).length}/${g.length})`}>
            <ul className="divide-y divide-line">
              {g.map(({ b, v }) => {
                const bloque = v.bloquant.length > 0;
                return (
                  <li key={b.id} className="flex items-start gap-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-[#6c191e]"
                      checked={sel.has(b.id) && !bloque}
                      disabled={bloque}
                      onChange={() => basculer(b.id)}
                      aria-label={b.titre}
                    />
                    <div className="min-w-0 flex-1">
                      <Link href={`/biens/${b.id}/annonce`} className="block truncate text-sm font-semibold hover:underline">
                        {b.titre || refDe(b)}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {refDe(b)} · {b.quartier || b.ville}
                      </p>
                      {bloque && <p className="mt-1 text-xs text-danger">Manque : {v.bloquant.join(", ")}.</p>}
                      {!bloque && v.conseil.length > 0 && <p className="mt-1 text-xs text-warn">À compléter : {v.conseil.join(" ; ")}.</p>}
                    </div>
                    {bloque ? <Badge tone="danger">Incomplet</Badge> : v.conseil.length ? <Badge tone="warn">Partiel</Badge> : <Badge tone="ok">Prêt</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : null,
      )}

      {liste.length > 0 && (
        <div className="space-y-2">
          <button type="button" className="btn-primary !h-12 w-full" disabled={!retenus.length} onClick={telecharger}>
            <Download size={17} /> Télécharger le fichier ({retenus.length} annonce{retenus.length > 1 ? "s" : ""})
          </button>
          <p className="flex gap-2 text-xs text-muted">
            <ShieldCheck size={15} className="mt-px shrink-0" />
            <span>
              Le ZIP contient Annonces.csv, Config.txt et Photos.cfg (photos par leur adresse web). Les portails remplacent toutes les annonces à chaque envoi : le fichier doit contenir tous les biens
              à diffuser. Ni vendeur, ni propriétaire, ni notes dans le fichier.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
