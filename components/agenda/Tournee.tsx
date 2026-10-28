"use client";

import { MapPin, MessageSquare, Navigation } from "lucide-react";
import { Card } from "@/components/ui";
import { heure, nomComplet } from "@/lib/format";
import { getAll } from "@/lib/store";
import { nomConseiller } from "@/lib/equipe";
import { smsHref } from "@/components/biens/utils";
import type { Bien } from "@/lib/types";
import { lieuRdv, type RdvExt } from "./utils";

/** Tournée du jour : les rendez-vous sur place dans l'ordre, l'itinéraire complet et un SMS « je suis en route ». */
export function Tournee({ rdvs, bienOf }: { rdvs: RdvExt[]; bienOf: Map<string, Bien> }) {
  const maintenant = Date.now();
  const etapes = rdvs
    .filter((r) => r.type !== "appel" && r.statut !== "annule" && new Date(r.fin ?? r.debut).getTime() > maintenant - 15 * 60000)
    .map((r) => ({ r, lieu: lieuRdv(r, r.bienId ? bienOf.get(r.bienId) : undefined) }))
    .filter((e) => e.lieu)
    .sort((a, b) => a.r.debut.localeCompare(b.r.debut));
  if (etapes.length < 2) return null;

  const dest = etapes[etapes.length - 1].lieu;
  const via = etapes.slice(0, -1).map((e) => e.lieu);
  const itineraire = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&waypoints=${encodeURIComponent(via.join("|"))}&travelmode=driving`;

  return (
    <Card
      title={`Tournée : ${etapes.length} rendez-vous`}
      action={
        <a href={itineraire} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
          <Navigation size={14} /> Itinéraire
        </a>
      }
    >
      <ol className="space-y-2">
        {etapes.map(({ r, lieu }, i) => {
          const contacts = (r.contactIds ?? []).map((id) => getAll("contacts").find((c) => c.id === id)).filter((c) => c?.tel);
          return (
            <li key={r.id} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">{i + 1}</span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium">
                  {heure(r.debut)} · {r.bienId ? bienOf.get(r.bienId)?.titre : r.titre}
                </div>
                <div className="flex items-center gap-1 truncate text-xs text-muted">
                  <MapPin size={12} className="shrink-0" /> {lieu}
                </div>
              </div>
              {contacts.slice(0, 1).map((c) => (
                <a
                  key={c!.id}
                  href={smsHref(c!.tel, `Bonjour ${c!.prenom || nomComplet(c!)}, je suis en route pour notre rendez-vous de ${heure(r.debut)}, à tout de suite. ${nomConseiller()}, PATRIM`)}
                  className="btn-ghost btn-sm shrink-0 !px-2"
                  aria-label={`Prévenir ${nomComplet(c!)} que j'arrive`}
                >
                  <MessageSquare size={15} /> En route
                </a>
              ))}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
