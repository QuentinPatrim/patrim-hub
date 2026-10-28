"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { Card, Spinner } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { authHeaders } from "@/lib/ai";
import { uid } from "@/lib/store";

/* Réglages : notifications sur ce téléphone (nouveaux leads, briefing du matin).
   L'abonnement de l'appareil est une ligne « push » de hub_docs, réservée au compte. */

const CLE_ID = "patrim-hub:push-id";

const versOctets = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

type Etat = "inconnu" | "impossible" | "ios" | "refuse" | "inactif" | "actif";

export function NotificationsCard() {
  const [etat, setEtat] = useState<Etat>("inconnu");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent) && !(window.matchMedia("(display-mode: standalone)").matches);
        return setEtat(ios ? "ios" : "impossible");
      }
      if (Notification.permission === "denied") return setEtat("refuse");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEtat(sub ? "actif" : "inactif");
    })().catch(() => setEtat("impossible"));
  }, []);

  async function activer() {
    setBusy(true);
    setMsg("");
    try {
      const { cle } = await fetch("/api/push").then((r) => r.json());
      if (!cle) throw new Error("Les notifications ne sont pas encore configurées sur le serveur.");
      if ((await Notification.requestPermission()) !== "granted") {
        setEtat("refuse");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: versOctets(cle) });
      if (!supabase) throw new Error("Connecte-toi d'abord à ton compte.");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Connecte-toi d'abord à ton compte.");
      let id = "";
      try {
        id = localStorage.getItem(CLE_ID) ?? "";
      } catch {}
      if (!id) id = uid();
      const now = new Date().toISOString();
      const { error } = await supabase.from("hub_docs").upsert({ id, kind: "push", user_id: u.user.id, data: { ...sub.toJSON(), appareil: navigator.userAgent.slice(0, 120), createdAt: now }, updated_at: now });
      if (error) throw new Error("L'appareil n'a pas pu être enregistré. Réessaie.");
      try {
        localStorage.setItem(CLE_ID, id);
      } catch {}
      setEtat("actif");
      await tester();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function tester() {
    setMsg("");
    const r = await fetch("/api/push", { method: "POST", headers: await authHeaders() });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Notification d'essai envoyée." : d.error || "L'essai n'a pas abouti.");
  }

  async function couper() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      let id = "";
      try {
        id = localStorage.getItem(CLE_ID) ?? "";
      } catch {}
      if (id && supabase) await supabase.from("hub_docs").delete().eq("id", id);
      setEtat("inactif");
      setMsg("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Notifications sur ce téléphone">
      <p className="text-sm text-muted">Un nouveau lead arrive : ton téléphone sonne avec son nom, et le brouillon t&apos;attend dans « À envoyer ». Le matin, le briefing arrive sans son.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {etat === "actif" ? (
          <>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok"><Check size={16} /> Activées</span>
            <button className="btn-secondary btn-sm" onClick={() => void tester()} disabled={busy}>Tester</button>
            <button className="btn-ghost btn-sm" onClick={couper} disabled={busy}><BellOff size={14} /> Couper</button>
          </>
        ) : etat === "inactif" ? (
          <button className="btn-primary" onClick={activer} disabled={busy}>{busy ? <Spinner /> : <Bell size={16} />} Activer sur ce téléphone</button>
        ) : etat === "ios" ? (
          <p className="text-sm">Sur iPhone, ajoute d&apos;abord le Hub à l&apos;écran d&apos;accueil (bouton Partager, puis « Sur l&apos;écran d&apos;accueil »), ouvre-le depuis l&apos;icône, puis reviens ici.</p>
        ) : etat === "refuse" ? (
          <p className="text-sm">Les notifications sont bloquées pour le Hub. Autorise-les dans les réglages du téléphone (Notifications, puis le navigateur ou PATRIM Hub), puis reviens ici.</p>
        ) : etat === "impossible" ? (
          <p className="text-sm">Ce navigateur ne gère pas les notifications. Ouvre le Hub dans Chrome (Android) ou depuis l&apos;icône de l&apos;écran d&apos;accueil (iPhone).</p>
        ) : null}
      </div>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </Card>
  );
}
