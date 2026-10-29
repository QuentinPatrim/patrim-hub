"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Copy, Download, ExternalLink, Globe, Printer, Unlink, X } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { cloudEnabled } from "@/lib/supabase";
import { update } from "@/lib/store";
import { copier } from "@/components/assistant/outils";
import { qrSvg } from "@/components/qr/qr";
import { C } from "@/components/documents/charte";
import type { Bien, Contact } from "@/lib/types";
import { chargerDispo } from "@/components/visites/DisponibilitesCard";
import { changerCreneaux, creneauxAVenir, empreinteFiche, fichePageWeb, lienPageWeb, pageWebDe, publierPageWeb, retirerPageWeb } from "./pageweb";

/** Carte « Page web & QR vitrine » de la fiche du bien. */
export function PageWebCarte({ b, vendeurs }: { b: Bien; vendeurs: Contact[] }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const page = pageWebDe(b);
  const f = useMemo(() => fichePageWeb(b, vendeurs), [b, vendeurs]);
  const aJour = page?.empreinte === empreinteFiche(f);
  const lien = page ? lienPageWeb(page.id) : "";
  const qr = useMemo(() => (lien ? qrSvg(lien, C.brand) : ""), [lien]);

  // La page suit la fiche : remise à jour discrète quand quelque chose a changé.
  useEffect(() => {
    if (!page || aJour || busy) return;
    const t = setTimeout(() => void publierPageWeb(b, f).catch(() => {}), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id, aJour]);

  if (!cloudEnabled) return null;

  async function creer() {
    setBusy(true);
    setErr("");
    try {
      await publierPageWeb(b, f);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function telechargerQr() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([qr], { type: "image/svg+xml" }));
    a.download = `QR ${f.titre}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return (
    <Card title="Page web & QR vitrine">
      {!page ? (
        <>
          <p className="text-sm text-muted">
            Une page pour ce bien (photos, fiche, « Demander une visite ») avec son QR code à mettre en vitrine. Chaque demande arrive dans tes contacts, à rappeler le jour même, et te prévient sur le téléphone. Jamais l&apos;adresse exacte.
          </p>
          <button className="btn-primary mt-3" onClick={creer} disabled={busy}>
            {busy ? <Spinner /> : <Globe size={16} />} Créer la page
          </button>
        </>
      ) : (
        <div className="flex gap-4">
          <div className="w-28 shrink-0 overflow-hidden rounded-lg border border-line" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="min-w-0 flex-1">
            <p className="break-all text-xs text-muted">{lien}</p>
            {!aJour && <p className="mt-1 text-xs text-muted">Mise à jour en cours…</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              <Link className="btn-primary btn-sm !h-9" href={`/imprimer/vitrine/${b.id}`}>
                <Printer size={14} /> Affiche vitrine
              </Link>
              <button className="btn-secondary btn-sm !h-9" onClick={() => void copier(lien).then(() => setNote("Lien copié"))}>
                <Copy size={14} /> Lien
              </button>
              <button className="btn-secondary btn-sm !h-9" onClick={telechargerQr}>
                <Download size={14} /> QR
              </button>
              <a className="btn-secondary btn-sm !h-9" href={lien} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> Voir
              </a>
              <button
                className="btn-ghost btn-sm !h-9 text-danger"
                onClick={() => {
                  if (confirm("Retirer la page ? Le QR code ne mènera plus nulle part.")) void retirerPageWeb(b);
                }}
              >
                <Unlink size={14} /> Retirer
              </button>
            </div>
          </div>
        </div>
      )}
      {page && <Creneaux b={b} />}
      {note && <p className="mt-2 text-xs text-ok">{note}</p>}
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </Card>
  );
}

const samediProchain = () => {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return d.toLocaleDateString("sv-SE");
};
const jourCourt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", "h");

/** Dit si les créneaux de la semaine (Réglages) sont activés, sinon renvoie vers Réglages. */
function EtatDispo() {
  const [actif, setActif] = useState<boolean | null>(null);
  useEffect(() => {
    if (!cloudEnabled) return;
    chargerDispo()
      .then((r) => setActif(!!r.id && r.d.actif))
      .catch(() => setActif(null));
  }, []);
  if (actif === null) return null;
  return actif ? (
    <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
      Tes créneaux de la semaine sont activés : ils sont proposés automatiquement, moins ce qui est déjà pris dans ton agenda.{" "}
      <Link href="/reglages" className="underline">
        Les modifier
      </Link>
    </div>
  ) : (
    <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
      Tes créneaux de la semaine ne sont pas encore activés, donc rien n&apos;est proposé automatiquement.{" "}
      <Link href="/reglages" className="font-semibold underline">
        Les activer dans Réglages
      </Link>{" "}
      (une seule fois pour tous les biens).
    </div>
  );
}

/** Créneaux de visite en libre-service : le visiteur réserve sur la page web ceux qui restent libres dans l'agenda. */
function Creneaux({ b }: { b: Bien }) {
  const p = pageWebDe(b);
  const liste = creneauxAVenir(b);
  const [jour, setJour] = useState(samediProchain);
  const [de, setDe] = useState("10:00");
  const [a, setA] = useState("12:00");
  const [duree, setDuree] = useState(p?.dureeVisite ?? 45);
  const [enPlus, setEnPlus] = useState(false);
  const parJour = liste.reduce<Record<string, string[]>>((m, c) => ((m[jourCourt(c)] ??= []).push(c), m), {});

  function ajouter() {
    if (!jour || !de || !a) return;
    const fin = new Date(`${jour}T${a}`).getTime();
    const nouveaux: string[] = [];
    for (let t = new Date(`${jour}T${de}`).getTime(); t + duree * 60_000 <= fin; t += duree * 60_000) nouveaux.push(new Date(t).toISOString());
    if (nouveaux.length) changerCreneaux(b, [...liste, ...nouveaux], duree);
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="text-sm font-semibold">Visites en libre-service</div>
      <p className="mt-0.5 text-xs text-muted">
        Le visiteur réserve lui-même un créneau encore libre dans ton agenda (Hub et Google Agenda). La visite s&apos;ajoute aux deux agendas et la confirmation t&apos;attend dans « À envoyer ».
      </p>
      <EtatDispo />
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={!p?.sansDispo} onChange={(e) => p && update("biens", b.id, { pageWeb: { ...p, sansDispo: e.target.checked ? undefined : true } } as Partial<Bien>)} />
        Proposer mes créneaux de la semaine sur cette page
      </label>
      {!enPlus && liste.length === 0 ? (
        <button className="mt-2 text-xs font-medium text-muted underline" onClick={() => setEnPlus(true)}>
          + Ajouter un créneau exceptionnel (facultatif)
        </button>
      ) : (
        <div className="mt-2 text-xs font-medium text-muted">Créneaux exceptionnels, pour ce bien seulement (facultatif)</div>
      )}
      {liste.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {Object.entries(parJour).map(([j, cs]) => (
            <div key={j} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-xs font-medium capitalize text-muted">{j}</span>
              {cs.map((c) => (
                <span key={c} className="inline-flex h-7 items-center gap-1 rounded-full border border-line pl-2.5 pr-1 text-xs">
                  {heure(c)}
                  <button aria-label="Retirer ce créneau" className="grid size-5 place-items-center rounded-full hover:bg-black/5" onClick={() => changerCreneaux(b, liste.filter((x) => x !== c))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {(enPlus || liste.length > 0) && (
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted">
          Jour
          <input type="date" className="input mt-0.5 !h-9 w-[150px]" value={jour} onChange={(e) => setJour(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          De
          <input type="time" step={900} className="input mt-0.5 !h-9 w-[96px]" value={de} onChange={(e) => setDe(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          À
          <input type="time" step={900} className="input mt-0.5 !h-9 w-[96px]" value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label className="text-xs text-muted">
          Visite
          <select className="input mt-0.5 !h-9 w-[88px]" value={duree} onChange={(e) => setDuree(Number(e.target.value))}>
            {[30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary btn-sm !h-9" onClick={ajouter}>
          <CalendarPlus size={14} /> Ajouter
        </button>
      </div>
      )}
    </div>
  );
}
