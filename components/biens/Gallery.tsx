"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { createPortal } from "react-dom";
import { cx } from "@/components/ui";
import type { BienType } from "@/lib/types";
import { BienPlaceholder } from "./BienVisual";

/** Galerie photo : glisser du doigt sur mobile, flèches sur ordinateur, plein écran au toucher. */
export function Gallery({ photos, type, alt, overlay, ajout }: { photos: string[]; type: BienType; alt: string; overlay?: ReactNode; ajout?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  const closeFull = useCallback(() => setFull(null), []);

  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    const n = Math.max(0, Math.min(photos.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };
  const onScroll = () => {
    const el = ref.current;
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (!photos.length)
    return (
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl">
        <BienPlaceholder type={type} className="aspect-[4/3] sm:aspect-[21/9] w-full" />
        {overlay}
        {ajout && <div className="absolute inset-0 flex items-center justify-center">{ajout}</div>}
      </div>
    );

  return (
    <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-surface-2 group">
      <div ref={ref} onScroll={onScroll} className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar aspect-[4/3] sm:aspect-[21/9]">
        {photos.map((p, i) => (
          <button key={i} onClick={() => setFull(i)} className="relative h-full w-full shrink-0 snap-center" aria-label={`Agrandir la photo ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`${alt} – photo ${i + 1}`} loading={i < 2 ? "eager" : "lazy"} className="h-full w-full object-cover" draggable={false} />
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/45 to-transparent" />
      {overlay}
      {ajout && photos.length < 8 && <div className="absolute right-3 top-3">{ajout}</div>}
      {photos.length > 1 && (
        <>
          <button onClick={() => go(idx - 1)} disabled={idx === 0} className="hidden sm:grid absolute left-3 top-1/2 -translate-y-1/2 place-items-center size-10 rounded-full bg-surface/90 text-fg shadow-card opacity-0 group-hover:opacity-100 transition disabled:!opacity-0" aria-label="Photo précédente">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => go(idx + 1)} disabled={idx === photos.length - 1} className="hidden sm:grid absolute right-3 top-1/2 -translate-y-1/2 place-items-center size-10 rounded-full bg-surface/90 text-fg shadow-card opacity-0 group-hover:opacity-100 transition disabled:!opacity-0" aria-label="Photo suivante">
            <ChevronRight size={20} />
          </button>
          <div className="pointer-events-none absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
            {photos.map((_, i) => (
              <span key={i} className={cx("h-1.5 rounded-full bg-white transition-all", i === idx ? "w-5 opacity-100" : "w-1.5 opacity-60")} />
            ))}
          </div>
        </>
      )}
      <span className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 h-6 text-[11px] font-medium text-white backdrop-blur">
        <Expand size={11} /> {idx + 1}/{photos.length}
      </span>
      {full != null && createPortal(<Lightbox photos={photos} start={full} onClose={closeFull} alt={alt} />, document.body)}
    </div>
  );
}

function Lightbox({ photos, start, onClose, alt }: { photos: string[]; start: number; onClose: () => void; alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(start);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTo({ left: start * el.clientWidth });
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && el) el.scrollBy({ left: el.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft" && el) el.scrollBy({ left: -el.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [start, onClose]);
  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col animate-fade-up">
      <div className="flex items-center justify-between px-4 h-14 text-white safe-top">
        <span className="text-sm tabular-nums">
          {idx + 1} / {photos.length}
        </span>
        <button onClick={onClose} className="grid place-items-center size-10 rounded-full hover:bg-white/10" aria-label="Fermer">
          <X size={22} />
        </button>
      </div>
      <div ref={ref} onScroll={() => ref.current && setIdx(Math.round(ref.current.scrollLeft / ref.current.clientWidth))} className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar">
        {photos.map((p, i) => (
          <div key={i} className="h-full w-full shrink-0 snap-center grid place-items-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt={`${alt} – photo ${i + 1}`} className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      <div className="h-16 safe-bottom" />
    </div>
  );
}
