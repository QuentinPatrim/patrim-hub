"use client";

/* Retour de visite : questionnaire d'une minute ouvert par le visiteur depuis le SMS du conseiller. */

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Star } from "lucide-react";
import { C } from "@/components/documents/charte";

type Info = { titre: string; date: string; conseiller: string; deja: boolean };
const SUITES = [
  { v: "offre", label: "J'aimerais faire une offre" },
  { v: "seconde_visite", label: "J'aimerais le revoir" },
  { v: "reflexion", label: "Je réfléchis" },
  { v: "pas_interesse", label: "Il ne me correspond pas" },
];
const RESSENTI_DE_NOTE = (n: number) => (n >= 5 ? "enthousiaste" : n === 4 ? "positif" : n === 3 ? "mitige" : "negatif");

export default function RetourVisite() {
  const { id } = useParams<{ id: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [erreur, setErreur] = useState(false);
  const [note, setNote] = useState(0);
  const [suite, setSuite] = useState("");
  const [positifs, setPositifs] = useState("");
  const [negatifs, setNegatifs] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch(`/api/r/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d ? setInfo(d) : setErreur(true)))
      .catch(() => setErreur(true));
  }, [id]);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/r/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note || undefined, ressenti: note ? RESSENTI_DE_NOTE(note) : undefined, suite: suite || undefined, positifs, negatifs, message }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Envoi impossible, réessayez.");
      setOk(true);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const champ = "w-full rounded-xl border bg-white px-3 py-2.5 text-[16px] outline-none";
  const style = { borderColor: C.line, color: C.ink };
  const jour = info ? new Date(info.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" }) : "";

  return (
    <div className="min-h-dvh pb-10" style={{ background: C.paper, color: C.ink, colorScheme: "light" }}>
      <header className="bg-white px-4 py-3" style={{ borderBottom: `3px solid ${C.brand}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="PATRIM" className="mx-auto h-8 w-auto" />
      </header>
      <main className="mx-auto max-w-md px-4 pt-5">
        {!info ? (
          <p className="pt-10 text-center text-sm" style={{ color: C.slate }}>
            {erreur ? "Ce lien n'est plus valable. Merci pour votre visite !" : "Chargement…"}
          </p>
        ) : ok || info.deja ? (
          <div className="rounded-2xl bg-white p-5 text-center" style={{ border: `1px solid ${C.line}` }}>
            <Check size={28} className="mx-auto" style={{ color: "#2f7d4f" }} />
            <p className="mt-2 font-semibold">Merci pour votre retour !</p>
            <p className="mt-1 text-sm" style={{ color: C.slate }}>
              {info.conseiller} en prend connaissance{suite === "offre" || suite === "seconde_visite" ? " et vous recontacte rapidement" : ""}.
            </p>
          </div>
        ) : (
          <form onSubmit={envoyer} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold">Votre avis sur la visite</h1>
              <p className="mt-1 text-sm" style={{ color: C.slate }}>
                {info.titre}, visité {jour}. Une minute suffit, et votre avis est transmis au propriétaire sans votre nom.
              </p>
            </div>

            <section className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${C.line}` }}>
              <div className="text-sm font-semibold">Votre impression générale</div>
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setNote(n)} aria-label={`${n} sur 5`} className="grid size-11 place-items-center rounded-xl" style={{ background: n <= note ? C.brand : C.cream }}>
                    <Star size={20} fill={n <= note ? "#fff" : "none"} color={n <= note ? "#fff" : C.muted} />
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-4" style={{ border: `1px solid ${C.line}` }}>
              <div className="text-sm font-semibold">Et maintenant ?</div>
              <div className="mt-2 grid gap-2">
                {SUITES.map((s) => (
                  <button key={s.v} type="button" onClick={() => setSuite(suite === s.v ? "" : s.v)} className="h-11 rounded-xl border px-3 text-left text-sm font-medium" style={{ borderColor: suite === s.v ? C.brand : C.line, background: suite === s.v ? C.cream : "#fff", color: suite === s.v ? C.brand : C.ink }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl bg-white p-4" style={{ border: `1px solid ${C.line}` }}>
              <label className="block text-sm font-semibold">
                Ce que vous avez aimé
                <textarea className={`${champ} mt-1.5 h-20 font-normal`} style={style} value={positifs} onChange={(e) => setPositifs(e.target.value)} />
              </label>
              <label className="block text-sm font-semibold">
                Ce qui vous a retenu
                <textarea className={`${champ} mt-1.5 h-20 font-normal`} style={style} value={negatifs} onChange={(e) => setNegatifs(e.target.value)} />
              </label>
              <label className="block text-sm font-semibold">
                Un message pour {info.conseiller} (facultatif)
                <textarea className={`${champ} mt-1.5 h-20 font-normal`} style={style} value={message} onChange={(e) => setMessage(e.target.value)} />
              </label>
            </section>

            {err && <p className="text-sm" style={{ color: "#c0392b" }}>{err}</p>}
            <button type="submit" disabled={busy} className="h-12 w-full rounded-xl text-sm font-semibold text-white disabled:opacity-60" style={{ background: C.brand }}>
              {busy ? "Envoi…" : "Envoyer mon avis"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
