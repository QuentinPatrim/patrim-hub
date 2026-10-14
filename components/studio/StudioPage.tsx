"use client";

import { Building2, CalendarRange, Clapperboard, Images, Megaphone } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cx, Empty, PageHeader } from "@/components/ui";
import { useCollection } from "@/lib/store";
import type { Bien } from "@/lib/types";
import { BienPicker } from "./BienPicker";
import { Calendrier } from "./Calendrier";
import { KitDiffusion } from "./KitDiffusion";
import { Video } from "./Video";
import { Visuels } from "./Visuels";

type Onglet = "kit" | "visuels" | "video" | "calendrier";
const ONGLETS: { value: Onglet; label: string; icon: ReactNode }[] = [
  { value: "kit", label: "Kit de diffusion", icon: <Megaphone size={16} /> },
  { value: "visuels", label: "Visuels", icon: <Images size={16} /> },
  { value: "video", label: "Vidéo", icon: <Clapperboard size={16} /> },
  { value: "calendrier", label: "Calendrier", icon: <CalendarRange size={16} /> },
];
const TAB_KEY = "patrim-hub:studio-onglet";
const BIEN_KEY = "patrim-hub:studio-bien";

export function StudioPage() {
  const params = useSearchParams();
  const { items: biens } = useCollection("biens");
  const [bienId, setBienId] = useState<string | undefined>(params.get("bien") ?? undefined);
  const [onglet, setOnglet] = useState<Onglet>("kit");

  useEffect(() => {
    try {
      const o = (params.get("onglet") as Onglet | null) ?? (localStorage.getItem(TAB_KEY) as Onglet | null);
      if (o && ONGLETS.some((x) => x.value === o)) setOnglet(o);
      if (!params.get("bien")) {
        const last = localStorage.getItem(BIEN_KEY);
        if (last) setBienId((v) => v ?? last);
      }
    } catch {}
  }, [params]);

  useEffect(() => {
    const p = params.get("bien");
    if (p) setBienId(p);
  }, [params]);

  const bien: Bien | undefined = useMemo(() => {
    const found = biens.find((b) => b.id === bienId);
    if (found) return found;
    return biens.find((b) => b.statut === "en_vente") ?? biens.find((b) => b.statut === "mandat_signe") ?? biens[0];
  }, [biens, bienId]);

  const choisir = (b: Bien) => {
    setBienId(b.id);
    try {
      localStorage.setItem(BIEN_KEY, b.id);
      const url = new URL(window.location.href);
      url.searchParams.set("bien", b.id);
      window.history.replaceState(null, "", url.toString());
    } catch {}
  };
  const changerOnglet = (o: Onglet) => {
    setOnglet(o);
    try {
      localStorage.setItem(TAB_KEY, o);
    } catch {}
  };

  const besoinBien = onglet !== "calendrier";

  return (
    <div className="min-w-0">
      <PageHeader title="Studio" subtitle="Annonces, posts, visuels et reels aux couleurs de PATRIM" />

      <div className="space-y-4">
        {/* Onglets */}
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
          <div className="inline-flex min-w-full sm:min-w-0 gap-1 rounded-full border border-line/70 bg-surface-2/80 p-1">
            {ONGLETS.map((o) => (
              <button
                key={o.value}
                onClick={() => changerOnglet(o.value)}
                className={cx(
                  "flex flex-1 sm:flex-none items-center justify-center gap-2 h-10 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap transition duration-200",
                  onglet === o.value ? "bg-surface text-fg ring-1 ring-line/70 shadow-[0_1px_2px_rgb(var(--shadow)/0.08),0_2px_8px_-2px_rgb(var(--shadow)/0.1)]" : "text-muted hover:text-fg"
                )}
              >
                <span className={cx(onglet === o.value && "text-accent")}>{o.icon}</span>
                <span className={cx(onglet !== o.value && "max-[420px]:hidden")}>{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        {besoinBien && biens.length > 0 && <BienPicker biens={biens} value={bien} onChange={choisir} />}

        {besoinBien && !bien ? (
          <div className="card">
            <Empty
              icon={<Building2 size={22} />}
              title="Ajoutez d'abord un bien"
              text="Le Studio prépare l'annonce, les posts, les visuels et la vidéo à partir de la fiche du bien."
              action={
                <Link href="/biens" className="btn-primary">
                  Aller aux biens
                </Link>
              }
            />
          </div>
        ) : (
          <div key={onglet} className="animate-fade-up">
            {onglet === "kit" && bien && <KitDiffusion bien={bien} />}
            {onglet === "visuels" && bien && <Visuels key={bien.id} bien={bien} />}
            {onglet === "video" && bien && <Video key={bien.id} bien={bien} />}
            {onglet === "calendrier" && <Calendrier bienCourant={bien} />}
          </div>
        )}
      </div>
    </div>
  );
}
