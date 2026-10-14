"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Link2, Plus, Star, Trash2 } from "lucide-react";
import { Spinner, cx } from "@/components/ui";
import { fileToBase64Jpeg } from "@/lib/ai";

export const MAX_PHOTOS = 8;

/** Gestion des photos d'un bien : liens (Drive, portail…) ou import depuis le téléphone, réduites avant stockage. */
export function PhotosEditor({ photos, onChange }: { photos: string[]; onChange: (p: string[]) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const restant = MAX_PHOTOS - photos.length;

  const addUrl = () => {
    const u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u) && !u.startsWith("data:image")) {
      setErr("Le lien doit commencer par http:// ou https://");
      return;
    }
    if (restant <= 0) return setErr(`${MAX_PHOTOS} photos maximum.`);
    onChange([...photos, u]);
    setUrl("");
    setErr("");
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    try {
      const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, restant));
      const out: string[] = [];
      for (const f of list) out.push((await fileToBase64Jpeg(f, 1280)).dataUrl);
      onChange([...photos, ...out]);
      if (files.length > list.length) setErr(`${MAX_PHOTOS} photos maximum : certaines n'ont pas été ajoutées.`);
    } catch (e) {
      setErr(e instanceof Error ? "Import impossible : " + e.message : "Import impossible.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const p = [...photos];
    [p[i], p[j]] = [p[j], p[i]];
    onChange(p);
  };
  const toFront = (i: number) => onChange([photos[i], ...photos.filter((_, k) => k !== i)]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {photos.map((p, i) => (
          <div key={i + p.slice(-24)} className={cx("group relative aspect-[4/3] overflow-hidden rounded-xl border bg-surface-2", i === 0 ? "border-accent ring-2 ring-accent/20" : "border-line")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-brand px-2 h-5 inline-flex items-center text-[10px] font-semibold text-white">Principale</span>}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6">
              <div className="flex gap-1">
                <IconBtn label="Avancer" onClick={() => move(i, -1)} disabled={i === 0}>
                  <ArrowLeft size={13} />
                </IconBtn>
                <IconBtn label="Reculer" onClick={() => move(i, 1)} disabled={i === photos.length - 1}>
                  <ArrowRight size={13} />
                </IconBtn>
                {i > 0 && (
                  <IconBtn label="Mettre en photo principale" onClick={() => toFront(i)}>
                    <Star size={13} />
                  </IconBtn>
                )}
              </div>
              <IconBtn label="Supprimer" onClick={() => onChange(photos.filter((_, k) => k !== i))}>
                <Trash2 size={13} />
              </IconBtn>
            </div>
          </div>
        ))}
        {restant > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="aspect-[4/3] rounded-xl border-2 border-dashed border-line bg-surface-2/50 flex flex-col items-center justify-center gap-1.5 text-muted hover:text-accent hover:border-accent/50 transition"
          >
            {busy ? <Spinner /> : <ImagePlus size={22} strokeWidth={1.6} />}
            <span className="text-xs font-medium">{busy ? "Import…" : "Importer"}</span>
            <span className="text-[10px]">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {restant > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addUrl();
                }
              }}
              placeholder="Coller le lien d'une photo"
              className="input pl-9"
              inputMode="url"
            />
          </div>
          <button type="button" onClick={addUrl} className="btn-secondary !px-3" aria-label="Ajouter le lien">
            <Plus size={16} />
          </button>
        </div>
      )}
      {err && <p className="text-xs text-danger">{err}</p>}
      <p className="text-[11px] text-muted">Les photos importées sont allégées automatiquement. La première est la photo principale.</p>
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="grid place-items-center size-7 rounded-lg bg-black/45 text-white backdrop-blur hover:bg-black/70 disabled:opacity-30">
      {children}
    </button>
  );
}
