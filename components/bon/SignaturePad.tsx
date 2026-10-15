"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Eraser } from "lucide-react";
import { cx } from "@/components/ui";
import { longueur, versChemin, type Trace } from "./bon";

/* Signature au doigt (ou à la souris), gardée en tracé SVG : nette à l'impression et légère. */

const W = 1000;
const H = 400;
/** En dessous, c'est un effleurement : la signature n'est pas prise. */
const MINIMUM = 150;

export function SignaturePad({ label, onChange }: { label: string; onChange: (t: Trace | undefined) => void }) {
  const zone = useRef<SVGSVGElement>(null);
  const trait = useRef<SVGPathElement>(null);
  const traits = useRef<[number, number][][]>([]);
  const actif = useRef(false);
  const [etat, setEtat] = useState<"vide" | "court" | "ok">("vide");

  const point = (e: PointerEvent<SVGSVGElement>): [number, number] => {
    const r = zone.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
  };
  const dessiner = () => trait.current?.setAttribute("d", versChemin(traits.current));

  const debut = (e: PointerEvent<SVGSVGElement>) => {
    e.preventDefault();
    zone.current?.setPointerCapture(e.pointerId);
    actif.current = true;
    traits.current.push([point(e)]);
    dessiner();
  };
  const suite = (e: PointerEvent<SVGSVGElement>) => {
    if (!actif.current) return;
    const t = traits.current[traits.current.length - 1];
    const p = point(e);
    const [x, y] = t[t.length - 1];
    if (Math.hypot(p[0] - x, p[1] - y) < 5) return;
    t.push(p);
    dessiner();
  };
  const fin = () => {
    if (!actif.current) return;
    actif.current = false;
    const assez = longueur(traits.current) >= MINIMUM;
    setEtat(assez ? "ok" : "court");
    onChange(assez ? { d: versChemin(traits.current), w: W, h: H } : undefined);
  };
  const effacer = () => {
    traits.current = [];
    dessiner();
    setEtat("vide");
    onChange(undefined);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="label !mb-0">{label}</span>
        <button type="button" onClick={effacer} disabled={etat === "vide"} className="btn-ghost btn-sm shrink-0 disabled:opacity-40">
          <Eraser size={14} /> Effacer
        </button>
      </div>
      <div className="relative mt-1.5">
        <svg
          ref={zone}
          viewBox={`0 0 ${W} ${H}`}
          className={cx("block w-full touch-none select-none rounded-xl border-2 border-dashed bg-surface text-fg", etat === "ok" ? "border-ok/50" : "border-line")}
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={debut}
          onPointerMove={suite}
          onPointerUp={fin}
          onPointerCancel={fin}
          role="img"
          aria-label={label}
        >
          <line x1={60} x2={W - 60} y1={H * 0.74} y2={H * 0.74} stroke="currentColor" strokeOpacity={0.15} strokeWidth={3} />
          <path ref={trait} d="" fill="none" stroke="currentColor" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {etat === "vide" && <span className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-sm text-muted">Signez ici avec le doigt</span>}
      </div>
      {etat === "court" && <p className="mt-1 text-xs text-warn">Signature trop courte : signez comme sur un document papier.</p>}
    </div>
  );
}

/** Signature enregistrée. */
export function TraceSvg({ t, className, color = "currentColor" }: { t: Trace; className?: string; color?: string }) {
  return (
    <svg viewBox={`0 0 ${t.w} ${t.h}`} className={className} role="img" aria-label="Signature">
      <path d={t.d} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
