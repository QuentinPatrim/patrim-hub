"use client";

import Image from "next/image";
import { ArrowRight, Building2, KeyRound } from "lucide-react";
import { useMoi } from "@/lib/equipe";
import { choisirEspace, type Espace } from "./espace";

/* Écran d'entrée : PATRIM Hub Transaction ou PATRIM Hub Location. */

const ESPACES: { e: Espace; titre: string; texte: string; icon: typeof Building2 }[] = [
  { e: "vente", titre: "Hub Transaction", texte: "Biens en vente, acquéreurs, estimations, offres, mandats et suivi des ventes.", icon: Building2 },
  { e: "location", titre: "Hub Location", texte: "Biens à louer de patrim.fr, candidats, estimation locative, mandat de gestion, bail et cautions.", icon: KeyRound },
];

export function ChoixEspace() {
  const moi = useMoi();
  return (
    <div className="mx-auto max-w-2xl py-4 sm:py-10 animate-fade-up">
      <div className="flex items-center gap-3">
        <Image src="/emblem.png" alt="" width={44} height={44} className="rounded-xl shadow-sm" />
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">PATRIM Hub</div>
          <h1 className="h-title !text-[28px] sm:!text-[34px]">Bonjour {moi.prenom}</h1>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">Dans quel espace travaillez-vous ? Vous pourrez changer à tout moment avec le bouton en haut de l&apos;écran.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {ESPACES.map(({ e, titre, texte, icon: Icon }) => (
          <button
            key={e}
            type="button"
            onClick={() => choisirEspace(e)}
            className="group card card-pad flex flex-col items-start gap-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift active:scale-[.99]"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-b from-brand-light to-brand text-white shadow-btn">
              <Icon size={22} />
            </span>
            <span className="font-serif text-xl font-semibold">{titre}</span>
            <span className="text-sm text-muted">{texte}</span>
            <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-accent">
              Entrer <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted">Les propriétaires sont communs aux deux espaces.</p>
    </div>
  );
}
