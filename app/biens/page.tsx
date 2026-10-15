"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Building2, FileSignature, Plus, Search, X } from "lucide-react";
import { Empty, PageHeader, Tabs } from "@/components/ui";
import { BienCard, BienCardSkeleton } from "@/components/biens/BienCard";
import { STATUTS, acquereursCompatibles, prixM2 } from "@/components/biens/utils";
import { useCollection } from "@/lib/store";
import { STATUT_BIEN, eurK } from "@/lib/format";
import type { Bien, BienStatut } from "@/lib/types";

type Filtre = "actifs" | "tous" | BienStatut;
type Tri = "recent" | "prix_desc" | "prix_asc" | "pm2" | "anciens";

const TRIS: { value: Tri; label: string }[] = [
  { value: "recent", label: "Plus récents" },
  { value: "prix_desc", label: "Prix décroissant" },
  { value: "prix_asc", label: "Prix croissant" },
  { value: "pm2", label: "Prix au m²" },
  { value: "anciens", label: "En vente depuis longtemps" },
];

const ACTIFS: BienStatut[] = ["en_vente", "mandat_signe", "sous_offre", "compromis"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function BiensPage() {
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("actifs");
  const [tri, setTri] = useState<Tri>("recent");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    try {
      const saved = JSON.parse(sessionStorage.getItem("patrim-hub:biens-vue") || "{}");
      if (saved.filtre) setFiltre(saved.filtre);
      if (saved.tri) setTri(saved.tri);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("patrim-hub:biens-vue", JSON.stringify({ filtre, tri }));
    } catch {}
  }, [filtre, tri]);

  const matchCount = useMemo(() => {
    const m = new Map<string, number>();
    biens.forEach((b) => m.set(b.id, acquereursCompatibles(b, contacts).length));
    return m;
  }, [biens, contacts]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { tous: biens.length, actifs: 0 };
    biens.forEach((b) => {
      c[b.statut] = (c[b.statut] ?? 0) + 1;
      if (ACTIFS.includes(b.statut)) c.actifs++;
    });
    return c;
  }, [biens]);

  const liste = useMemo(() => {
    const s = norm(q.trim());
    const dateRef = (b: Bien) => b.dateMiseEnVente ?? b.createdAt;
    return biens
      .filter((b) => (filtre === "tous" ? true : filtre === "actifs" ? ACTIFS.includes(b.statut) : b.statut === filtre))
      .filter((b) => !s || norm([b.titre, b.adresse, b.ville, b.quartier, b.codePostal, b.ref, b.mandat?.numero].filter(Boolean).join(" ")).includes(s))
      .sort((a, b) => {
        switch (tri) {
          case "prix_desc":
            return (b.prix ?? -1) - (a.prix ?? -1);
          case "prix_asc":
            return (a.prix ?? Infinity) - (b.prix ?? Infinity);
          case "pm2":
            return (prixM2(b) ?? -1) - (prixM2(a) ?? -1);
          case "anciens":
            return dateRef(a).localeCompare(dateRef(b));
          default:
            return b.createdAt.localeCompare(a.createdAt);
        }
      });
  }, [biens, q, filtre, tri]);

  const enVente = biens.filter((b) => b.statut === "en_vente" || b.statut === "mandat_signe");
  const valeur = enVente.reduce((s, b) => s + (b.prix ?? 0), 0);
  const honoraires = biens.filter((b) => ACTIFS.includes(b.statut)).reduce((s, b) => s + (b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : 0)), 0);

  const tabs = [
    { value: "actifs" as Filtre, label: "En cours", count: counts.actifs },
    ...STATUTS.filter((s) => counts[s] || s === "en_vente").map((s) => ({ value: s as Filtre, label: STATUT_BIEN[s].label, count: counts[s] ?? 0 })),
    { value: "tous" as Filtre, label: "Tous", count: counts.tous },
  ];

  return (
    <div>
      <PageHeader
        title="Biens"
        subtitle={biens.length ? `${counts.actifs} mandat${counts.actifs > 1 ? "s" : ""} en cours` : "Votre portefeuille de mandats"}
        actions={
          <>
            <Link href="/mandats" className="btn-secondary">
              <FileSignature size={16} /> Registre des mandats
            </Link>
            <Link href="/biens/nouveau" className="btn-primary">
              <Plus size={16} /> Nouveau bien
            </Link>
          </>
        }
      />

      {biens.length > 0 && (
        <div className="mb-5 card grid grid-cols-3 divide-x divide-line/70 animate-fade-up">
          <MiniStat label="En vente" value={String(enVente.length)} />
          <MiniStat label="Valeur affichée" value={eurK(valeur)} />
          <MiniStat label="Honoraires en jeu" value={eurK(honoraires)} accent />
        </div>
      )}

      {biens.length > 0 && (
        <div className="mb-5 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre, adresse, quartier, référence…" className="input !h-11 pl-9 pr-9" type="search" enterKeyHint="search" />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-7 rounded-lg text-muted hover:bg-surface-2" aria-label="Effacer">
                  <X size={14} />
                </button>
              )}
            </div>
            <label className="relative shrink-0">
              <span className="sr-only">Trier</span>
              <ArrowUpDown size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} className="input !h-11 pl-9 w-[52px] sm:w-auto appearance-none sm:appearance-auto text-transparent sm:text-fg" aria-label="Trier">
                {TRIS.map((t) => (
                  <option key={t.value} value={t.value} className="text-fg">
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Tabs value={filtre} onChange={setFiltre} items={tabs} />
        </div>
      )}

      {!ready ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <BienCardSkeleton key={i} />
          ))}
        </div>
      ) : !biens.length ? (
        <div className="card">
          <Empty
            icon={<Building2 size={22} />}
            title="Aucun bien pour l'instant"
            text="Ajoutez votre premier mandat : photos, prix, diagnostics, vendeur… Tout sera prêt pour les visites et les annonces."
            action={
              <Link href="/biens/nouveau" className="btn-primary">
                <Plus size={16} /> Ajouter un bien
              </Link>
            }
          />
        </div>
      ) : !liste.length ? (
        <div className="card">
          <Empty
            icon={<Search size={22} />}
            title="Aucun bien ne correspond"
            text={q ? `Rien pour « ${q} » dans cette catégorie.` : "Aucun bien dans cette catégorie."}
            action={
              <button
                className="btn-secondary"
                onClick={() => {
                  setQ("");
                  setFiltre("tous");
                }}
              >
                Voir tous les biens
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {liste.map((b, i) => (
              <BienCard key={b.id} bien={b} matches={matchCount.get(b.id) ?? 0} index={i} />
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted">
            {liste.length} bien{liste.length > 1 ? "s" : ""} affiché{liste.length > 1 ? "s" : ""}
          </p>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">
      <div className="text-[11px] font-medium text-muted truncate">{label}</div>
      <div className={"mt-1 font-serif text-xl sm:text-[26px] leading-none font-semibold tracking-tight tabular-nums truncate" + (accent ? " text-accent" : "")}>{value}</div>
    </div>
  );
}
