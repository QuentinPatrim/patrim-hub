"use client";

import { useEffect, useState } from "react";
import { Check, Eye, Users } from "lucide-react";
import { Card, Spinner, cx } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useEquipe, useMoi } from "@/lib/equipe";

/* Fiche du bien : qui de l'équipe peut l'ouvrir.
   Le responsable voit déjà tous les biens ; un collègue ne voit
   que les biens qu'on lui partage (avec leurs propriétaires).
   Visible seulement par celui qui a rentré le bien. */
export function PartageBien({ bienId }: { bienId: string }) {
  const moi = useMoi();
  const equipe = useEquipe();
  const [proprietaire, setProprietaire] = useState<string | null>(null);
  const [partages, setPartages] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let vivant = true;
    void (async () => {
      const [{ data: d }, { data: p }] = await Promise.all([
        supabase!.from("hub_docs").select("user_id").eq("id", bienId).maybeSingle(),
        supabase!.from("hub_partages").select("membre_id").eq("doc_id", bienId),
      ]);
      if (!vivant) return;
      setProprietaire((d as { user_id: string } | null)?.user_id ?? null);
      setPartages(new Set(((p ?? []) as { membre_id: string }[]).map((x) => x.membre_id)));
    })();
    return () => {
      vivant = false;
    };
  }, [bienId]);

  if (!supabase || !equipe?.length || !moi.userId || !proprietaire) return null;
  if (proprietaire !== moi.userId) {
    const auteur = equipe.find((m) => m.user_id === proprietaire);
    return auteur ? <p className="px-1 text-xs text-muted">Bien rentré par {`${auteur.prenom} ${auteur.nom}`.trim()}.</p> : null;
  }

  async function basculer(membreId: string) {
    if (!supabase) return;
    setBusy(membreId);
    setErr("");
    const actif = partages.has(membreId);
    const { error } = actif
      ? await supabase.from("hub_partages").delete().eq("doc_id", bienId).eq("membre_id", membreId)
      : await supabase.from("hub_partages").insert({ doc_id: bienId, membre_id: membreId });
    setBusy(null);
    if (error) return setErr("Le partage n'a pas pu être changé. Réessaie dans un instant.");
    const n = new Set(partages);
    if (actif) n.delete(membreId);
    else n.add(membreId);
    setPartages(n);
  }

  return (
    <Card title={<span className="inline-flex items-center gap-2"><Users size={16} className="text-muted" /> Équipe</span>}>
      <div className="-mx-1 space-y-1">
        {equipe.map((m) => {
          const nom = `${m.prenom} ${m.nom}`.trim();
          if (m.role !== "collegue")
            return (
              <div key={m.user_id} className="flex items-center gap-3 rounded-xl px-1 py-2 text-sm">
                <Eye size={16} className="shrink-0 text-muted" />
                <span className="flex-1">{nom} voit ce bien et son propriétaire</span>
              </div>
            );
          const on = partages.has(m.user_id);
          return (
            <button
              key={m.user_id}
              onClick={() => basculer(m.user_id)}
              disabled={busy === m.user_id}
              className="w-full min-h-[44px] flex items-center gap-3 rounded-xl px-1 py-2 text-left text-sm hover:bg-surface-2 transition"
            >
              <span className={cx("grid place-items-center size-6 shrink-0 rounded-md ring-1 ring-inset", on ? "bg-accent text-white ring-accent" : "ring-line")}>
                {busy === m.user_id ? <Spinner className="size-3" /> : on ? <Check size={14} /> : null}
              </span>
              <span className="flex-1">
                <span className="block font-medium">{nom} peut ouvrir ce bien</span>
                <span className="block text-xs text-muted">{on ? "Il voit aussi le propriétaire et peut modifier la fiche." : "Sans ça, il ne le voit pas dans le Hub."}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Tes acquéreurs, prospects, rendez-vous et tâches restent toujours sur ton seul compte.</p>
      {err && <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
    </Card>
  );
}
