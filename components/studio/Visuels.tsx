"use client";

import { ChevronLeft, ChevronRight, Download, ImagePlus, ImageOff, Plus, Share2, Trash2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, Field, Spinner } from "@/components/ui";
import { fileToBase64Jpeg } from "@/lib/ai";
import type { Bien } from "@/lib/types";
import { AutoTextarea, Segmented, useToast } from "./bits";
import { canvasToBlob, ensureFonts, loadBrand, loadImage, type Palette } from "./canvas";
import { AGENCE, errMsg, partagerFichiers, slug, telecharger } from "./shared";
import { carouselSlides, dataDuBien, FORMATS, MODELES, renderVisuel, type Format, type Modele, type VisuelData } from "./visuals";

const CTA_VISITE = "Sur rendez-vous · " + AGENCE.tel;
const CTA_VENDU = "Vous vendez ? Estimation offerte au " + AGENCE.tel;

type Brand = { emblem: HTMLImageElement | null; arcades: HTMLImageElement | null };

const PALETTE_ITEMS: { value: Palette; label: string; swatch: string }[] = [
  { value: "bordeaux", label: "Bordeaux", swatch: "#6c191e" },
  { value: "encre", label: "Encre", swatch: "#0d1420" },
  { value: "creme", label: "Crème", swatch: "#f6f1e7" },
];

export function Visuels({ bien }: { bien: Bien }) {
  const [modele, setModele] = useState<Modele>(bien.statut === "vendu" ? "vendu" : bien.statut === "sous_offre" || bien.statut === "compromis" ? "sous_offre" : "nouveaute");
  const [format, setFormat] = useState<Format>("post");
  const [palette, setPalette] = useState<Palette>("bordeaux");
  const [data, setData] = useState<VisuelData>(() => dataDuBien(bien));
  const [uploads, setUploads] = useState<string[]>([]);
  const [main, setMain] = useState(0);
  const [slide, setSlide] = useState(0);
  const [imgs, setImgs] = useState<(HTMLImageElement | null)[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, node } = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sources = useMemo(() => [...(bien.photos ?? []), ...uploads], [bien.photos, uploads]);

  // réinitialise quand on change de bien
  useEffect(() => {
    setData(dataDuBien(bien));
    setUploads([]);
    setMain(0);
    setSlide(0);
  }, [bien.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // message adapté au modèle
  useEffect(() => {
    setData((d) =>
      modele === "vendu" && d.cta === CTA_VISITE ? { ...d, cta: CTA_VENDU } : modele !== "vendu" && d.cta === CTA_VENDU ? { ...d, cta: CTA_VISITE } : d
    );
  }, [modele]);

  useEffect(() => {
    let alive = true;
    Promise.all([ensureFonts(), loadBrand(), Promise.all(sources.map((s) => loadImage(s)))]).then(([, b, list]) => {
      if (!alive) return;
      setBrand(b);
      setImgs(list);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [sources]);

  const ordered = useMemo(() => {
    if (!imgs.length) return [] as (HTMLImageElement | null)[];
    const m = imgs[main] ?? null;
    return [m, ...imgs.filter((_, i) => i !== main)].filter(Boolean) as HTMLImageElement[];
  }, [imgs, main]);
  const failed = imgs.filter((i) => !i).length;
  const slides = modele === "carrousel" ? carouselSlides(data, ordered.length) : [];
  const nSlides = slides.length || 1;
  const slideI = Math.min(slide, nSlides - 1);

  const opts = (i = slideI) => ({ modele, format, palette, data, photos: ordered, slide: i, emblem: brand?.emblem ?? null, arcades: brand?.arcades ?? null });

  useEffect(() => {
    if (!ready || !canvas.current) return;
    const id = requestAnimationFrame(() => {
      const ctx = canvas.current?.getContext("2d");
      if (ctx) renderVisuel(ctx, opts());
    });
    return () => cancelAnimationFrame(id);
  }); // redessine à chaque rendu (rapide)

  async function blobs(): Promise<File[]> {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    const out: File[] = [];
    const base = `patrim-${slug(bien.titre || "bien")}-${modele}-${format}`;
    for (let i = 0; i < nSlides; i++) {
      renderVisuel(ctx, opts(i));
      const b = await canvasToBlob(c);
      out.push(new File([b], nSlides > 1 ? `${base}-${i + 1}.png` : `${base}.png`, { type: "image/png" }));
    }
    return out;
  }

  async function download() {
    setBusy(true);
    try {
      const files = await blobs();
      for (const f of files) {
        telecharger(f, f.name);
        await new Promise((r) => setTimeout(r, 350));
      }
      toast(files.length > 1 ? `${files.length} images téléchargées` : "Image téléchargée");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    try {
      const files = await blobs();
      const ok = await partagerFichiers(files, bien.titre);
      if (!ok) {
        for (const f of files) telecharger(f, f.name);
        toast("Partage indisponible : image téléchargée");
      }
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    const added: string[] = [];
    for (const f of Array.from(list).slice(0, 8)) {
      try {
        added.push((await fileToBase64Jpeg(f, 2200)).dataUrl);
      } catch {}
    }
    if (added.length) {
      setUploads((u) => [...u, ...added]);
      setMain(sources.length);
      toast(added.length > 1 ? "Photos ajoutées" : "Photo ajoutée");
    }
  }

  const set = <K extends keyof VisuelData>(k: K, v: VisuelData[K]) => setData((d) => ({ ...d, [k]: v }));
  const F = FORMATS[format];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
      {node}
      {/* Aperçu */}
      <div className="lg:order-2 lg:sticky lg:top-6 space-y-3">
        <div className="card p-3 sm:p-4 bg-[radial-gradient(circle_at_30%_0%,rgb(var(--surface-2)),rgb(var(--surface))_70%)]">
          <div className={cx("relative mx-auto", format === "story" ? "max-w-[300px] sm:max-w-[340px]" : format === "carre" ? "max-w-[460px]" : "max-w-[420px]")}>
            <div className="relative overflow-hidden rounded-xl shadow-[0_24px_60px_-24px_rgba(13,20,32,.55)] bg-ink" style={{ aspectRatio: `${F.w} / ${F.h}` }}>
              <canvas ref={canvas} width={F.w} height={F.h} className="absolute inset-0 size-full" />
              {!ready && (
                <div className="absolute inset-0 grid place-items-center text-white/80">
                  <Spinner />
                </div>
              )}
            </div>
            {modele === "carrousel" && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <button className="btn-secondary btn-sm !px-2" onClick={() => setSlide(Math.max(0, slideI - 1))} disabled={slideI === 0} aria-label="Slide précédente">
                  <ChevronLeft size={16} />
                </button>
                <div className="flex gap-1.5">
                  {Array.from({ length: nSlides }, (_, i) => (
                    <button key={i} onClick={() => setSlide(i)} className={cx("h-2 rounded-full transition-all", i === slideI ? "w-6 bg-accent" : "w-2 bg-line")} aria-label={`Slide ${i + 1}`} />
                  ))}
                </div>
                <button className="btn-secondary btn-sm !px-2" onClick={() => setSlide(Math.min(nSlides - 1, slideI + 1))} disabled={slideI >= nSlides - 1} aria-label="Slide suivante">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={download} disabled={busy || !ready}>
              {busy ? <Spinner /> : <Download size={16} />} {nSlides > 1 ? `Télécharger (${nSlides})` : "Télécharger"}
            </button>
            <button className="btn-secondary" onClick={share} disabled={busy || !ready}>
              <Share2 size={16} /> Partager
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">
            {F.w} × {F.h} px · PNG haute définition
          </p>
        </div>
        {failed > 0 && (
          <div className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs text-warn">
            <ImageOff size={15} className="shrink-0 mt-0.5" />
            {failed > 1 ? `${failed} photos ne peuvent pas être utilisées` : "Une photo ne peut pas être utilisée"} (lien protégé). Le fond aux couleurs PATRIM la remplace : ajoutez la photo depuis votre téléphone si besoin.
          </div>
        )}
      </div>

      {/* Réglages */}
      <div className="lg:order-1 space-y-4">
        <div className="card card-pad">
          <div className="label">Modèle</div>
          <div className="-mx-1 flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible">
            {MODELES.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  setModele(m.value);
                  setSlide(0);
                }}
                className={cx(
                  "shrink-0 w-[132px] sm:w-auto rounded-2xl border p-3 text-left transition",
                  modele === m.value ? "border-brand bg-brand text-white shadow-glow" : "border-line bg-surface hover:bg-surface-2"
                )}
              >
                <div className="font-serif text-[15px] font-semibold leading-tight">{m.label}</div>
                <div className={cx("mt-1 text-[11px] leading-snug", modele === m.value ? "text-white/70" : "text-muted")}>{m.hint}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="label">Format</div>
              <Segmented value={format} onChange={setFormat} items={(Object.keys(FORMATS) as Format[]).map((f) => ({ value: f, label: `${FORMATS[f].label} ${FORMATS[f].ratio}` }))} />
            </div>
            <div>
              <div className="label">Couleurs</div>
              <div className="flex gap-2">
                {PALETTE_ITEMS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPalette(p.value)}
                    className={cx("flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border text-xs font-medium transition", palette === p.value ? "border-brand ring-2 ring-brand/20" : "border-line")}
                  >
                    <span className="size-6 rounded-full border border-black/10" style={{ background: p.swatch }} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Photos */}
        <div className="card card-pad">
          <div className="flex items-center justify-between">
            <div className="label !mb-0">Photo principale</div>
            <button className="btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={15} /> Ajouter
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ""))} />
          </div>
          {sources.length ? (
            <div className="mt-2.5 flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {sources.map((s, i) => (
                <button
                  key={s.slice(0, 60) + i}
                  onClick={() => setMain(i)}
                  className={cx("relative shrink-0 size-16 overflow-hidden rounded-xl border-2 transition", main === i ? "border-accent" : "border-transparent opacity-80 hover:opacity-100")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s} alt="" className="size-full object-cover bg-surface-2" />
                  {imgs[i] === null && ready && <span className="absolute inset-0 grid place-items-center bg-ink/60 text-white"><ImageOff size={16} /></span>}
                </button>
              ))}
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} className="mt-2.5 w-full rounded-2xl border border-dashed border-line py-5 text-sm text-muted hover:bg-surface-2">
              Aucune photo : le fond PATRIM est utilisé. <span className="text-accent font-medium">Ajouter une photo</span>
            </button>
          )}
        </div>

        {/* Textes */}
        <div className="card card-pad space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-section">Textes du visuel</div>
            <button className="btn-ghost btn-sm" onClick={() => setData({ ...dataDuBien(bien), cta: modele === "vendu" ? CTA_VENDU : CTA_VISITE })}>
              <RotateCcw size={14} /> Réinitialiser
            </button>
          </div>
          <Field label="Titre">
            <input className="input" value={data.titre} onChange={(e) => set("titre", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lieu">
              <input className="input" value={data.lieu} onChange={(e) => set("lieu", e.target.value)} />
            </Field>
            <Field label={modele === "baisse" ? "Nouveau prix" : "Prix (honoraires inclus)"}>
              <input className="input" value={data.prix} onChange={(e) => set("prix", e.target.value)} />
            </Field>
          </div>
          {modele === "baisse" && (
            <Field label="Ancien prix (barré)" hint="Laisser vide pour ne pas l'afficher">
              <input className="input" placeholder="ex. 365 000 €" value={data.ancienPrix} onChange={(e) => set("ancienPrix", e.target.value)} />
            </Field>
          )}
          {modele === "visite" && (
            <Field label="Date et horaires">
              <input className="input" value={data.mention} onChange={(e) => set("mention", e.target.value)} placeholder="Samedi 18 octobre · 10h – 13h" />
            </Field>
          )}
          {(modele === "visite" || modele === "vendu") && (
            <Field label={modele === "vendu" ? "Message" : "Ligne d'appel"}>
              <input
                className="input"
                value={data.cta}
                onChange={(e) => set("cta", e.target.value)}
              />
            </Field>
          )}
          {modele === "vendu" && (
            <Field label="Ligne descriptive">
              <input className="input" value={data.ligne} onChange={(e) => set("ligne", e.target.value)} />
            </Field>
          )}
          {modele !== "vendu" && modele !== "sous_offre" && (
            <div>
              <div className="label">Chiffres clés {modele !== "carrousel" && <span className="font-normal">(3 premiers affichés)</span>}</div>
              <div className="space-y-1.5">
                {data.chiffres.map((c, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input
                      className="input w-28 shrink-0"
                      value={c.valeur}
                      onChange={(e) => set("chiffres", data.chiffres.map((x, j) => (j === i ? { ...x, valeur: e.target.value } : x)))}
                    />
                    <input className="input" value={c.label} onChange={(e) => set("chiffres", data.chiffres.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <button className="btn-ghost !px-2.5 shrink-0" aria-label="Retirer" onClick={() => set("chiffres", data.chiffres.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button className="btn-ghost btn-sm" onClick={() => set("chiffres", [...data.chiffres, { valeur: "", label: "" }])}>
                  <Plus size={14} /> Ajouter un chiffre
                </button>
              </div>
            </div>
          )}
          {modele === "carrousel" && (
            <Field label="Points forts (un par ligne)">
              <AutoTextarea
                minRows={3}
                value={data.pointsForts.join("\n")}
                onChange={(e) =>
                  set(
                    "pointsForts",
                    e.target.value.split("\n").slice(0, 6)
                  )
                }
                onBlur={() => set("pointsForts", data.pointsForts.map((p) => p.trim()).filter(Boolean))}
              />
            </Field>
          )}
          {modele !== "vendu" && modele !== "sous_offre" && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>Classe DPE :</span>
              <select className="input !h-8 !w-auto text-xs" value={data.dpe ?? ""} onChange={(e) => set("dpe", e.target.value || undefined)}>
                <option value="">Non affichée</option>
                {"ABCDEFG".split("").map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              {!bien.dpe && <span className="text-warn">À renseigner sur la fiche du bien</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
