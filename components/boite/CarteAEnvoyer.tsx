"use client";

import Link from "next/link";
import { ChevronRight, Send } from "lucide-react";
import { Badge } from "@/components/ui";
import { nomComplet } from "@/lib/format";
import { CATEGORIE } from "./envois";
import { useEnvois } from "./useEnvois";

/** Accueil : les messages prêts à relire, en un coup d'œil. */
export function CarteAEnvoyer() {
  const envois = useEnvois();
  if (!envois.length) return null;
  return (
    <Link href="/a-envoyer" className="card card-hover group block p-4 sm:p-5 animate-fade-up">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center size-11 shrink-0 rounded-2xl bg-gradient-to-b from-brand-light to-brand text-white shadow-btn">
          <Send size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-serif text-lg font-semibold tracking-tight">
            {envois.length} message{envois.length > 1 ? "s" : ""} prêt{envois.length > 1 ? "s" : ""} à envoyer
          </div>
          <div className="text-xs text-muted truncate">{envois.slice(0, 3).map((e) => nomComplet(e.contact)).join(", ")}{envois.length > 3 ? "…" : ""}</div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(
          envois.reduce<Record<string, number>>((acc, e) => ((acc[e.cat] = (acc[e.cat] ?? 0) + 1), acc), {}),
        ).map(([cat, n]) => (
          <Badge key={cat} tone={CATEGORIE[cat as keyof typeof CATEGORIE].tone}>
            {CATEGORIE[cat as keyof typeof CATEGORIE].label} · {n}
          </Badge>
        ))}
      </div>
    </Link>
  );
}
