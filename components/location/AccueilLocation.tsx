"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, ClipboardList, KeyRound, ShieldCheck, Calculator } from "lucide-react";
import { BienCard } from "@/components/biens/BienCard";
import { useCollection } from "@/lib/store";
import { dateLongue, eur } from "@/lib/format";
import { useMoi } from "@/lib/equipe";
import { ActualiserLocations } from "./Actualiser";
import { locationDe, locationSeule } from "./bienLocation";

/* Accueil du Hub Location : biens à louer (communs à toute l'équipe), actualisation depuis patrim.fr, raccourcis. */

const RACCOURCIS = [
  { href: "/locatives", label: "Estimation locative", icon: Calculator },
  { href: "/rediger", label: "Fiche candidat", icon: ClipboardList },
  { href: "/rediger", label: "Bail", icon: KeyRound },
  { href: "/rediger", label: "Caution", icon: ShieldCheck },
  { href: "/rediger", label: "Mandat de gestion", icon: Building2 },
];

export function AccueilLocation() {
  const moi = useMoi();
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const loc = useMemo(() => biens.filter(locationSeule), [biens]);
  const aLouer = loc.filter((b) => locationDe(b)?.statut === "a_louer" && locationDe(b)?.site?.enLigne !== false);
  const loues = loc.filter((b) => locationDe(b)?.statut !== "a_louer").length;
  const gestion = loc.filter((b) => locationDe(b)?.gestion).length;
  const loyers = aLouer.reduce((s, b) => s + (locationDe(b)?.loyer ?? 0), 0);
  const candidats = contacts.filter((c) => c.roles?.includes("locataire")).length;

  if (!mounted) return <div className="skeleton h-56 !rounded-3xl" />;

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="hero-accueil relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-ink via-[#2a1416] to-brand text-white shadow-lift animate-fade-up">
        <div aria-hidden className="arcades absolute inset-x-0 bottom-0 h-32 opacity-[0.11] -z-10" />
        <div className="p-5 pt-6 sm:p-8">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
            <span className="h-px w-5 bg-coral" />
            <span>Hub Location</span>
            <span className="text-white/40">·</span>
            <span className="first-letter:uppercase normal-case tracking-normal">{dateLongue(new Date().toISOString())}</span>
          </div>
          <h1 className="mt-3 font-serif text-[32px] sm:text-[42px] leading-[1.05] font-semibold tracking-[-0.02em]">Bonjour {moi.prenom}</h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-white/75">
            {aLouer.length ? `${aLouer.length} bien${aLouer.length > 1 ? "s" : ""} à louer en ligne sur patrim.fr.` : "Les biens à louer arrivent tout seuls depuis patrim.fr."}
          </p>
          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            <Fig href="/biens" label="À louer" value={aLouer.length} hint={loyers ? `${eur(loyers)} de loyers HC` : "Annonces en ligne"} />
            <Fig href="/biens" label="Loués" value={loues} hint="Suivis dans le Hub" />
            <Fig href="/biens" label="En gestion" value={gestion} hint="Mandats signés" />
            <Fig href="/contacts" label="Candidats" value={candidats} hint="Prospects location" />
          </div>
        </div>
      </section>

      <ActualiserLocations />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {RACCOURCIS.map(({ href, label, icon: Icon }) => (
          <Link key={label} href={href} className="card card-pad card-hover flex items-center gap-3 !py-3 text-sm font-semibold max-sm:last:col-span-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
              <Icon size={17} />
            </span>
            <span className="min-w-0 leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h-section">À louer</h2>
          <Link href="/biens" className="link text-sm">
            Tous les biens <ArrowRight size={14} />
          </Link>
        </div>
        {aLouer.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {aLouer.slice(0, 6).map((b, i) => (
              <BienCard key={b.id} bien={b} matches={0} index={i} location />
            ))}
          </div>
        ) : (
          <p className="card card-pad text-sm text-muted">Aucun bien à louer pour l&apos;instant. Touchez « Actualiser » pour lire les annonces de patrim.fr.</p>
        )}
      </section>
    </div>
  );
}

function Fig({ href, label, value, hint }: { href: string; label: string; value: React.ReactNode; hint: string }) {
  return (
    <Link href={href} className="group min-w-0 rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/10 p-3 sm:p-4 transition hover:bg-white/[0.11]">
      <div className="text-[11px] font-medium text-white/60 truncate">{label}</div>
      <div className="mt-1.5 font-serif text-[26px] sm:text-[30px] leading-none font-semibold tabular-nums truncate">{value}</div>
      <div className="mt-1.5 text-[11px] text-white/55 truncate">{hint}</div>
    </Link>
  );
}
