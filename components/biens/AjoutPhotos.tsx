"use client";

import { useRef, useState } from "react";
import { Camera, Plus } from "lucide-react";
import { Spinner } from "@/components/ui";
import { MAX_PHOTOS, importerPhotos } from "./PhotosEditor";

/** Bouton d'ajout de photos directement sur la fiche (appareil photo ou galerie du téléphone). */
export function AjoutPhotos({ photos, onAdd, compact }: { photos: string[]; onAdd: (p: string[]) => void; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const vide = !photos.length && !compact;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    try {
      const nouvelles = await importerPhotos(files, MAX_PHOTOS - photos.length);
      if (nouvelles.length) onAdd([...photos, ...nouvelles]);
    } catch {
      setErr("Import impossible, réessayez.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {vide ? (
        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="btn-primary shadow-lift">
            {busy ? <Spinner /> : <Camera size={17} />} {busy ? "Envoi des photos…" : "Ajouter des photos"}
          </button>
          <span className="rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] text-white backdrop-blur">{err || `Appareil photo ou galerie, ${MAX_PHOTOS} maximum`}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label="Ajouter des photos"
          className="grid place-items-center size-9 rounded-full bg-surface/95 text-fg shadow-card hover:text-accent transition"
        >
          {busy ? <Spinner /> : <Plus size={18} />}
        </button>
      )}
    </>
  );
}
