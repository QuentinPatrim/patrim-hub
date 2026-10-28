"use client";

import { Dictee } from "@/components/dictee/Dictee";
import { useRetoursVisite } from "@/components/retour/retour";
import clsx from "clsx";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  CalendarDays,
  Calculator,
  Home,
  KeyRound,
  FileSignature,
  LayoutGrid,
  ListChecks,
  Moon,
  Search,
  Sparkles,
  Sun,
  Users,
  X,
  Settings,
  Send,
  Radar,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getAll } from "@/lib/store";
import { nomComplet } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { NOM_ESPACE, choisirEspace, useEspace } from "@/components/espace/espace";
import { locationSeule } from "@/components/location/bienLocation";
import { useSuiviRetour } from "@/lib/retour";

export const NAV_VENTE = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/biens", label: "Biens", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/estimations", label: "Estimations", icon: Calculator },
  { href: "/rediger", label: "Rédiger", icon: FileSignature },
  { href: "/a-envoyer", label: "À envoyer", icon: Send },
  { href: "/radar", label: "Radar vendeurs", icon: Radar },
  { href: "/a-regler", label: "À régler", icon: ListChecks },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];
export const NAV_LOCATION = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/biens", label: "Biens à louer", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/echeancier", label: "Échéancier", icon: CalendarClock },
  { href: "/locatives", label: "Estimation locative", icon: KeyRound },
  { href: "/rediger", label: "Rédiger", icon: FileSignature },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];
export const NAV = NAV_VENTE;
// Barre du bas sur mobile : 4 raccourcis + « Plus »
const MOBILE = ["/", "/biens", "/contacts", "/agenda"];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  useSuiviRetour();
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState(false);
  const { theme, toggle } = useTheme();
  const router = useRouter();
  const choisi = useEspace();
  const espace = choisi ?? "vente";
  const nav = espace === "location" ? NAV_LOCATION : NAV_VENTE;
  const autre = espace === "location" ? "vente" : "location";
  const changer = () => {
    choisirEspace(autre);
    router.push("/");
  };
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setMore(false), [path]);
  useRetoursVisite();

  if (path.startsWith("/connexion") || path.startsWith("/imprimer") || path.startsWith("/b/") || path.startsWith("/r/") || path.startsWith("/renseignements/") || path.startsWith("/informations/")) return <>{children}</>;

  const moreItems = [...nav.filter((n) => !MOBILE.includes(n.href)), { href: "/reglages", label: "Réglages", icon: Settings }];
  const moreActive = moreItems.some((n) => active(n.href));

  return (
    <div className="min-h-dvh lg:pl-[264px]">
      {/* Barre latérale (ordinateur / tablette) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col overflow-hidden bg-ink text-white/90 no-print">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_40%_at_0%_0%,rgba(108,25,30,.55),transparent_70%)]" />
        <div aria-hidden className="arcades pointer-events-none absolute inset-x-0 bottom-16 h-24 opacity-[0.05]" />
        <div className="relative px-5 pt-6 pb-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/emblem.png" alt="" width={40} height={40} className="rounded-xl ring-1 ring-white/10 shadow-lg" />
            <div>
              <div className="font-semibold tracking-[0.24em] text-[15px] text-white">PATRIM</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/45">
                <span className="h-px w-3 bg-coral" /> Hub {NOM_ESPACE[espace]}
              </div>
            </div>
          </Link>
          {choisi && (
            <button onClick={changer} className="mt-4 flex w-full items-center gap-2 h-9 rounded-xl px-3 text-[12.5px] font-medium text-white/60 ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.06] hover:text-white transition">
              {autre === "location" ? <KeyRound size={14} /> : <Building2 size={14} />} Aller sur Hub {NOM_ESPACE[autre]}
            </button>
          )}
        </div>
        <button onClick={() => setSearch(true)} className="relative mx-4 mb-5 flex items-center gap-2 h-10 rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.06] px-3 text-[13px] text-white/50 hover:bg-white/10 hover:text-white/70 transition">
          <Search size={15} /> Rechercher <span className="ml-auto rounded-md border border-white/15 px-1.5 py-px text-[10px] font-medium">⌘K</span>
        </button>
        <Dictee label className="relative mx-4 -mt-3 mb-5 flex items-center gap-2 h-10 rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/[0.06] px-3 text-[13px] text-white/60 hover:bg-white/10 hover:text-white/80 transition" />
        <div className="relative px-6 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">Menu</div>
        <nav className="relative flex-1 px-3 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const on = active(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={clsx(
                  "relative flex items-center gap-3 h-10 px-3 rounded-xl text-sm font-medium transition duration-200",
                  on ? "bg-white/[0.09] text-white ring-1 ring-inset ring-white/[0.08]" : "text-white/60 hover:text-white hover:bg-white/[0.05]"
                )}
              >
                {on && <span aria-hidden className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-coral" />}
                <span className={clsx("grid place-items-center size-7 rounded-lg transition", on ? "bg-brand text-white shadow-[0_4px_12px_-4px_rgba(108,25,30,.9)]" : "text-white/70")}>
                  <Icon size={17} strokeWidth={on ? 2 : 1.8} />
                </span>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="relative p-3 border-t border-white/[0.08] flex items-center gap-1">
          <Link href="/reglages" className={clsx("flex-1 flex items-center gap-3 h-10 px-3 rounded-xl text-sm font-medium transition", active("/reglages") ? "bg-white/[0.09] text-white" : "text-white/60 hover:text-white hover:bg-white/[0.05]")}>
            <Settings size={17} strokeWidth={1.8} /> Réglages
          </Link>
          <button onClick={toggle} className="grid place-items-center size-10 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.05] transition" aria-label="Changer de thème">
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>
      </aside>

      {/* En-tête mobile */}
      <header className="lg:hidden sticky top-0 z-30 safe-top bg-bg/95 backdrop-blur-xl backdrop-saturate-150 border-b border-line/40 no-print">
        <div className="flex items-center gap-3 h-14 px-4">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Accueil PATRIM">
            <Image src="/emblem.png" alt="" width={30} height={30} className="rounded-lg shadow-xs" />
            <span className="leading-none">
              <span className="block font-semibold tracking-[0.22em] text-[13px]">PATRIM</span>
              <span className="mt-1 block h-[2px] w-6 rounded-full bg-coral" />
            </span>
          </Link>
          {choisi && (
            <button onClick={changer} className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-fg/80 active:scale-[.97]" aria-label={`Aller sur Hub ${NOM_ESPACE[autre]}`}>
              {espace === "location" ? <KeyRound size={13} className="text-accent" /> : <Building2 size={13} className="text-accent" />} {NOM_ESPACE[espace]}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Dictee className="grid place-items-center size-10 rounded-full text-fg/80 hover:bg-fg/[0.05] transition" />
            <button onClick={() => setSearch(true)} className="grid place-items-center size-10 rounded-full text-fg/80 hover:bg-fg/[0.05] transition" aria-label="Rechercher">
              <Search size={19} />
            </button>
            <button onClick={toggle} className="grid place-items-center size-10 rounded-full text-fg/80 hover:bg-fg/[0.05] transition" aria-label="Changer de thème">
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 pt-5 sm:pt-8 pb-[calc(96px+env(safe-area-inset-bottom))] lg:pb-14 min-w-0">{children}</main>

      {/* Barre d'onglets mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/85 backdrop-blur-xl backdrop-saturate-150 shadow-nav safe-bottom no-print" aria-label="Navigation principale">
        <div className="grid grid-cols-5 h-[62px] px-1">
          {nav.filter((n) => MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => {
            const on = active(href);
            return (
              <Link key={href} href={href} aria-current={on ? "page" : undefined} className={clsx("group flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition-colors", on ? "text-accent" : "text-muted")}>
                <span className={clsx("grid place-items-center h-7 w-12 rounded-full transition-all duration-300", on ? "bg-accent/10" : "group-active:bg-fg/[0.05]")}>
                  <Icon size={21} strokeWidth={on ? 2.2 : 1.8} />
                </span>
                {label}
              </Link>
            );
          })}
          <button onClick={() => setMore(true)} className={clsx("group flex flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition-colors", more || moreActive ? "text-accent" : "text-muted")}>
            <span className={clsx("grid place-items-center h-7 w-12 rounded-full transition-all duration-300", more || moreActive ? "bg-accent/10" : "group-active:bg-fg/[0.05]")}>
              <LayoutGrid size={21} strokeWidth={more || moreActive ? 2.2 : 1.8} />
            </span>
            Plus
          </button>
        </div>
      </nav>

      {more && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[3px] animate-fade-in" />
          <div className="absolute bottom-0 inset-x-0 rounded-t-[28px] border-t border-line/70 bg-surface px-5 pt-3 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-2xl animate-sheet-up" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="mb-3 flex items-center justify-between">
              <div className="font-serif text-lg font-semibold">Plus d&apos;outils</div>
              <button onClick={() => setMore(false)} className="grid place-items-center size-9 rounded-full bg-surface-2 text-muted" aria-label="Fermer">
                <X size={17} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {moreItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={clsx("flex items-center gap-3 rounded-2xl border p-3 text-sm font-semibold transition active:scale-[.98]", active(href) ? "border-accent/30 bg-accent/[0.06]" : "border-line/80 bg-surface-2/60")}>
                  <span className="grid place-items-center size-10 shrink-0 rounded-xl bg-gradient-to-b from-brand-light to-brand text-white shadow-btn">
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0 truncate">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {search && <SearchPalette onClose={() => setSearch(false)} />}
    </div>
  );
}

/** Recherche globale : biens, contacts, estimations, pages. */
function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const loc = useEspace() === "location";
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = [...NAV_VENTE, ...NAV_LOCATION.filter((n) => !NAV_VENTE.some((v) => v.href === n.href))];
    if (!s) return pages.map((n) => ({ href: n.href, title: n.label, sub: "Aller à la page" }));
    const has = (...v: (string | number | undefined)[]) => v.some((x) => x != null && String(x).toLowerCase().includes(s));
    const out: { href: string; title: string; sub: string }[] = [];
    getAll("biens").filter((b) => locationSeule(b) === loc).forEach((b) => has(b.titre, b.adresse, b.ref, b.quartier, b.ville) && out.push({ href: `/biens/${b.id}`, title: b.titre || b.adresse, sub: `Bien · ${b.adresse}` }));
    getAll("contacts").forEach((c) => has(c.nom, c.prenom, c.email, c.tel) && out.push({ href: `/contacts/${c.id}`, title: nomComplet(c), sub: `Contact · ${c.tel ?? c.email ?? ""}` }));
    getAll("estimations").forEach((e) => has(e.adresse, e.ville) && out.push({ href: `/estimations/${e.id}`, title: e.adresse, sub: "Estimation" }));
    pages.forEach((n) => has(n.label) && out.push({ href: n.href, title: n.label, sub: "Page" }));
    return out.slice(0, 30);
  }, [q, loc]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-[3px] animate-fade-in" />
      <div className="relative w-full max-w-lg card !shadow-2xl overflow-hidden animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-line">
          <Search size={18} className="text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                router.push(results[0].href);
                onClose();
              }
            }}
            placeholder="Un bien, un client, une adresse…"
            className="flex-1 h-14 bg-transparent outline-none text-[15px]"
          />
          <button onClick={onClose} className="grid place-items-center size-8 rounded-full bg-surface-2 text-muted hover:text-fg" aria-label="Fermer">
            <X size={15} />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((r) => (
            <li key={r.href + r.title}>
              <Link href={r.href} onClick={onClose} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2 transition">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted truncate">{r.sub}</div>
                </div>
                <ArrowRight size={15} className="shrink-0 text-muted opacity-0 -translate-x-1 transition group-hover:opacity-100 group-hover:translate-x-0" />
              </Link>
            </li>
          ))}
          {!results.length && <li className="px-3 py-6 text-center text-sm text-muted">Aucun résultat</li>}
        </ul>
      </div>
    </div>
  );
}
