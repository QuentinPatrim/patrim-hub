"use client";

import clsx from "clsx";
import {
  Building2,
  CalendarDays,
  Calculator,
  Home,
  LayoutGrid,
  Moon,
  Search,
  Sparkles,
  Sun,
  Users,
  Wand2,
  X,
  Settings,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getAll } from "@/lib/store";
import { nomComplet } from "@/lib/format";
import { useTheme } from "@/lib/theme";

export const NAV = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/biens", label: "Biens", icon: Building2 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/estimations", label: "Estimations", icon: Calculator },
  { href: "/studio", label: "Studio", icon: Wand2 },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];
// Barre du bas sur mobile : 4 raccourcis + « Plus »
const MOBILE = ["/", "/biens", "/contacts", "/agenda"];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [more, setMore] = useState(false);
  const [search, setSearch] = useState(false);
  const { theme, toggle } = useTheme();
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

  if (path.startsWith("/connexion") || path.startsWith("/imprimer")) return <>{children}</>;

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Barre latérale (ordinateur / tablette) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-ink text-white/90 no-print">
        <div className="px-5 pt-6 pb-5">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/emblem.png" alt="" width={40} height={40} className="rounded-lg" />
            <div>
              <div className="font-semibold tracking-[0.2em] text-[15px]">PATRIM</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">Espace vente</div>
            </div>
          </Link>
        </div>
        <button onClick={() => setSearch(true)} className="mx-4 mb-4 flex items-center gap-2 h-9 rounded-xl bg-white/5 px-3 text-xs text-white/50 hover:bg-white/10">
          <Search size={14} /> Rechercher <span className="ml-auto rounded border border-white/15 px-1.5 text-[10px]">⌘K</span>
        </button>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 h-10 px-3 rounded-xl text-sm transition",
                active(href) ? "bg-brand text-white shadow-[0_8px_20px_-10px_rgba(108,25,30,.9)]" : "text-white/65 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon size={18} strokeWidth={1.8} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10 flex items-center gap-1">
          <Link href="/reglages" className={clsx("flex-1 flex items-center gap-3 h-10 px-3 rounded-xl text-sm", active("/reglages") ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5")}>
            <Settings size={18} strokeWidth={1.8} /> Réglages
          </Link>
          <button onClick={toggle} className="grid place-items-center size-10 rounded-xl text-white/60 hover:text-white hover:bg-white/5" aria-label="Changer de thème">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </aside>

      {/* En-tête mobile */}
      <header className="lg:hidden sticky top-0 z-30 safe-top bg-bg/85 backdrop-blur-xl border-b border-line no-print">
        <div className="flex items-center gap-3 h-14 px-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/emblem.png" alt="" width={30} height={30} className="rounded-md" />
            <span className="font-semibold tracking-[0.18em] text-sm">PATRIM</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setSearch(true)} className="btn-ghost !px-2.5" aria-label="Rechercher">
              <Search size={19} />
            </button>
            <button onClick={toggle} className="btn-ghost !px-2.5" aria-label="Changer de thème">
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-5 sm:py-8 pb-28 lg:pb-12">{children}</main>

      {/* Barre d'onglets mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl border-t border-line safe-bottom no-print">
        <div className="grid grid-cols-5 h-16">
          {NAV.filter((n) => MOBILE.includes(n.href)).map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={clsx("flex flex-col items-center justify-center gap-1 text-[10px] font-medium", active(href) ? "text-accent" : "text-muted")}>
              <Icon size={22} strokeWidth={active(href) ? 2.2 : 1.7} />
              {label}
            </Link>
          ))}
          <button onClick={() => setMore(true)} className={clsx("flex flex-col items-center justify-center gap-1 text-[10px] font-medium", more ? "text-accent" : "text-muted")}>
            <LayoutGrid size={22} strokeWidth={1.7} />
            Plus
          </button>
        </div>
      </nav>

      {more && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-surface p-5 pb-8 safe-bottom animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-3 gap-3">
              {[...NAV.filter((n) => !MOBILE.includes(n.href)), { href: "/reglages", label: "Réglages", icon: Settings }].map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface-2 py-4 text-xs font-medium">
                  <span className="grid place-items-center size-10 rounded-xl bg-brand text-white">
                    <Icon size={20} />
                  </span>
                  {label}
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
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return NAV.map((n) => ({ href: n.href, title: n.label, sub: "Aller à la page" }));
    const has = (...v: (string | number | undefined)[]) => v.some((x) => x != null && String(x).toLowerCase().includes(s));
    const out: { href: string; title: string; sub: string }[] = [];
    getAll("biens").forEach((b) => has(b.titre, b.adresse, b.ref, b.quartier, b.ville) && out.push({ href: `/biens/${b.id}`, title: b.titre || b.adresse, sub: `Bien · ${b.adresse}` }));
    getAll("contacts").forEach((c) => has(c.nom, c.prenom, c.email, c.tel) && out.push({ href: `/contacts/${c.id}`, title: nomComplet(c), sub: `Contact · ${c.tel ?? c.email ?? ""}` }));
    getAll("estimations").forEach((e) => has(e.adresse, e.ville) && out.push({ href: `/estimations/${e.id}`, title: e.adresse, sub: "Estimation" }));
    NAV.forEach((n) => has(n.label) && out.push({ href: n.href, title: n.label, sub: "Page" }));
    return out.slice(0, 30);
  }, [q]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg card overflow-hidden animate-fade-up" onClick={(e) => e.stopPropagation()}>
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
          <button onClick={onClose} className="btn-ghost btn-sm !px-2">
            <X size={16} />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {results.map((r) => (
            <li key={r.href + r.title}>
              <Link href={r.href} onClick={onClose} className="block rounded-xl px-3 py-2.5 hover:bg-surface-2">
                <div className="text-sm font-medium">{r.title}</div>
                <div className="text-xs text-muted truncate">{r.sub}</div>
              </Link>
            </li>
          ))}
          {!results.length && <li className="px-3 py-6 text-center text-sm text-muted">Aucun résultat</li>}
        </ul>
      </div>
    </div>
  );
}
