"use client";

import { Cloud, CloudOff, Database, Download, KeyRound, LogOut, Upload, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Field, PageHeader } from "@/components/ui";
import { MANDATS_PATRIM } from "@/lib/seed";
import { bulkCreate, getAll } from "@/lib/store";
import { cloudEnabled, supabase } from "@/lib/supabase";
import type { Kind } from "@/lib/types";

const KINDS: Kind[] = ["biens", "contacts", "rdvs", "estimations", "taches", "contenus", "briefings"];

export default function Reglages() {
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    try {
      setCode(localStorage.getItem("patrim-hub:passcode") ?? "");
    } catch {}
  }, []);

  async function importerMandats() {
    const existants = new Set(getAll("biens").map((b) => b.adresse.toLowerCase()));
    const nouveaux = MANDATS_PATRIM.filter((b) => !existants.has(b.adresse.toLowerCase()));
    await bulkCreate("biens", nouveaux.map((b) => ({ ...b, dateMiseEnVente: undefined })));
    setMsg(nouveaux.length ? `${nouveaux.length} mandats importés. Pensez à relier les vendeurs et ajouter les photos.` : "Vos mandats sont déjà dans l'appli.");
  }

  function exporter() {
    const data = Object.fromEntries(KINDS.map((k) => [k, getAll(k)]));
    const blob = new Blob([JSON.stringify({ version: 1, date: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `patrim-hub-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function importer(file: File) {
    try {
      const j = JSON.parse(await file.text());
      let n = 0;
      for (const k of KINDS) {
        const ids = new Set(getAll(k).map((x) => x.id));
        const rows = (j.data?.[k] ?? []).filter((x: { id: string }) => !ids.has(x.id));
        if (rows.length) await bulkCreate(k, rows);
        n += rows.length;
      }
      setMsg(`${n} éléments restaurés.`);
    } catch {
      setMsg("Ce fichier n'est pas une sauvegarde PATRIM Hub.");
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <PageHeader title="Réglages" subtitle="Compte, données et sauvegardes" />

      <Card title="Compte">
        {cloudEnabled ? (
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-xl bg-ok/10 text-ok"><Cloud size={18} /></span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Synchronisé</div>
              <div className="text-xs text-muted">{email ?? "…"} · vos données sont sur tous vos appareils</div>
            </div>
            <button onClick={() => supabase?.auth.signOut()} className="btn-secondary btn-sm"><LogOut size={14} /> Déconnexion</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-xl bg-warn/10 text-warn"><CloudOff size={18} /></span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Mode local</div>
              <div className="text-xs text-muted">Les données restent sur cet appareil. Faites une sauvegarde régulière.</div>
            </div>
          </div>
        )}
      </Card>

      {!cloudEnabled && (
        <Card title="Code d'accès à l'assistant">
          <Field label="Code" hint="Le même que la variable APP_PASSCODE de l'hébergement, s'il y en a une.">
            <div className="flex gap-2">
              <input className="input" type="password" value={code} onChange={(e) => setCode(e.target.value)} />
              <button
                className="btn-primary"
                onClick={() => {
                  try {
                    localStorage.setItem("patrim-hub:passcode", code);
                  } catch {}
                  setMsg("Code enregistré.");
                }}
              >
                <KeyRound size={15} /> Enregistrer
              </button>
            </div>
          </Field>
        </Card>
      )}

      <Card title="Données">
        <div className="grid sm:grid-cols-3 gap-2">
          <button onClick={importerMandats} className="btn-secondary h-auto py-3 flex-col">
            <Building2 size={18} /> Importer mes mandats
          </button>
          <button onClick={exporter} className="btn-secondary h-auto py-3 flex-col">
            <Download size={18} /> Sauvegarder
          </button>
          <label className="btn-secondary h-auto py-3 flex-col cursor-pointer">
            <Upload size={18} /> Restaurer
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importer(e.target.files[0])} />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-7 gap-2 text-center">
          {KINDS.map((k) => (
            <div key={k} className="rounded-xl bg-surface-2 py-2">
              <div className="font-semibold tabular-nums">{getAll(k).length}</div>
              <div className="text-[10px] text-muted capitalize">{k}</div>
            </div>
          ))}
        </div>
        {msg && <p className="mt-3 text-sm text-accent flex items-center gap-2"><Database size={14} /> {msg}</p>}
      </Card>

      <p className="text-center text-xs text-muted pt-4">PATRIM Hub · conçu pour l&apos;agence PATRIM, Toulouse</p>
    </div>
  );
}
