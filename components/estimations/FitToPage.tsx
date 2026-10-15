"use client";

import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

/* ============================================================
   FitToPage — zone de contenu d'une page A4 qui tient TOUJOURS
   dans la hauteur disponible (avis de valeur PDF).

   Le contenu est mesuré dans le navigateur. S'il dépasse :
     1. on passe au niveau de densité suivant (0 → MAX_DENSITY) :
        la page appelante resserre marges, espacements et tailles ;
     2. au niveau maximal, on réduit l'ensemble à l'échelle
        (jamais sous MIN_SCALE).
   Rien n'est donc écrasé ni coupé, quelle que soit la longueur
   des textes saisis. La mesure est refaite si un bloc change de
   taille (image chargée…) et une fois les polices chargées.

   La même mise en page sert à l'écran et à l'impression.
   ============================================================ */

export const MAX_DENSITY = 8;
const MIN_SCALE = 0.7;
/** Marge de sécurité (px) : évite qu'une ligne en plus à l'impression fasse déborder */
const SLACK = 8;

export function FitToPage({ className = "", columnStyle, children }: {
    className?: string;
    /** Style de la colonne de blocs selon la densité (espacement, répartition) */
    columnStyle?: (density: number) => CSSProperties;
    children: (density: number) => ReactNode;
}) {
    const innerRef = useRef<HTMLDivElement>(null);
    const [fit, setFit] = useState({ density: 0, scale: 1 });

    // Une fois les polices définitives chargées, on repart du niveau aéré et on re-mesure
    // (une police de remplacement plus large aurait pu faire resserrer la page pour rien).
    useEffect(() => {
        let live = true;
        document.fonts?.ready.then(() => { if (live) setFit({ density: 0, scale: 1 }); });
        return () => { live = false; };
    }, []);

    useLayoutEffect(() => {
        const inner = innerRef.current;
        if (!inner) return;
        const check = () => {
            // Hauteur réelle du contenu : somme des blocs + espacements
            // (scrollHeight ne convient pas : il ne descend jamais sous la hauteur disponible)
            const blocks = Array.from(inner.children) as HTMLElement[];
            const gap = parseFloat(getComputedStyle(inner).rowGap) || 0;
            const need = blocks.reduce((sum, b) => sum + b.offsetHeight, 0) + gap * Math.max(0, blocks.length - 1);
            const have = inner.clientHeight;   // hauteur disponible
            if (!have || need + SLACK <= have) return;
            setFit(f => {
                if (f.density < MAX_DENSITY) return { density: f.density + 1, scale: 1 };
                if (f.scale <= MIN_SCALE) return f;
                const next = Math.max(MIN_SCALE, f.scale * (have / (need + SLACK)));
                return next < f.scale - 0.002 ? { density: f.density, scale: next } : f;
            });
        };
        check();
        // Re-mesure quand un bloc change de taille sans nouveau rendu (police ou image chargée)
        const observer = new ResizeObserver(check);
        Array.from(inner.children).forEach(child => observer.observe(child));
        return () => observer.disconnect();
    });

    const scaled = fit.scale < 1;
    return (
        <div className={`flex-1 min-h-0 ${className}`} data-fit={`${fit.density}${scaled ? `@${fit.scale.toFixed(2)}` : ""}`}>
            <div
                ref={innerRef}
                className="flex flex-col"
                style={{
                    ...columnStyle?.(fit.density),
                    ...(scaled
                        ? { width: `${100 / fit.scale}%`, height: `${100 / fit.scale}%`, transform: `scale(${fit.scale})`, transformOrigin: "top left" }
                        : { height: "100%" }),
                }}
            >
                {children(fit.density)}
            </div>
        </div>
    );
}
