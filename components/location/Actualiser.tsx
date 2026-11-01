"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cx } from "@/components/ui";
import { authHeaders } from "@/lib/ai";
import { create, getAll, refreshAll, update } from "@/lib/store";
import { ilya } from "@/lib/format";
import { bienDepuisAnnonce, horsLigne, memeLogement, refSite, type AnnonceLocation, type BilanActualisation } from "./site";
import type { BienLocation } from "./bienLocation";
import type { Bien } from "@/lib/types";

/* Bouton « Actualiser depuis patrim.fr » du Hub Location. Avec Supabase,
   le serveur met à jour les biens de toute l'équipe ; sinon les annonces
   sont rangées dans ce navigateur. Actualisation automatique à l'ouverture
   si la dernière date de plus de 6 heures sur cet appareil. */

const CLE = "patrim-hub:locations-maj";
const AUTO = 6 * 3600_000;

function rangerLocalement(annonces: AnnonceLocation[]): BilanActualisation {
  const now = new Date().toISOString();
  const biens = getAll("biens") as BienLocation[];
  const parRef = new Map(biens.filter(refSite).map((b) => [refSite(b)!, b]));
  const bilan: BilanActualisation = { ajoutes: 0, misAJour: 0, horsLigne: 0, total: annonces.length };
  for (const a of annonces) {
    const avant = parRef.get(a.ref) ?? memeLogement(a, getAll("biens") as BienLocation[]);
    const data = bienDepuisAnnonce(a, avant, now);
    if (avant) {
      update("biens", avant.id, data as Partial<Bien>);
      bilan.misAJour++;
    } else {
      create("biens", data as Omit<Bien, "id" | "createdAt" | "updatedAt">);
      bilan.ajoutes++;
    }
  }
  const enLigne = new Set(annonces.map((a) => a.ref));
  for (const [ref, b] of parRef) {
    const h = !enLigne.has(ref) && horsLigne(b);
    if (h) {
      update("biens", b.id, { location: h.location } as Partial<Bien>);
      bilan.horsLigne++;
    }
  }
  return bilan;
}

export async function actualiserLocations(): Promise<BilanActualisation> {
  const r = await fetch("/api/locations-site", { method: "POST", headers: await authHeaders(), cache: "no-store" });
  const j = (await r.json().catch(() => ({}))) as { error?: string; bilan?: BilanActualisation; annonces?: AnnonceLocation[] };
  if (!r.ok || j.error) throw new Error(j.error || "Actualisation impossible pour l'instant.");
  const bilan = j.bilan ?? rangerLocalement(j.annonces ?? []);
  if (j.bilan) refreshAll();
  try {
    localStorage.setItem(CLE, new Date().toISOString());
  } catch {}
  return bilan;
}

function phrase(b: BilanActualisation) {
  const morceaux = [`${b.total} annonce${b.total > 1 ? "s" : ""} en ligne`];
  if (b.ajoutes) morceaux.push(`${b.ajoutes} nouvelle${b.ajoutes > 1 ? "s" : ""}`);
  if (b.horsLigne) morceaux.push(`${b.horsLigne} retirée${b.horsLigne > 1 ? "s" : ""} du site`);
  return morceaux.join(" · ");
}

export function ActualiserLocations({ auto = true, className }: { auto?: boolean; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [derniere, setDerniere] = useState<string | null>(null);

  const lancer = async () => {
    setBusy(true);
    setErr(null);
    try {
      setMsg(phrase(await actualiserLocations()));
      setDerniere(new Date().toISOString());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let d: string | null = null;
    try {
      d = localStorage.getItem(CLE);
    } catch {}
    setDerniere(d);
    if (auto && (!d || Date.now() - Date.parse(d) > AUTO)) void lancer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cx("card card-pad flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-medium">Annonces de location de patrim.fr</div>
        <div className={cx("text-xs", err ? "text-danger" : "text-muted")}>
          {err ?? (busy ? "Lecture du site en cours…" : msg ?? (derniere ? `Actualisé ${ilya(derniere)}, pour toute l'équipe` : "Pas encore actualisé"))}
        </div>
      </div>
      <button type="button" className="btn-secondary !h-11 shrink-0" onClick={lancer} disabled={busy}>
        <RefreshCw size={16} className={busy ? "animate-spin" : undefined} /> Actualiser
      </button>
    </div>
  );
}
