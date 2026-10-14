"use client";

import { AlertTriangle, BookmarkPlus, Check, Download, Film, ImageOff, Pause, Play, Share2, Sparkles, Square } from "lucide-react";
import { titrePublic } from "@/lib/titrePublic";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, Field, Spinner } from "@/components/ui";
import { ask } from "@/lib/ai";
import { eur } from "@/lib/format";
import type { Bien } from "@/lib/types";
import { AutoTextarea, Segmented, useToast } from "./bits";
import { ensureFonts, loadBrand, loadImage } from "./canvas";
import { buildPlan, canRecord, drawReel, pickMime, play, preparePhoto, RH, RW, STYLES, type ReelTexts, type StyleVideo } from "./reel";
import { bienLigne, enregistrerContenu, errMsg, faitsPublics, lieuPublic, partagerFichiers, slug, telecharger } from "./shared";

function textesDuBien(b: Bien): ReelTexts {
  return {
    accroche: b.statut === "vendu" ? "VENDU" : b.statut === "sous_offre" ? "SOUS OFFRE" : "NOUVEAUTÉ",
    titre: titrePublic(b),
    lieu: lieuPublic(b),
    prix: b.prix ? eur(b.prix) : "",
    chiffres: [bienLigne(b).split(" · ").slice(0, 2).join(" · "), b.exterieur].filter(Boolean).join(" · "),
    points: (b.pointsForts ?? []).slice(0, 3),
    cta: "Réservez votre visite",
    dpe: b.dpe,
  };
}

type Img = HTMLImageElement | HTMLCanvasElement;

export function Video({ bien }: { bien: Bien }) {
  const [style, setStyle] = useState<StyleVideo>("elegant");
  const [duree, setDuree] = useState(20);
  const [texts, setTexts] = useState<ReelTexts>(() => textesDuBien(bien));
  const [photos, setPhotos] = useState<(Img | null)[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [brand, setBrand] = useState<Awaited<ReturnType<typeof loadBrand>> | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"idle" | "preview" | "record">("idle");
  const [progress, setProgress] = useState(0);
  const [scrub, setScrub] = useState(1.6);
  const [result, setResult] = useState<{ url: string; blob: Blob; ext: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const { toast, node } = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const abort = useRef<AbortController | null>(null);
  const supported = useMemo(() => (typeof window === "undefined" ? true : canRecord()), []);
  const format = useMemo(() => (typeof window === "undefined" ? null : pickMime()), []);

  useEffect(() => {
    setTexts(textesDuBien(bien));
    setResult(null);
    let alive = true;
    setReady(false);
    Promise.all([ensureFonts(), loadBrand(), Promise.all((bien.photos ?? []).map((s) => loadImage(s)))]).then(([, b, list]) => {
      if (!alive) return;
      const prepared = list.map((i) => (i ? preparePhoto(i) : null));
      setBrand(b);
      setPhotos(prepared);
      setSelected(prepared.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).slice(0, 8));
      setReady(true);
    });
    return () => {
      alive = false;
      abort.current?.abort();
    };
  }, [bien.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useMemo(
    () =>
      buildPlan({
        duration: duree,
        style,
        texts,
        photos: selected.map((i) => photos[i]).filter(Boolean) as Img[],
        emblem: brand?.emblem ?? null,
        arcades: brand?.arcades ?? null,
      }),
    [duree, style, texts, selected, photos, brand]
  );

  // image fixe quand rien ne joue
  useEffect(() => {
    if (!ready || mode !== "idle" || !canvas.current) return;
    const c = canvas.current;
    c.width = RW;
    c.height = RH;
    const ctx = c.getContext("2d");
    if (ctx) drawReel(ctx, plan, Math.min(scrub, plan.duration));
  }, [plan, ready, mode, scrub]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  async function lancer(record: boolean) {
    if (!canvas.current) return;
    setErr(null);
    if (record) setResult(null);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setMode(record ? "record" : "preview");
    setProgress(0);
    let lock: { release: () => Promise<void> } | null = null;
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      lock = (await nav.wakeLock?.request("screen").catch(() => null)) ?? null;
    } catch {}
    try {
      const out = await play(canvas.current, plan, { record, onProgress: setProgress, signal: ctrl.signal });
      if (out) {
        setResult({ url: URL.createObjectURL(out.blob), blob: out.blob, ext: out.ext });
        toast("Vidéo prête");
      }
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      lock?.release().catch(() => {});
      setMode("idle");
      abort.current = null;
    }
  }

  async function proposer() {
    setAiBusy(true);
    setErr(null);
    try {
      const res = await ask<Partial<ReelTexts>>({
        json: true,
        system: "Tu écris les textes à l'écran d'un reel immobilier vertical PATRIM. Textes très courts, lisibles en 2 secondes, sans emoji. Uniquement des faits fournis ; sinon laisse le champ vide.",
        prompt: `Fiche du bien :\n${faitsPublics(bien)}\n\nRéponds en JSON : { "accroche": "2 mots max en majuscules (ex. NOUVEAUTÉ, EXCLUSIVITÉ)", "titre": "≤ 40 caractères", "chiffres": "≤ 36 caractères, ex. T3 · 68 m² · Balcon", "points": ["3 points forts de ≤ 30 caractères chacun"], "cta": "appel à l'action ≤ 28 caractères" }`,
      });
      const j = res.json;
      if (!j) throw new Error("Réponse illisible, réessayez.");
      setTexts((t) => ({
        ...t,
        accroche: j.accroche || t.accroche,
        titre: j.titre || t.titre,
        chiffres: j.chiffres || t.chiffres,
        points: Array.isArray(j.points) && j.points.length ? j.points.slice(0, 5) : t.points,
        cta: j.cta || t.cta,
      }));
      toast("Textes proposés");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setAiBusy(false);
    }
  }

  const fileName = `patrim-reel-${slug(bien.titre || "bien")}.${result?.ext ?? "webm"}`;
  const busy = mode !== "idle";
  const set = <K extends keyof ReelTexts>(k: K, v: ReelTexts[K]) => setTexts((t) => ({ ...t, [k]: v }));
  const failed = photos.filter((p) => !p).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-start">
      {node}
      {/* Aperçu */}
      <div className="lg:order-2 lg:sticky lg:top-6">
        <div className="card p-3 sm:p-4">
          <div className="relative mx-auto max-w-[280px] sm:max-w-[320px]">
            <div className="relative overflow-hidden rounded-[22px] bg-ink shadow-[0_30px_70px_-30px_rgba(13,20,32,.7)] ring-[6px] ring-ink" style={{ aspectRatio: "9 / 16" }}>
              <canvas ref={canvas} width={RW} height={RH} className="absolute inset-0 size-full" />
              {result && mode === "idle" && <video src={result.url} controls playsInline loop autoPlay muted className="absolute inset-0 size-full object-cover bg-ink" />}
              {!ready && (
                <div className="absolute inset-0 grid place-items-center text-white/80">
                  <Spinner />
                </div>
              )}
              {mode === "record" && (
                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 h-7 text-[11px] font-semibold text-white">
                  <span className="size-2 rounded-full bg-coral animate-pulse" /> Enregistrement
                </div>
              )}
            </div>
          </div>

          {busy ? (
            <div className="mt-4">
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-brand to-coral transition-[width] duration-150" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted tabular-nums">
                <span>{mode === "record" ? "Création en cours, gardez l'écran allumé" : "Aperçu"}</span>
                <span>
                  {Math.floor(progress * duree)} / {duree} s
                </span>
              </div>
              <button className="btn-secondary w-full mt-3" onClick={() => abort.current?.abort()}>
                <Square size={14} /> Arrêter
              </button>
            </div>
          ) : (
            <>
              {!result && ready && (
                <div className="mt-3 px-1">
                  <input
                    type="range"
                    min={0}
                    max={plan.duration}
                    step={0.1}
                    value={Math.min(scrub, plan.duration)}
                    onChange={(e) => setScrub(Number(e.target.value))}
                    className="w-full accent-[#6c191e]"
                    aria-label="Parcourir la vidéo"
                  />
                  <div className="flex justify-between text-[11px] text-muted tabular-nums">
                    <span>{scrub.toFixed(1)} s</span>
                    <span>{plan.scenes.length} plans · {duree} s</span>
                  </div>
                </div>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={() => (result ? setResult(null) : lancer(false))} disabled={!ready}>
                  {result ? <Pause size={16} /> : <Play size={16} />} {result ? "Modifier" : "Aperçu"}
                </button>
                <button className="btn-primary" onClick={() => lancer(true)} disabled={!ready || !supported}>
                  <Film size={16} /> {result ? "Recréer" : "Créer la vidéo"}
                </button>
              </div>
              {result && (
                <div className="mt-2 grid grid-cols-3 gap-2 animate-fade-up">
                  <button className="btn-secondary btn-sm !h-10" onClick={() => telecharger(result.blob, fileName)}>
                    <Download size={15} /> .{result.ext}
                  </button>
                  <button
                    className="btn-secondary btn-sm !h-10"
                    onClick={async () => {
                      const ok = await partagerFichiers([new File([result.blob], fileName, { type: result.blob.type })], bien.titre);
                      if (!ok) {
                        telecharger(result.blob, fileName);
                        toast("Partage indisponible : vidéo téléchargée");
                      }
                    }}
                  >
                    <Share2 size={15} /> Partager
                  </button>
                  <button
                    className="btn-secondary btn-sm !h-10"
                    onClick={() => {
                      enregistrerContenu({
                        bienId: bien.id,
                        canal: "instagram_reel",
                        titre: `Reel · ${texts.titre}`,
                        texte: [texts.accroche, texts.titre, texts.lieu, texts.prix && `${texts.prix} honoraires inclus`, texts.chiffres, ...texts.points, texts.cta].filter(Boolean).join("\n"),
                        statut: "pret",
                      });
                      toast("Ajouté au calendrier");
                    }}
                  >
                    <BookmarkPlus size={15} /> Planifier
                  </button>
                </div>
              )}
            </>
          )}
          {!supported ? (
            <p className="mt-3 flex gap-2 text-xs text-warn">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" /> Ce navigateur ne permet pas d&apos;enregistrer la vidéo. L&apos;aperçu fonctionne ; pour créer le fichier, utilisez Chrome ou Safari à jour.
            </p>
          ) : (
            <p className="mt-3 text-center text-[11px] text-muted">
              1080 × 1920 · 30 images/s · format {format?.ext === "mp4" ? "MP4" : "WebM"}
              {format?.ext === "webm" && " (Instagram l'accepte depuis l'ordinateur ; sinon convertissez en MP4)"}
            </p>
          )}
        </div>
        {err && <div className="mt-3 card card-pad text-sm text-danger">{err}</div>}
      </div>

      {/* Réglages */}
      <fieldset disabled={busy} className="lg:order-1 space-y-4 min-w-0">
        <div className="card card-pad">
          <div className="label">Style</div>
          <div className="grid grid-cols-3 gap-2">
            {STYLES.map((s) => (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                className={cx("rounded-2xl border p-3 text-left transition", style === s.value ? "border-brand bg-brand text-white shadow-glow" : "border-line hover:bg-surface-2")}
              >
                <div className={cx("text-[15px] font-semibold", s.value === "elegant" && "font-serif", s.value === "dynamique" && "uppercase tracking-wide text-[13px]")}>{s.label}</div>
                <div className={cx("mt-1 text-[11px] leading-snug", style === s.value ? "text-white/70" : "text-muted")}>{s.hint}</div>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <div className="label">Durée</div>
            <Segmented value={String(duree)} onChange={(v) => setDuree(Number(v))} items={[15, 20, 25, 30].map((d) => ({ value: String(d), label: `${d} s` }))} />
          </div>
        </div>

        <div className="card card-pad">
          <div className="flex items-center justify-between">
            <div className="label !mb-0">Photos ({selected.length})</div>
            <span className="text-[11px] text-muted">Touchez pour inclure / retirer</span>
          </div>
          {photos.length ? (
            <div className="mt-2.5 grid grid-cols-4 sm:grid-cols-5 gap-2">
              {(bien.photos ?? []).map((src, i) => {
                const on = selected.includes(i);
                const ko = !photos[i];
                return (
                  <button
                    key={i}
                    disabled={ko}
                    onClick={() => setSelected((s) => (on ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)))}
                    className={cx("relative aspect-square overflow-hidden rounded-xl border-2 transition", on ? "border-accent" : "border-transparent opacity-50")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="size-full object-cover bg-surface-2" />
                    {on && (
                      <span className="absolute right-1 top-1 grid place-items-center size-5 rounded-full bg-accent text-white text-[10px] font-bold">
                        {selected.indexOf(i) + 1}
                      </span>
                    )}
                    {ko && (
                      <span className="absolute inset-0 grid place-items-center bg-ink/60 text-white">
                        <ImageOff size={16} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucune photo sur la fiche : la vidéo utilisera des fonds aux couleurs PATRIM.</p>
          )}
          {failed > 0 && <p className="mt-2 text-[11px] text-warn">{failed} photo(s) inutilisable(s) (lien protégé) : ajoutez-les directement sur la fiche du bien.</p>}
        </div>

        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="h-section">Textes à l&apos;écran</div>
            <button className="btn-secondary btn-sm" onClick={proposer} disabled={aiBusy}>
              {aiBusy ? <Spinner /> : <Sparkles size={14} />} Proposer
            </button>
          </div>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
            <Field label="Accroche">
              <input className="input" value={texts.accroche} onChange={(e) => set("accroche", e.target.value)} />
            </Field>
            <Field label="Titre">
              <input className="input" value={texts.titre} onChange={(e) => set("titre", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lieu">
              <input className="input" value={texts.lieu} onChange={(e) => set("lieu", e.target.value)} />
            </Field>
            <Field label="Prix (honoraires inclus)">
              <input className="input" value={texts.prix} onChange={(e) => set("prix", e.target.value)} />
            </Field>
          </div>
          <Field label="Chiffres clés">
            <input className="input" value={texts.chiffres} onChange={(e) => set("chiffres", e.target.value)} />
          </Field>
          <Field label="Points forts (un par ligne)">
            <AutoTextarea minRows={3} value={texts.points.join("\n")} onChange={(e) => set("points", e.target.value.split("\n").slice(0, 5))} />
          </Field>
          <Field label="Appel à l'action (écran de fin)">
            <input className="input" value={texts.cta} onChange={(e) => set("cta", e.target.value)} />
          </Field>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>Classe DPE affichée avec le prix :</span>
            <select className="input !h-8 !w-auto text-xs" value={texts.dpe ?? ""} onChange={(e) => set("dpe", e.target.value || undefined)}>
              <option value="">Aucune</option>
              {"ABCDEFG".split("").map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            {texts.dpe && <Check size={14} className="text-ok" />}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
