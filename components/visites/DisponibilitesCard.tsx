"use client";

import { useEffect, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Card, Spinner, cx } from "@/components/ui";
import { cloudEnabled, supabase } from "@/lib/supabase";
import { uid } from "@/lib/store";
import { DISPO_DEFAUT, NOMS_JOURS, type Dispo } from "./disponibilites";

/* Réglages : créneaux de visite proposés sur la page web (QR code) de tous les biens.
   Les rendez-vous de l'agenda (Hub et Google Agenda) les retirent automatiquement. */

const ORDRE = [1, 2, 3, 4, 5, 6, 0];

export async function chargerDispo(): Promise<{ id?: string; d: Dispo }> {
  if (!supabase) return { d: DISPO_DEFAUT };
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { d: DISPO_DEFAUT };
  const { data } = await supabase.from("hub_docs").select("id,data").eq("kind", "dispo").eq("user_id", u.user.id).order("updated_at", { ascending: false }).limit(1);
  const r = data?.[0] as { id: string; data: Dispo } | undefined;
  return r ? { id: r.id, d: { ...DISPO_DEFAUT, ...r.data } } : { d: DISPO_DEFAUT };
}

export function DisponibilitesCard() {
  const [id, setId] = useState<string>();
  const [d, setD] = useState<Dispo | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    chargerDispo()
      .then((r) => {
        setId(r.id);
        setD(r.d);
      })
      .catch(() => setD(DISPO_DEFAUT));
  }, []);

  if (!cloudEnabled) return null;

  async function enregistrer(x: Dispo) {
    if (!supabase) return;
    setBusy(true);
    setNote("");
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Connecte-toi d'abord.");
      const cle = id ?? uid();
      const { error } = await supabase.from("hub_docs").upsert({ id: cle, kind: "dispo", user_id: u.user.id, data: x, updated_at: new Date().toISOString() });
      if (error) throw new Error("Enregistrement impossible : " + error.message);
      setId(cle);
      setNote(x.actif ? "Enregistré : tes créneaux sont proposés sur la page de chaque bien." : "Enregistré : plus aucun créneau proposé automatiquement.");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const majJour = (j: number, plages: Dispo["jours"][number]) => d && setD({ ...d, jours: { ...d.jours, [j]: plages } });

  return (
    <Card title="Créneaux de visite en ligne">
      <p className="text-sm text-muted">
        Proposés sur la page web (QR code) de tous tes biens. Dès qu&apos;un rendez-vous occupe un créneau dans ton agenda, Google Agenda compris, il disparaît des pages. Une visite réservée s&apos;ajoute à ton agenda.
      </p>
      {!d ? (
        <div className="mt-3">
          <Spinner />
        </div>
      ) : (
        <>
          <label className="mt-3 flex items-center gap-2.5 text-sm font-semibold">
            <input type="checkbox" className="size-4" checked={d.actif} onChange={(e) => setD({ ...d, actif: e.target.checked })} />
            Proposer mes créneaux sur les pages des biens
          </label>
          <div className={cx("mt-3 space-y-2", !d.actif && "opacity-50")}>
            {ORDRE.map((j) => {
              const plages = d.jours?.[j] ?? [];
              return (
                <div key={j} className="flex flex-wrap items-center gap-2 border-b border-line/60 pb-2 last:border-0">
                  <label className="flex w-28 shrink-0 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={plages.length > 0} onChange={(e) => majJour(j, e.target.checked ? [{ de: "10:00", a: "12:00" }] : [])} />
                    {NOMS_JOURS[j]}
                  </label>
                  {plages.map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <input type="time" step={900} className="input !h-9 w-[104px] !px-2" value={p.de} onChange={(e) => majJour(j, plages.map((x, k) => (k === i ? { ...x, de: e.target.value } : x)))} />
                      <span className="text-muted">à</span>
                      <input type="time" step={900} className="input !h-9 w-[104px] !px-2" value={p.a} onChange={(e) => majJour(j, plages.map((x, k) => (k === i ? { ...x, a: e.target.value } : x)))} />
                      <button aria-label="Retirer cette plage" className="grid size-8 place-items-center rounded-full text-muted hover:bg-fg/5" onClick={() => majJour(j, plages.filter((_, k) => k !== i))}>
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                  {plages.length > 0 && plages.length < 3 && (
                    <button className="btn-ghost btn-sm !h-8" onClick={() => majJour(j, [...plages, { de: "14:30", a: "18:00" }])}>
                      <Plus size={14} /> Plage
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-muted">
              Durée d&apos;une visite
              <select className="input mt-0.5 !h-9 w-[100px]" value={d.duree} onChange={(e) => setD({ ...d, duree: Number(e.target.value) })}>
                {[30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Réservable jusqu&apos;à
              <select className="input mt-0.5 !h-9 w-[120px]" value={d.horizon} onChange={(e) => setD({ ...d, horizon: Number(e.target.value) })}>
                {[7, 14, 21, 28].map((n) => (
                  <option key={n} value={n}>
                    {n / 7} semaine{n > 7 ? "s" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-primary btn-sm !h-9" disabled={busy} onClick={() => void enregistrer(d)}>
              {busy ? <Spinner /> : <Check size={15} />} Enregistrer
            </button>
          </div>
          {note && <p className="mt-2 text-xs text-muted">{note}</p>}
          <p className="mt-2 text-xs text-muted">Les rendez-vous Google Agenda arrivent dans le Hub toutes les 5 minutes. Un créneau n&apos;est jamais proposé moins de 2 heures à l&apos;avance.</p>
        </>
      )}
    </Card>
  );
}
