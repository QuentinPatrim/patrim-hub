"use client";

import { useFond } from "@/lib/fond";
import { useTheme } from "@/lib/theme";

/** Photo de fond du thème « Dashboard » : légèrement floutée, sous un voile bordeaux pour garder le texte lisible. */
export function Fond() {
  const { theme } = useTheme();
  const fond = useFond();
  if (theme !== "dashboard") return null;
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-[#140a0c] no-print">
      {fond.image ? (
        <div className="absolute -inset-8 bg-cover bg-center blur-[4px] scale-105" style={{ backgroundImage: `url("${fond.image}")` }} />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_100%_0%,#8e2a30,transparent_70%),radial-gradient(80%_50%_at_0%_100%,#4f1115,transparent_70%),linear-gradient(180deg,#3a0f13,#140a0c)]" />
      )}
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(40,8,11,${fond.voile * 0.7}), rgba(18,8,10,${fond.voile}) 45%, rgba(10,6,8,${Math.min(0.9, fond.voile + 0.25)}))` }} />
      <div className="absolute -right-20 -top-24 size-80 rounded-full bg-coral/20 blur-[80px]" />
    </div>
  );
}
