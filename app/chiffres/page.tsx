"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BarChart3, Wallet } from "lucide-react";
import { Empty, PageHeader } from "@/components/ui";
import { ActiviteCard, HonorairesCard, OrigineCard, TransformationCard, VentesCard } from "@/components/chiffres/Cartes";
import { useCollection } from "@/lib/store";
import { today } from "@/lib/format";
import { useMoi } from "@/lib/equipe";

/* « Mes chiffres » : honoraires encaissés et à venir, activité du mois, transformation
   et origine des acquéreurs, calculés à partir de ce qui est saisi dans le Hub. */

export default function MesChiffres() {
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const { items: rdvs } = useCollection("rdvs");
  const { items: estimations } = useCollection("estimations");
  const moi = useMoi();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const auj = today();
  const maintenant = new Date();
  const d = { biens, contacts, rdvs, estimations };

  return (
    <div>
      <PageHeader title="Mes chiffres" subtitle="Honoraires, activité et transformation, d'après ce qui est saisi dans le Hub." back="/"
        actions={
          ready && moi.role === "titulaire" ? (
            <Link href="/revenus" className="btn-secondary">
              <Wallet size={17} /> Mes revenus
            </Link>
          ) : undefined
        }
      />

      {!ready ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-48 rounded-2xl" />
          ))}
        </div>
      ) : !biens.length && !contacts.length ? (
        <div className="card">
          <Empty
            icon={<BarChart3 size={22} />}
            title="Pas encore de chiffres"
            text="Importez vos mandats et ajoutez vos contacts : vos honoraires, visites et offres s'afficheront ici."
            action={
              <Link href="/reglages" className="btn-primary">
                Importer mes mandats
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
            <HonorairesCard biens={biens} auj={auj} />
            <VentesCard biens={biens} auj={auj} />
          </div>
          <ActiviteCard d={d} auj={auj} maintenant={maintenant} />
          <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-2">
            <TransformationCard d={d} maintenant={maintenant} />
            <OrigineCard d={d} maintenant={maintenant} />
          </div>
          <p className="px-1 text-xs leading-relaxed text-muted">
            Les chiffres viennent du Hub&nbsp;: dates du suivi de la vente, offres rédigées, rendez-vous de l&apos;agenda, mandats et estimations. Une date ou un montant manquant n&apos;est pas compté.
          </p>
        </div>
      )}
    </div>
  );
}
