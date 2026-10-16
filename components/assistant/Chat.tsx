"use client";

import { ArrowUp, Camera, CalendarCheck, Copy, FileImage, Mail, RotateCcw, Share2, SquarePen, TrendingDown, UserSearch, Users, X, Zap } from "lucide-react";
import Image from "next/image";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { ask, fileToBase64Jpeg } from "@/lib/ai";
import { heure } from "@/lib/format";
import { BIEN_DISPONIBLE } from "@/lib/matching";
import { useCollection } from "@/lib/store";
import { copier, partager, useToast } from "./outils";
import { buildContext, systemAssistant } from "./context";
import { Markdown } from "./Markdown";
import { useMoi } from "@/lib/equipe";

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  image?: string; // vignette (data URL) pour l'affichage
  at: string;
  error?: boolean;
}

const KEY = "patrim-hub:chat";
const SMART_KEY = "patrim-hub:chat-smart";
const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function load(): Msg[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Msg[]) : [];
  } catch {
    return [];
  }
}
function persist(list: Msg[]) {
  const trimmed = list.slice(-80);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // stockage plein : on retire les vignettes
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify(
          trimmed.map(({ image, ...m }) => {
            void image;
            return m;
          })
        )
      );
    } catch {}
  }
}

/** Historique envoyé à Claude : rôles alternés, sans les erreurs. */
function history(list: Msg[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of list.filter((x) => !x.error).slice(-20)) {
    const content = (m.image ? "[Photo jointe] " : "") + m.text;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export function Chat() {
  const moi = useMoi();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [img, setImg] = useState<{ mediaType: string; data: string; dataUrl: string; thumb: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [smart, setSmart] = useState(false);
  const { toast, node } = useToast();
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const biens = useCollection("biens").items;
  useCollection("contacts");
  useCollection("rdvs");
  useCollection("estimations");
  useCollection("taches");

  useEffect(() => {
    setMsgs(load());
    try {
      setSmart(localStorage.getItem(SMART_KEY) === "1");
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) persist(msgs);
  }, [msgs, hydrated]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: msgs.length > 1 ? "smooth" : "auto", block: "end" });
  }, [msgs.length, busy]);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [input]);

  const bienPhare = useMemo(() => biens.find(BIEN_DISPONIBLE) ?? biens[0], [biens]);

  async function send(text = input, base: Msg[] = msgs) {
    const t = text.trim();
    if ((!t && !img) || busy) return;
    const userMsg: Msg = { id: newId(), role: "user", text: t || "Analyse cette photo.", image: img?.thumb, at: new Date().toISOString() };
    const prev = base;
    setMsgs([...prev, userMsg]);
    setInput("");
    const image = img;
    setImg(null);
    setBusy(true);
    try {
      const res = await ask({
        system: `${systemAssistant()}\n\n# Données de PATRIM Hub\n${buildContext()}`,
        messages: history(prev),
        prompt: userMsg.text,
        images: image ? [{ mediaType: image.mediaType, data: image.data }] : undefined,
        smart,
        maxTokens: 4000,
      });
      setMsgs((m) => [...m, { id: newId(), role: "assistant", text: res.text || "Je n'ai pas de réponse, pouvez-vous reformuler ?", at: new Date().toISOString() }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: newId(), role: "assistant", text: e instanceof Error ? e.message : "L'assistant n'a pas répondu.", at: new Date().toISOString(), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const idx = msgs.lastIndexOf(lastUser);
    void send(lastUser.text, msgs.slice(0, idx));
  }

  async function attach(f?: File | null) {
    if (!f || !f.type.startsWith("image/")) return;
    try {
      const [full, small] = await Promise.all([fileToBase64Jpeg(f, 1568), fileToBase64Jpeg(f, 360)]);
      setImg({ ...full, thumb: small.dataUrl });
      ta.current?.focus();
    } catch {
      toast("Photo illisible");
    }
  }

  function prefill(t: string) {
    setInput(t);
    setTimeout(() => {
      ta.current?.focus();
      ta.current?.setSelectionRange(t.length, t.length);
    }, 0);
  }

  const reset = () => {
    if (msgs.length && !confirm("Commencer une nouvelle conversation ? L'historique actuel sera effacé.")) return;
    setMsgs([]);
    setInput("");
    setImg(null);
  };

  const suggestions: { icon: ReactNode; title: string; text: string; action: () => void }[] = [
    { icon: <CalendarCheck size={18} />, title: "Prépare ma journée", text: "Rendez-vous, relances, priorités", action: () => send("Prépare ma journée : rendez-vous dans l'ordre, ce que je dois préparer pour chacun, relances à faire et 3 priorités.") },
    {
      icon: <UserSearch size={18} />,
      title: "Quels acquéreurs ?",
      text: bienPhare ? `Pour « ${bienPhare.titre} »` : "Pour un bien du portefeuille",
      action: () => (bienPhare ? send(`Quels acquéreurs de ma base pour le bien « ${bienPhare.titre} » ? Classe-les et propose un message d'approche.`) : prefill("Quels acquéreurs pour le bien ")),
    },
    { icon: <Mail size={18} />, title: "Répondre à un mail", text: "Collez le mail, je rédige", action: () => prefill("Rédige une réponse à ce mail :\n\n") },
    {
      icon: <TrendingDown size={18} />,
      title: "Argumentaire de baisse",
      text: bienPhare ? `Pour « ${bienPhare.titre} »` : "Pour convaincre un vendeur",
      action: () => (bienPhare ? send(`Prépare un argumentaire pour proposer une baisse de prix au vendeur du bien « ${bienPhare.titre} ». Appuie-toi sur les faits disponibles.`) : prefill("Argumentaire pour baisser le prix du bien ")),
    },
    { icon: <Users size={18} />, title: "Relances de la semaine", text: "Qui appeler, qui écrire", action: () => send("Quelles relances dois-je faire cette semaine ? Pour chacune : canal conseillé (en respectant l'accord pour le démarchage téléphonique) et message court.") },
    { icon: <FileImage size={18} />, title: "Analyser une photo", text: "DPE, annonce, document", action: () => file.current?.click() },
  ];

  const h = new Date().getHours();
  const salut = h < 5 || h >= 18 ? "Bonsoir" : "Bonjour";

  return (
    <div className="relative flex min-h-[calc(100dvh-12.5rem)] lg:min-h-[calc(100dvh-5.5rem)] flex-col">
      {node}
      {/* En-tête */}
      <div className="flex items-center gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="h-title">Assistant</h1>
          <p className="mt-0.5 text-xs text-muted line-clamp-2">Connaît vos biens, contacts, agenda et estimations</p>
        </div>
        <button
          onClick={() => {
            const v = !smart;
            setSmart(v);
            try {
              localStorage.setItem(SMART_KEY, v ? "1" : "0");
            } catch {}
            toast(v ? "Mode plus précis activé" : "Mode rapide");
          }}
          className={cx("inline-flex items-center gap-1.5 h-9 rounded-full border px-3 text-xs font-medium transition", smart ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted")}
          title="Réponses plus fines, un peu plus lentes"
          aria-pressed={smart}
        >
          <Zap size={14} className={smart ? "fill-current" : ""} /> Plus précis
        </button>
        <button onClick={reset} className="btn-secondary !h-9 !w-9 !px-0 !rounded-full" aria-label="Nouvelle conversation" title="Nouvelle conversation">
          <SquarePen size={16} />
        </button>
      </div>

      {/* Fil */}
      <div className="flex-1 space-y-4 pb-4">
        {hydrated && !msgs.length && (
          <div className="animate-fade-up pt-4 sm:pt-10">
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <Image src="/emblem.png" alt="" width={64} height={64} className="rounded-2xl shadow-glow" />
                <span className="absolute -right-1 -bottom-1 size-4 rounded-full border-2 border-bg bg-ok" />
              </div>
              <h2 className="mt-4 font-serif text-2xl sm:text-3xl font-semibold">{salut} {moi.prenom}</h2>
              <p className="mt-1 max-w-sm text-sm text-muted">Que puis-je préparer pour vous ? Je m&apos;appuie sur les données de votre espace, à jour à chaque message.</p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-3 max-w-3xl mx-auto">
              {suggestions.map((s, i) => (
                <button
                  key={s.title}
                  onClick={s.action}
                  className="group card p-3.5 text-left transition hover:shadow-glow active:scale-[.99] animate-fade-up"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className="grid place-items-center size-9 rounded-xl bg-accent/10 text-accent transition group-hover:bg-brand group-hover:text-white">{s.icon}</span>
                  <div className="mt-2.5 text-[13.5px] font-semibold leading-tight">{s.title}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted leading-snug line-clamp-2">{s.text}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end animate-fade-up">
              <div className="max-w-[85%] sm:max-w-[70%] space-y-1.5">
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image} alt="Photo jointe" className="ml-auto max-h-56 rounded-2xl border border-line object-cover" />
                )}
                <div className="rounded-[20px] rounded-br-md bg-brand px-4 py-2.5 text-[14.5px] leading-relaxed text-white whitespace-pre-wrap break-words shadow-sm">{m.text}</div>
                <div className="text-right text-[10px] text-muted">{heure(m.at)}</div>
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2.5 animate-fade-up">
              <Image src="/emblem.png" alt="" width={30} height={30} className="mt-0.5 size-[30px] shrink-0 rounded-lg" />
              <div className="min-w-0 max-w-[92%] sm:max-w-[80%]">
                <div className={cx("rounded-[20px] rounded-tl-md border px-4 py-3 shadow-sm", m.error ? "border-danger/30 bg-danger/5 text-danger" : "border-line bg-surface")}>
                  {m.error ? <p className="text-sm">{m.text}</p> : <Markdown text={m.text} />}
                </div>
                <div className="mt-1 flex items-center gap-0.5 text-muted">
                  <span className="mr-1.5 text-[10px]">{heure(m.at)}</span>
                  {m.error ? (
                    i === msgs.length - 1 && (
                      <button onClick={retry} className="btn-ghost btn-sm !h-7 !px-2 text-[11px]">
                        <RotateCcw size={13} /> Réessayer
                      </button>
                    )
                  ) : (
                    <>
                      <button onClick={async () => toast((await copier(m.text)) ? "Réponse copiée" : "Copie impossible")} className="btn-ghost !h-8 !w-8 !px-0 !rounded-lg" aria-label="Copier">
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={async () => {
                          if ((await partager({ text: m.text })) === "copie") toast("Réponse copiée");
                        }}
                        className="btn-ghost !h-8 !w-8 !px-0 !rounded-lg"
                        aria-label="Partager"
                      >
                        <Share2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {busy && (
          <div className="flex gap-2.5 animate-fade-up">
            <Image src="/emblem.png" alt="" width={30} height={30} className="size-[30px] shrink-0 rounded-lg" />
            <div className="rounded-[20px] rounded-tl-md border border-line bg-surface px-4 py-3.5 shadow-sm">
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="size-2 rounded-full bg-accent/70 animate-bounce" style={{ animationDelay: `${d * 140}ms`, animationDuration: "0.9s" }} />
                ))}
                <span className="ml-2 text-xs text-muted">{smart ? "Réflexion approfondie…" : "Rédaction…"}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={end} style={{ scrollMarginBottom: 160 }} />
      </div>

      {/* Saisie */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] lg:bottom-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 pt-3 pb-1 lg:pb-5 bg-gradient-to-t from-bg via-bg/95 to-bg/0">
        <div className="mx-auto max-w-3xl rounded-[24px] border border-line bg-surface shadow-card focus-within:border-accent/50 focus-within:ring-4 focus-within:ring-accent/10 transition">
          {img && (
            <div className="flex items-center gap-2 px-3 pt-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.thumb} alt="Photo jointe" className="h-16 w-16 rounded-xl object-cover border border-line" />
                <button onClick={() => setImg(null)} className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full bg-ink text-white shadow" aria-label="Retirer la photo">
                  <X size={13} />
                </button>
              </div>
              <span className="text-xs text-muted">Photo jointe à votre message</span>
            </div>
          )}
          <div className="flex items-end gap-1.5 p-1.5 pl-2">
            <button onClick={() => file.current?.click()} className="btn-ghost !h-10 !w-10 !px-0 !rounded-full text-muted shrink-0" aria-label="Joindre une photo" title="Joindre une photo (DPE, annonce…)">
              <Camera size={19} />
            </button>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => attach(e.target.files?.[0]).then(() => (e.target.value = ""))} />
            <textarea
              ref={ta}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith("image/"));
                if (f) {
                  e.preventDefault();
                  attach(f);
                }
              }}
              onKeyDown={(e) => {
                const coarse = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
                if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Écrivez votre message…"
              className="flex-1 min-w-0 resize-none bg-transparent py-2.5 text-[15px] leading-snug outline-none placeholder:text-muted/70 max-h-[180px]"
            />
            <button
              onClick={() => send()}
              disabled={busy || (!input.trim() && !img)}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-white shadow-sm transition hover:bg-brand-light active:scale-95 disabled:opacity-35"
              aria-label="Envoyer"
            >
              <ArrowUp size={19} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <p className="mt-1.5 hidden lg:block text-center text-[10.5px] text-muted">Entrée pour envoyer · Maj + Entrée pour aller à la ligne · Rien n&apos;est envoyé à vos clients sans vous</p>
      </div>
    </div>
  );
}
