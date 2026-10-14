"use client";

import { cx } from "@/components/ui";
import type { BienType } from "@/lib/types";
import { TYPE_BIEN } from "@/lib/format";
import { TYPE_ICON } from "./utils";

/** Visuel de remplacement aux couleurs PATRIM quand un bien n'a pas encore de photo. */
export function BienPlaceholder({ type, className, compact }: { type: BienType; className?: string; compact?: boolean }) {
  const Icon = TYPE_ICON[type] ?? TYPE_ICON.appartement;
  return (
    <div className={cx("relative overflow-hidden bg-gradient-to-br from-brand via-brand-dark to-ink text-white", className)}>
      <svg className="absolute inset-0 h-full w-full opacity-[0.09]" aria-hidden>
        <defs>
          <pattern id="patrim-lines" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
            <line x1="0" y1="0" x2="0" y2="22" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#patrim-lines)" />
      </svg>
      <div className="absolute -right-10 -bottom-12 size-48 rounded-full bg-coral/20 blur-3xl" aria-hidden />
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-2">
        <span className={cx("grid place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur-sm", compact ? "size-10" : "size-14")}>
          <Icon size={compact ? 20 : 28} strokeWidth={1.5} />
        </span>
        {!compact && (
          <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-white/60">
            {TYPE_BIEN[type]} · Patrim
          </span>
        )}
      </div>
      <div className="absolute bottom-0 inset-x-0 h-[3px] bg-coral/70" aria-hidden />
    </div>
  );
}

/** Photo principale d'un bien, ou visuel de remplacement. */
export function BienCover({ photo, type, className, alt = "", compact }: { photo?: string; type: BienType; className?: string; alt?: string; compact?: boolean }) {
  if (!photo) return <BienPlaceholder type={type} className={className} compact={compact} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt={alt} loading="lazy" className={cx("object-cover bg-surface-2", className)} />
  );
}
