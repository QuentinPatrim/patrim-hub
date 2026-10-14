"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import type { BienType } from "@/lib/types";
import { TYPE_BIEN } from "@/lib/format";
import { TYPE_ICON } from "./utils";

/** Visuel de remplacement aux couleurs PATRIM quand un bien n'a pas encore de photo. */
export function BienPlaceholder({ type, className, compact }: { type: BienType; className?: string; compact?: boolean }) {
  const Icon = TYPE_ICON[type] ?? TYPE_ICON.appartement;
  return (
    <div className={cx("relative overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-ink text-white", className)}>
      <div className="arcades absolute inset-x-0 bottom-0 h-[70%] opacity-[0.10]" aria-hidden />
      <div className="absolute -right-10 -top-12 size-48 rounded-full bg-coral/20 blur-3xl" aria-hidden />
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-2">
        <span className={cx("grid place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm shadow-[0_8px_24px_-8px_rgba(0,0,0,.4)]", compact ? "size-10" : "size-14")}>
          <Icon size={compact ? 20 : 28} strokeWidth={1.5} />
        </span>
        {!compact && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/60">
            {TYPE_BIEN[type]} · Patrim
          </span>
        )}
      </div>
    </div>
  );
}

/** Photo principale d'un bien, ou visuel de remplacement. */
export function BienCover({ photo, type, className, alt = "", compact }: { photo?: string; type: BienType; className?: string; alt?: string; compact?: boolean }) {
  const [erreur, setErreur] = useState<string | null>(null);
  if (!photo || erreur === photo) return <BienPlaceholder type={type} className={className} compact={compact} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt={alt} loading="lazy" onError={() => setErreur(photo)} className={cx("object-cover bg-surface-2", className)} />
  );
}
