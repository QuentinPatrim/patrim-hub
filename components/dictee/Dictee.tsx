"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Mic, Sparkles, Square } from "lucide-react";
import { Sheet, Spinner, cx } from "@/components/ui";
import { analyser, appliquer, decrire, type Action } from "./actions";

interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
}

/** Bouton micro de l'en-tête : on parle, le Hub propose les actions, on valide.
    La feuille passe par un portail : l'en-tête flouté piégerait sa position fixe. */
export function Dictee({ className, label }: { className?: string; label?: boolean }) {
  const [open, setOpen] = useState(false);
  const [texte, setTexte] = useState("");
  const [provisoire, setProvisoire] = useState("");
  const [ecoute, setEcoute] = useState(false);
  const [vocal, setVocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [actions, setActions] = useState<Action[] | null>(null);
  const [gardees, setGardees] = useState<Set<number>>(new Set());
  const [faites, setFaites] = useState<{ titre: string; lien: string }[]>([]);
  const rec = useRef<SpeechRec | null>(null);

  useEffect(() => {
    const W = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    setVocal(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  function ouvrir() {
    setOpen(true);
    setTexte("");
    setActions(null);
    setFaites([]);
    setErr("");
    if (vocal) setTimeout(demarrer, 250);
  }

  function fermer() {
    rec.current?.stop();
    setOpen(false);
  }

  function demarrer() {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = "";
      let encours = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript;
        else encours += e.results[i][0].transcript;
      }
      if (fin) setTexte((x) => (x ? x.trimEnd() + " " : "") + fin.trim());
      setProvisoire(encours);
    };
    r.onend = () => {
      setEcoute(false);
      setProvisoire("");
    };
    r.onerror = () => setEcoute(false);
    rec.current = r;
    try {
      r.start();
      setEcoute(true);
    } catch {
      setEcoute(false);
    }
  }

  async function comprendre() {
    rec.current?.stop();
    if (!texte.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const a = await analyser(texte.trim());
      setActions(a);
      setGardees(new Set(a.map((_, i) => i)));
      if (!a.length) setErr("Je n'ai trouvé aucune action dans cette note.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function valider() {
    if (!actions) return;
    setFaites(actions.filter((_, i) => gardees.has(i)).map((a) => ({ titre: decrire(a).titre, lien: appliquer(a) })));
    setActions(null);
    setTexte("");
  }

  return (
    <>
      <button onClick={ouvrir} className={className} aria-label="Dicter une note">
        <Mic size={label ? 17 : 19} />
        {label && " Dicter"}
      </button>
      {open && createPortal(
      <Sheet
        open={open}
        onClose={fermer}
        title="Dicter"
        footer={
          actions ? (
            <>
              <button className="btn-ghost" onClick={() => setActions(null)}>
                Corriger
              </button>
              <button className="btn-primary" disabled={!gardees.size} onClick={valider}>
                <Check size={16} /> Enregistrer {gardees.size}
              </button>
            </>
          ) : faites.length ? (
            <button className="btn-primary" onClick={fermer}>
              Fermer
            </button>
          ) : (
            <button className="btn-primary" disabled={busy || !texte.trim()} onClick={comprendre}>
              {busy ? <Spinner /> : <Sparkles size={16} />} Comprendre
            </button>
          )
        }
      >
        {faites.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-ok">C&apos;est enregistré.</p>
            <ul className="space-y-1.5">
              {faites.map((f, i) => (
                <li key={i}>
                  <Link href={f.lien} onClick={fermer} className="flex items-center gap-2 rounded-xl border border-line p-2.5 text-sm hover:border-accent/40">
                    <Check size={15} className="shrink-0 text-ok" /> {f.titre}
                  </Link>
                </li>
              ))}
            </ul>
            <button className="btn-secondary mt-2" onClick={ouvrir}>
              <Mic size={16} /> Nouvelle note
            </button>
          </div>
        ) : actions ? (
          <ul className="space-y-2">
            {actions.map((a, i) => {
              const d = decrire(a);
              const on = gardees.has(i);
              return (
                <li key={i}>
                  <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", on ? "border-accent/40 bg-accent/5" : "border-line")}>
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0"
                      checked={on}
                      onChange={() =>
                        setGardees((g) => {
                          const n = new Set(g);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          return n;
                        })
                      }
                    />
                    <div className="min-w-0 text-sm">
                      <div className="font-medium first-letter:uppercase">{d.titre}</div>
                      {d.detail && <div className="mt-0.5 break-words text-muted">{d.detail}</div>}
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Parle comme à un assistant : « Rappeler M. Dupont jeudi pour le T3 des Carmes », « nouveau prospect Mme Martin, 06…, cherche un T3 à Saint-Cyprien, 250 000 € », « visite samedi 10h au Gramond avec les Lefèvre ». Je te propose les actions, tu valides.
            </p>
            <div className="relative">
              <textarea className="input min-h-[140px] w-full py-2.5" placeholder={vocal ? "J'écoute…" : "Écris ou utilise le micro du clavier"} value={texte + (provisoire ? (texte ? " " : "") + provisoire : "")} onChange={(e) => setTexte(e.target.value)} />
            </div>
            {vocal && (
              <button className={cx("btn-secondary w-full", ecoute && "!border-danger/40 !text-danger")} onClick={() => (ecoute ? rec.current?.stop() : demarrer())}>
                {ecoute ? (
                  <>
                    <Square size={15} /> Arrêter l&apos;écoute <span className="ml-1 size-2 animate-pulse rounded-full bg-danger" />
                  </>
                ) : (
                  <>
                    <Mic size={16} /> Reprendre la dictée
                  </>
                )}
              </button>
            )}
            {!vocal && <p className="text-xs text-muted">Sur ce téléphone, appuie sur le micro du clavier pour dicter.</p>}
          </div>
        )}
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      </Sheet>,
        document.body,
      )}
    </>
  );
}
