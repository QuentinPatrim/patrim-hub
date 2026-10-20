"use client";

import Image from "next/image";
import { useMemo } from "react";
import { ArrowRight, Building2, KeyRound } from "lucide-react";
import { useMoi } from "@/lib/equipe";
import { useCollection } from "@/lib/store";
import { BIEN_DISPONIBLE } from "@/lib/matching";
import { cx } from "@/components/ui";
import { locationDe, locationSeule } from "@/components/location/bienLocation";
import { choisirEspace, type Espace } from "./espace";

/* Écran d'entrée : PATRIM Hub Transaction ou PATRIM Hub Location, en deux grandes tuiles illustrées. */

export function ChoixEspace() {
  const moi = useMoi();
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");

  const tuiles = useMemo(() => {
    const vente = biens.filter((b) => !locationSeule(b) && BIEN_DISPONIBLE(b));
    const louer = biens.filter((b) => locationSeule(b) && locationDe(b)?.statut === "a_louer" && locationDe(b)?.site?.enLigne !== false);
    const photo = (l: typeof biens) => l.find((b) => b.photos?.[0]?.startsWith("http"))?.photos?.[0];
    return [
      {
        e: "vente" as Espace,
        titre: "Transaction",
        texte: "Mandats, acquéreurs, estimations, offres et suivi des ventes.",
        icon: Building2,
        fond: "from-brand via-[#561317] to-[#2a0b0d]",
        photo: photo(vente),
        chiffres: [
          [vente.length, vente.length > 1 ? "biens en vente" : "bien en vente"],
          [contacts.filter((c) => c.roles?.includes("acquereur")).length, "acquéreurs"],
        ] as [number, string][],
      },
      {
        e: "location" as Espace,
        titre: "Location",
        texte: "Biens à louer de patrim.fr, candidats, baux, cautions et gestion.",
        icon: KeyRound,
        fond: "from-ink via-[#1d2430] to-[#3a1215]",
        photo: photo(louer),
        chiffres: [
          [louer.length, "à louer"],
          [contacts.filter((c) => c.roles?.includes("locataire")).length, "candidats"],
        ] as [number, string][],
      },
    ];
  }, [biens, contacts]);

  return (
    <div className="mx-auto max-w-3xl py-2 sm:py-8 animate-fade-up">
      <div className="flex items-center gap-3">
        <Image src="/emblem.png" alt="" width={44} height={44} className="rounded-xl shadow-sm" />
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            <span className="h-px w-4 bg-coral" /> PATRIM Hub
          </div>
          <h1 className="h-title !text-[28px] sm:!text-[36px]">Bonjour {moi.prenom}</h1>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">Où travaillez-vous aujourd&apos;hui ?</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {tuiles.map(({ e, titre, texte, icon: Icon, fond, photo, chiffres }) => (
          <button
            key={e}
            type="button"
            onClick={() => choisirEspace(e)}
            className={cx(
              "group relative isolate flex min-h-[260px] sm:min-h-[340px] flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-5 sm:p-6 text-left text-white shadow-lift transition duration-300 hover:-translate-y-1 active:scale-[.99]",
              fond
            )}
          >
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="absolute inset-0 -z-20 size-full object-cover opacity-35 mix-blend-luminosity transition duration-700 group-hover:scale-105" />
            )}
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
            <div aria-hidden className="arcades absolute inset-x-0 bottom-0 -z-10 h-24 opacity-[0.10]" />
            <div aria-hidden className="absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-coral/25 blur-3xl" />

            <div className="flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-2xl bg-white/12 ring-1 ring-inset ring-white/20 backdrop-blur">
                <Icon size={23} />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">Hub</span>
            </div>

            <div className="mt-auto pt-8">
              <div className="font-serif text-[34px] sm:text-[40px] font-semibold leading-none tracking-tight">{titre}</div>
              <div className="mt-1.5 h-[3px] w-10 rounded-full bg-coral" />
              <p className="mt-3 max-w-[30ch] text-[13.5px] leading-snug text-white/75">{texte}</p>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="flex gap-4">
                  {chiffres.map(([n, l]) => (
                    <div key={l}>
                      <div className="font-serif text-2xl font-semibold leading-none tabular-nums">{n}</div>
                      <div className="mt-1 text-[11px] text-white/60">{l}</div>
                    </div>
                  ))}
                </div>
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-brand shadow-lg transition group-hover:translate-x-0.5">
                  <ArrowRight size={19} />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
      <p className="mt-5 text-center text-xs text-muted">Les propriétaires sont communs aux deux espaces. Pour changer d&apos;espace, touchez le bouton en haut de l&apos;écran.</p>
    </div>
  );
}
