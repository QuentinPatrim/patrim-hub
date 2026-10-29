"use client";

import clsx from "clsx";
import { LayoutGrid, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { vibrer } from "@/lib/haptique";

// court : libellé de la barre du bas quand le nom complet ne tient pas sur une ligne
type Onglet = { href: string; label: string; court?: string; icon: LucideIcon };

/**
 * Barre d'onglets du téléphone. Une pastille unique glisse d'un onglet à l'autre :
 * le bord avant part d'abord, le bord arrière suit, la pastille s'étire sur le chemin puis se reforme.
 */
export function TabBar({ onglets, actif, plusActif, onPlus }: { onglets: Onglet[]; actif: (href: string) => boolean; plusActif: boolean; onPlus: () => void }) {
  const path = usePathname();
  const n = onglets.length + 1;
  const courant = plusActif ? onglets.length : onglets.findIndex((o) => actif(o.href));
  // Onglet touché : la pastille part tout de suite, sans attendre le chargement de la page
  const [vise, setVise] = useState<number | null>(null);
  useEffect(() => setVise(null), [path, plusActif]);
  const i = vise ?? courant;

  const avant = useRef(i);
  const versDroite = i >= avant.current;
  useEffect(() => {
    avant.current = i;
  }, [i]);

  const toucher = (k: number) => {
    if (k !== i) vibrer();
    setVise(k);
  };

  const bord = (lent: boolean) => (lent ? "380ms cubic-bezier(.65,0,.35,1) 60ms" : "300ms cubic-bezier(.3,1.35,.6,1)");
  const pastille =
    i < 0
      ? { opacity: 0 }
      : {
          left: `calc(${(i * 100) / n}% + 6px)`,
          right: `calc(${((n - 1 - i) * 100) / n}% + 6px)`,
          transition: `left ${bord(versDroite)}, right ${bord(!versDroite)}, opacity 200ms`,
        };

  const classe = (on: boolean) => clsx("relative z-[1] flex min-w-0 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition-colors duration-300 active:scale-[.94] [transition-property:color,transform]", on ? "text-accent" : "text-muted");

  return (
    <nav className="app-tabbar lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/85 backdrop-blur-xl backdrop-saturate-150 shadow-nav safe-bottom no-print" aria-label="Navigation principale">
      <div className="relative grid grid-cols-5 h-[62px] px-1">
        <span aria-hidden className="tab-pastille absolute top-[7px] bottom-[7px] rounded-full bg-accent/10" style={pastille} />
        {onglets.map(({ href, label, court, icon: Icon }, k) => {
          const on = k === i;
          return (
            <Link key={href} href={href} onClick={() => toucher(k)} aria-current={actif(href) ? "page" : undefined} className={classe(on)}>
              <Icon size={21} strokeWidth={on ? 2.2 : 1.8} />
              <span className="max-w-full truncate px-0.5">{court ?? label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => {
            toucher(onglets.length);
            onPlus();
          }}
          className={classe(i === onglets.length)}
        >
          <LayoutGrid size={21} strokeWidth={i === onglets.length ? 2.2 : 1.8} />
          Plus
        </button>
      </div>
    </nav>
  );
}
