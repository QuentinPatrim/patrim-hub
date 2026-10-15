"use client";

import { Cloud, CloudOff, Database, Download, KeyRound, LogOut, Upload, Building2, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, Field, PageHeader } from "@/components/ui";
import { importerMandats as importerMandatsComplets } from "@/lib/mandats";
import { SignatureCard } from "@/components/reglages/SignatureCard";
import { AvisCard } from "@/components/reglages/AvisCard";
import { bulkCreate, getAll } from "@/lib/store";
import { cloudEnabled, supabase } from "@/lib/supabase";
import type { Kind } from "@/lib/types";

const KINDS: Kind[] = ["biens", "contacts", "rdvs", "estimations", "taches", "contenus", "briefings"];
const NOMS: Record<Kind, string> = { biens: "Biens", contacts: "Contacts", rdvs: "Rendez-vous", estimations: "Estimations", taches: "Tâches", contenus: "Contenus", briefings: "Briefings" } as Record<Kind, string>;

export default function Reglages() {
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    try {
      setCode(localStorage.getItem("patrim-hub:passcode") ?? "");
    } catch {}
  }, []);

  async function importerMandats() {
    const { crees, maj } = await importerMandatsComplets();
    setMsg(crees || maj ? `${crees} mandat${crees > 1 ? "s" : ""} ajouté${crees > 1 ? "s" : ""}, ${maj} complété${maj > 1 ? "s" : ""}.` : "Vos mandats sont déjà à jour.");
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
            <span className="grid place-items-center size-11 shrink-0 rounded-xl bg-ok/10 text-ok ring-1 ring-inset ring-ok/20"><Cloud size={19} /></span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Synchronisé</div>
              <div className="text-xs text-muted">{email ?? "…"} · vos données sont sur tous vos appareils</div>
            </div>
            <button onClick={() => supabase?.auth.signOut()} className="btn-secondary btn-sm"><LogOut size={14} /> Déconnexion</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-11 shrink-0 rounded-xl bg-warn/10 text-warn ring-1 ring-inset ring-warn/20"><CloudOff size={19} /></span>
            <div className="flex-1 text-sm">
              <div className="font-medium">Mode local</div>
              <div className="text-xs text-muted">Les données restent sur cet appareil. Faites une sauvegarde régulière.</div>
            </div>
          </div>
        )}
      </Card>

      <SignatureCard />

      <AvisCard />

      {!cloudEnabled && (
        <Card title="Code d'accès à l'assistant">
          <Field label="Code" hint="Le même que la variable APP_PASSCODE de l'hébergement, s'il y en a une.">
            <div className="flex gap-2">
              <input className="input min-w-0" type="password" value={code} onChange={(e) => setCode(e.target.value)} />
              <button
                className="btn-primary shrink-0"
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
        <div className="-mx-2 space-y-1">
          <button onClick={importerMandats} className="group w-full flex items-center gap-3 rounded-2xl p-2.5 text-left bg-accent/[0.05] ring-1 ring-inset ring-accent/15 hover:bg-accent/[0.08] transition">
            <span className="grid place-items-center size-11 shrink-0 rounded-xl bg-gradient-to-b from-brand-light to-brand text-white shadow-btn"><Building2 size={19} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Importer mes mandats</span>
              <span className="block text-xs text-muted">Ajoute les biens PATRIM qui ne sont pas encore dans l&apos;appli.</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5" />
          </button>
          <button onClick={exporter} className="group w-full flex items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-surface-2 transition">
            <span className="grid place-items-center size-11 shrink-0 rounded-xl bg-surface-2 text-fg ring-1 ring-inset ring-line/80"><Download size={19} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Sauvegarder</span>
              <span className="block text-xs text-muted">Télécharge une copie de toutes vos données.</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5" />
          </button>
          <label className="group w-full flex items-center gap-3 rounded-2xl p-2.5 text-left hover:bg-surface-2 transition cursor-pointer">
            <span className="grid place-items-center size-11 shrink-0 rounded-xl bg-surface-2 text-fg ring-1 ring-inset ring-line/80"><Upload size={19} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Restaurer</span>
              <span className="block text-xs text-muted">Recharge une sauvegarde, sans créer de doublons.</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5" />
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importer(e.target.files[0])} />
          </label>
        </div>
        {msg && <p className="mt-3 rounded-xl bg-accent/[0.06] px-3 py-2.5 text-sm text-accent flex items-center gap-2"><Database size={15} className="shrink-0" /> {msg}</p>}
        <div className="mt-4 pt-4 border-t border-line/70">
          <div className="eyebrow mb-2.5">Contenu de l&apos;appli</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {KINDS.map((k) => (
              <div key={k} className="min-w-0 rounded-xl bg-surface-2/70 ring-1 ring-inset ring-line/60 px-3 py-2.5">
                <div className="font-serif text-xl font-semibold leading-none tabular-nums">{mounted ? getAll(k).length : "–"}</div>
                <div className="mt-1 text-[11px] text-muted truncate">{NOMS[k] ?? k}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-col items-center gap-2 pt-6 text-xs text-muted">
        <span className="h-[3px] w-6 rounded-full bg-coral" />
        PATRIM Hub · conçu pour l&apos;agence PATRIM, Toulouse
      </div>
    </div>
  );
}
