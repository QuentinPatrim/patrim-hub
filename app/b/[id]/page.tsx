"use client";

/* Page web d'un bien, ouverte depuis le QR code de la vitrine ou un lien : la fiche,
   puis « Réserver une visite » sur les créneaux libres du conseiller, ou « Demander une
   visite » s'il n'en propose pas. Publique, sans compte. */

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck, Check, Phone } from "lucide-react";
import { C } from "@/components/documents/charte";
import { FICHE_PRINT_CSS, FicheDocument } from "@/components/fiche/FicheDocument";
import type { FichePublique } from "@/components/fiche/fiche";

export default function PageBien() {
  const { id } = useParams<{ id: string }>();
  const [f, setF] = useState<FichePublique | null>(null);
  const [erreur, setErreur] = useState(false);
  const [creneaux, setCreneaux] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/b/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => Array.isArray(d?.creneaux) && setCreneaux(d.creneaux))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    let annule = false;
    fetch(`/api/partage/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (annule) return;
        if (d?.fiche) setF(d.fiche);
        else setErreur(true);
      })
      .catch(() => !annule && setErreur(true));
    return () => {
      annule = true;
    };
  }, [id]);

  useEffect(() => {
    if (f) document.title = `${f.titre} · PATRIM Immobilier Toulouse`;
  }, [f]);

  const tel = (f?.conseiller?.tel || "05 61 99 08 08").replace(/[^\d+]/g, "");

  return (
    <div className="fiche-root min-h-dvh pb-24 sm:py-8" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <style>{FICHE_PRINT_CSS}</style>
      {f ? (
        <>
          <FicheDocument f={f} />
          <Demande id={id} f={f} creneaux={creneaux} setCreneaux={setCreneaux} />
          <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t bg-white/95 px-4 py-3 backdrop-blur" style={{ borderColor: C.line, paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto flex max-w-[210mm] gap-2">
              <a href={`tel:${tel}`} className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold" style={{ borderColor: C.line, color: C.brand }}>
                <Phone size={17} /> Appeler
              </a>
              {f.disponible && (
                <a href="#visite" className="inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white" style={{ background: C.brand }}>
                  <CalendarCheck size={17} /> {creneaux.length ? "Réserver une visite" : "Demander une visite"}
                </a>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="grid min-h-dvh place-items-center p-6 text-center">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="PATRIM" className="mx-auto h-10 w-auto" />
            <p className="mt-6 text-sm" style={{ color: C.slate }}>
              {erreur ? "Ce bien n'est plus en ligne. Retrouvez nos annonces sur patrim.fr ou appelez l'agence au 05 61 99 08 08." : "Chargement…"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const jourDe = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
const heureDe = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":", "h");

function Demande({ id, f, creneaux, setCreneaux }: { id: string; f: FichePublique; creneaux: string[]; setCreneaux: (c: string[]) => void }) {
  const [v, setV] = useState({ prenom: "", nom: "", tel: "", email: "", message: "", rappel: false, site: "" });
  const [choix, setChoix] = useState("");
  const [autre, setAutre] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState<false | { quand?: string }>(false);
  if (!f.disponible) return null;
  const libre = creneaux.length > 0 && !autre;
  const parJour = creneaux.reduce<Record<string, string[]>>((m, c) => ((m[jourDe(c)] ??= []).push(c), m), {});

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (libre && !choix) throw new Error("Choisissez un créneau.");
      const r = await fetch(`/api/b/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...v, creneau: libre ? choix : undefined }) });
      const d = await r.json().catch(() => ({}));
      if (d.pris) {
        setCreneaux(creneaux.filter((c) => c !== choix));
        setChoix("");
      }
      if (!r.ok) throw new Error(d.error || "Envoi impossible, appelez l'agence au 05 61 99 08 08.");
      setOk({ quand: d.quand });
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const champ = "h-12 w-full rounded-xl border bg-white px-3 text-[16px] outline-none";
  const style = { borderColor: C.line, color: C.ink };
  return (
    <section id="visite" className="no-print mx-auto mt-6 max-w-[210mm] scroll-mt-4 px-4 sm:px-0">
      <div className="rounded-2xl bg-white p-5" style={{ border: `1px solid ${C.line}` }}>
        <h2 className="text-lg font-bold" style={{ color: C.brand }}>
          {libre ? "Réserver une visite" : "Demander une visite"}
        </h2>
        {ok ? (
          <p className="mt-3 flex items-start gap-2 text-sm">
            <Check size={18} className="shrink-0" style={{ color: "#2f7d4f" }} />
            {ok.quand ? (
              <span>
                Votre visite est réservée le {ok.quand}. {f.conseiller?.nom ?? "Votre conseiller"} vous la confirme rapidement avec l&apos;adresse exacte du rendez-vous.
              </span>
            ) : (
              <span>Merci, votre demande est bien arrivée. {f.conseiller?.nom ?? "Votre conseiller"} revient vers vous rapidement pour convenir d&apos;un créneau.</span>
            )}
          </p>
        ) : (
          <form onSubmit={envoyer} className="mt-4 space-y-3">
            {libre && (
              <div className="space-y-3">
                {Object.entries(parJour).map(([jour, liste]) => (
                  <div key={jour}>
                    <div className="text-sm font-semibold first-letter:uppercase">{jour}</div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {liste.map((c) => (
                        <button key={c} type="button" onClick={() => setChoix(c)} className="h-11 min-w-[76px] rounded-xl border px-3 text-sm font-semibold" style={{ borderColor: choix === c ? C.brand : C.line, background: choix === c ? C.brand : "#fff", color: choix === c ? "#fff" : C.ink }}>
                          {heureDe(c)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" className="text-sm underline" style={{ color: C.slate }} onClick={() => setAutre(true)}>
                  Aucun créneau ne vous convient ? Proposez vos disponibilités
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input className={champ} style={style} placeholder="Prénom" autoComplete="given-name" value={v.prenom} onChange={(e) => setV({ ...v, prenom: e.target.value })} />
              <input className={champ} style={style} placeholder="Nom" autoComplete="family-name" required value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} />
            </div>
            <input className={champ} style={style} placeholder="Téléphone" type="tel" inputMode="tel" autoComplete="tel" value={v.tel} onChange={(e) => setV({ ...v, tel: e.target.value })} />
            <input className={champ} style={style} placeholder="E-mail" type="email" autoComplete="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
            <textarea className={`${champ} h-24 py-2`} style={style} placeholder={libre ? "Votre projet, une question (facultatif)" : "Vos disponibilités, votre projet (facultatif)"} value={v.message} onChange={(e) => setV({ ...v, message: e.target.value })} />
            <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden value={v.site} onChange={(e) => setV({ ...v, site: e.target.value })} />
            <label className="flex items-start gap-2.5 text-sm" style={{ color: C.slate }}>
              <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={v.rappel} onChange={(e) => setV({ ...v, rappel: e.target.checked })} />
              J&apos;accepte d&apos;être rappelé par téléphone par l&apos;agence PATRIM au sujet de ce bien et de ma recherche.
            </label>
            {err && <p className="text-sm" style={{ color: "#c0392b" }}>{err}</p>}
            <button type="submit" disabled={busy} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: C.brand }}>
              <CalendarCheck size={17} /> {busy ? "Envoi…" : libre ? (choix ? `Réserver ${jourDe(choix).split(" ").slice(0, 2).join(" ")} à ${heureDe(choix)}` : "Choisissez un créneau") : "Envoyer ma demande"}
            </button>
            <p className="text-xs" style={{ color: C.muted }}>
              Vos coordonnées servent uniquement à répondre à votre demande et ne sont jamais transmises à des tiers. Vous pouvez demander leur suppression à tout moment auprès de l&apos;agence.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
