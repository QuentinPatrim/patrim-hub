"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Mail, RefreshCw } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { cloudEnabled } from "@/lib/supabase";
import { connecterGoogle, deconnecterGoogle, etatGoogle, synchroGoogle, type EtatGoogle } from "@/lib/googleClient";

/* Réglages : « Connecter mon compte Google ». Chaque membre de l'équipe relie son propre Gmail
   et son propre Google Agenda : brouillons dans son Gmail, ses leads et son agenda dans son Hub. */

const MESSAGES: Record<string, string> = {
  ok: "C'est connecté. Ton agenda et tes leads arrivent dans le Hub.",
  refus: "Connexion annulée : rien n'a été autorisé.",
  erreur: "La connexion n'a pas abouti. Réessaie, ou préviens Quentin si ça recommence.",
};

export function GoogleCard() {
  const [e, setE] = useState<EtatGoogle | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const retour = new URLSearchParams(window.location.search).get("google");
    if (retour && MESSAGES[retour]) setNote(MESSAGES[retour]);
    etatGoogle()
      .then(async (x) => {
        setE(x);
        if (retour === "ok" && x.connecte) {
          const b = await synchroGoogle(true).catch(() => null);
          if (b) setNote(`C'est connecté. ${b.rdvs ?? 0} rendez-vous et ${b.leads ?? 0} mails de portails relus.`);
        }
      })
      .catch(() => setE({ configure: false, connecte: false }));
  }, []);

  if (!cloudEnabled) return null;

  const agir = async (f: () => Promise<unknown>, apres?: string) => {
    setBusy(true);
    setNote("");
    try {
      await f();
      if (apres) setNote(apres);
      setE(await etatGoogle());
    } catch (x) {
      setNote(x instanceof Error ? x.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div id="google">
      <Card title="Gmail et Google Agenda">
        <p className="text-sm text-muted">
          Relie ton compte Google @patrim.fr : les mails préparés dans le Hub (avis de valeur…) arrivent en brouillon dans ton Gmail, tes rendez-vous passent entre ton Google Agenda et le Hub, et tes leads SeLoger ou Bien&apos;ici arrivent dans tes contacts. Rien n&apos;est jamais envoyé sans toi.
        </p>
        {!e ? (
          <div className="mt-3">
            <Spinner />
          </div>
        ) : !e.configure ? (
          <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">Bientôt disponible : la connexion doit d&apos;abord être activée par Quentin.</p>
        ) : e.connecte ? (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              <Check size={16} /> Connecté{e.email ? ` : ${e.email}` : ""}
              <span className="ml-auto inline-flex gap-1.5 text-emerald-700">
                <Mail size={15} />
                <CalendarDays size={15} />
              </span>
            </div>
            {e.derniereSynchro && <p className="text-xs text-muted">Dernière synchronisation : {new Date(e.derniereSynchro).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}. Elle se fait toute seule quand le Hub est ouvert, et chaque nuit.</p>}
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary btn-sm"
                disabled={busy}
                onClick={() =>
                  agir(async () => {
                    const b = await synchroGoogle(true);
                    if (b) setTimeout(() => setNote(`À jour : ${b.rdvs ?? 0} rendez-vous relus, ${b.contactsCrees ?? 0} nouveau(x) contact(s), ${b.evenementsCrees ?? 0} rendez-vous ajouté(s) à Google Agenda.`), 0);
                  })
                }
              >
                {busy ? <Spinner /> : <RefreshCw size={14} />} Synchroniser maintenant
              </button>
              <button className="btn-ghost btn-sm text-muted" disabled={busy} onClick={() => agir(deconnecterGoogle, "Déconnecté : le Hub n'a plus accès à ton Gmail ni à ton agenda.")}>
                Déconnecter
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-primary mt-3 !h-11" disabled={busy} onClick={() => agir(connecterGoogle)}>
            {busy ? <Spinner /> : <Mail size={16} />} Connecter mon compte Google
          </button>
        )}
        {note && <p className="mt-2 text-sm">{note}</p>}
      </Card>
    </div>
  );
}
