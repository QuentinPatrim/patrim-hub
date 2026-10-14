"use client";

import {
  ArrowRight,
  Building2,
  CalendarDays,
  Calculator,
  CheckCircle2,
  Circle,
  Download,
  MoonStar,
  Phone,
  Plus,
  Sparkles,
  Users,
  Wand2,
  Euro,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Empty, Spinner, Stat, cx } from "@/components/ui";
import { ask } from "@/lib/ai";
import { analyser, resumeCourt } from "@/lib/briefing";
import { ETAPE, RDV_TYPE, dateLongue, eur, eurK, heure, nomComplet, today } from "@/lib/format";
import { ACQUEREUR_ACTIF, BIEN_DISPONIBLE } from "@/lib/matching";
import { create, getAll, useCollection } from "@/lib/store";
import type { Briefing, EtapeAcquereur } from "@/lib/types";

const LIEN: Record<string, string> = { bien: "/biens/", contact: "/contacts/", estimation: "/estimations/", rdv: "/agenda?rdv=" };
const TYPE_POINT: Record<Briefing["points"][number]["type"], { label: string; tone: "info" | "ok" | "warn" | "danger" | "brand" | "neutral" }> = {
  relance: { label: "Relance", tone: "warn" },
  matching: { label: "À proposer", tone: "ok" },
  mandat: { label: "Mandat", tone: "brand" },
  marketing: { label: "Marketing", tone: "info" },
  alerte: { label: "À vérifier", tone: "danger" },
  idee: { label: "Idée", tone: "neutral" },
};

function salut() {
  const h = Number(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", timeZone: "Europe/Paris" }).slice(0, 2));
  return h < 6 ? "Bonne nuit" : h < 18 ? "Bonjour" : "Bonsoir";
}

export default function Accueil() {
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const { items: rdvs } = useCollection("rdvs");
  const { items: taches, update: majTache, create: nouvelleTache } = useCollection("taches");
  const { items: briefings } = useCollection("briefings");
  useCollection("estimations");
  useCollection("contenus");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const jour = today();
  const enVente = biens.filter(BIEN_DISPONIBLE);
  const valeur = enVente.reduce((s, b) => s + (b.prix ?? 0), 0);
  const honoraires = biens.filter((b) => ["en_vente", "mandat_signe", "sous_offre", "compromis"].includes(b.statut)).reduce((s, b) => s + (b.honoraires ?? 0), 0);
  const acquereurs = contacts.filter(ACQUEREUR_ACTIF);
  const semaine = useMemo(() => {
    const now = Date.now();
    return rdvs.filter((r) => r.statut !== "annule" && new Date(r.debut).getTime() >= now - 3600e3 && new Date(r.debut).getTime() < now + 7 * 86400e3);
  }, [rdvs]);
  const rdvJour = rdvs
    .filter((r) => r.statut !== "annule" && new Date(r.debut).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) === jour)
    .sort((a, b) => a.debut.localeCompare(b.debut));
  const aFaire = taches.filter((t) => !t.fait).sort((a, b) => (a.priorite ?? 3) - (b.priorite ?? 3) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9"));
  const relances = contacts.filter((c) => c.dateRelance && c.dateRelance <= jour && c.etape !== "perdu" && c.etape !== "gagne");
  const brief = [...briefings].sort((a, b) => b.date.localeCompare(a.date))[0];
  const pipeline = (["nouveau", "qualifie", "visite", "offre", "compromis"] as EtapeAcquereur[]).map((e) => ({ e, n: acquereurs.filter((c) => (c.etape ?? "nouveau") === e).length }));
  const maxPipe = Math.max(1, ...pipeline.map((p) => p.n));
  const [tacheTxt, setTacheTxt] = useState("");

  if (!mounted) return <div className="space-y-4"><div className="skeleton h-10 w-64" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}</div></div>;

  const vide = !biens.length && !contacts.length;

  return (
    <div className="space-y-6">
      <div className="animate-fade-up flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">{dateLongue(new Date().toISOString())}</p>
        <h1 className="h-title">{salut()} Quentin</h1>
      </div>

      <InstallBanner />

      {vide && (
        <Card>
          <Empty
            icon={<Building2 size={22} />}
            title="Bienvenue dans PATRIM Hub"
            text="Commencez par importer vos mandats et vos contacts depuis les Réglages, ou ajoutez votre premier bien."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/reglages" className="btn-primary">Importer mes données</Link>
                <Link href="/biens/nouveau" className="btn-secondary">Ajouter un bien</Link>
              </div>
            }
          />
        </Card>
      )}

      {/* Raccourcis */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { href: "/contacts?nouveau=1", label: "Contact", icon: Users },
          { href: "/agenda?nouveau=1", label: "Visite", icon: CalendarDays },
          { href: "/estimations/nouvelle", label: "Estimer", icon: Calculator },
          { href: "/studio", label: "Studio", icon: Wand2 },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="card min-w-0 flex flex-col items-center gap-2 py-3.5 text-[11px] sm:text-xs font-medium hover:shadow-glow transition">
            <span className="grid place-items-center size-10 rounded-xl bg-brand text-white">
              <Icon size={19} />
            </span>
            <span className="flex items-center gap-0.5 truncate"><Plus size={11} className="hidden sm:block" />{label}</span>
          </Link>
        ))}
      </div>

      <BriefingCard brief={brief} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Biens en vente" value={enVente.length} hint={valeur ? `${eurK(valeur)} en portefeuille` : "Aucun mandat actif"} icon={<Building2 size={16} />} />
        <Stat label="Honoraires potentiels" value={eurK(honoraires)} hint="Mandats actifs, offres et compromis" icon={<Euro size={16} />} tone="ok" />
        <Stat label="Acquéreurs actifs" value={acquereurs.length} hint={(() => { const n = acquereurs.filter((c) => c.chaleur === 3).length; return `${n} chaud${n > 1 ? "s" : ""}`; })()} icon={<Users size={16} />} />
        <Stat label="Rendez-vous à 7 jours" value={semaine.length} hint={(() => { const n = semaine.filter((r) => r.type === "visite").length; return `${n} visite${n > 1 ? "s" : ""}`; })()} icon={<CalendarDays size={16} />} tone="warn" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 space-y-4">
          <Card title="Aujourd'hui" action={<Link href="/agenda" className="text-xs text-accent font-medium">Agenda</Link>}>
            {rdvJour.length ? (
              <ul className="divide-y divide-line -my-2">
                {rdvJour.map((r) => {
                  const b = biens.find((x) => x.id === r.bienId);
                  const c = contacts.find((x) => r.contactIds?.includes(x.id));
                  return (
                    <li key={r.id} className="flex items-center gap-3 py-3">
                      <div className="w-14 text-sm font-semibold tabular-nums">{heure(r.debut)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{r.titre || RDV_TYPE[r.type]}{c ? ` · ${nomComplet(c)}` : ""}</div>
                        <div className="text-xs text-muted truncate">{b?.adresse ?? r.lieu ?? ""}</div>
                      </div>
                      {c?.tel && (
                        <a href={`tel:${c.tel}`} className="btn-ghost btn-sm !px-2" aria-label="Appeler">
                          <Phone size={15} />
                        </a>
                      )}
                      <Badge tone={r.type === "visite" ? "brand" : "neutral"}>{RDV_TYPE[r.type]}</Badge>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucun rendez-vous aujourd&apos;hui.</p>
            )}
          </Card>

          <Card title={`Tâches${aFaire.length ? ` · ${aFaire.length}` : ""}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!tacheTxt.trim()) return;
                nouvelleTache({ titre: tacheTxt.trim(), fait: false, origine: "moi", echeance: jour });
                setTacheTxt("");
              }}
              className="flex gap-2 mb-3"
            >
              <input className="input" placeholder="Ajouter une tâche…" value={tacheTxt} onChange={(e) => setTacheTxt(e.target.value)} />
              <button className="btn-secondary !px-3" aria-label="Ajouter"><Plus size={16} /></button>
            </form>
            {aFaire.length ? (
              <ul className="space-y-1">
                {aFaire.slice(0, 10).map((t) => (
                  <li key={t.id} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-surface-2">
                    <button onClick={() => majTache(t.id, { fait: true })} className="mt-0.5 text-muted hover:text-ok" aria-label="Marquer comme faite">
                      <Circle size={18} />
                    </button>
                    <div className="min-w-0 flex-1">
                      {t.lien ? (
                        <Link href={LIEN[t.lien.kind] + t.lien.id} className="text-sm hover:underline">{t.titre}</Link>
                      ) : (
                        <span className="text-sm">{t.titre}</span>
                      )}
                      {t.detail && <div className="text-xs text-muted line-clamp-2">{t.detail}</div>}
                    </div>
                    {t.origine === "agent" && <Badge tone="info"><MoonStar size={11} /> Agent</Badge>}
                    {t.echeance && t.echeance < jour && <Badge tone="danger">En retard</Badge>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 size={16} className="text-ok" /> Tout est fait.</p>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card title={`À relancer${relances.length ? ` · ${relances.length}` : ""}`} action={<Link href="/contacts" className="text-xs text-accent font-medium">Contacts</Link>}>
            {relances.length ? (
              <ul className="space-y-2">
                {relances.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{nomComplet(c)}</div>
                      <div className="text-xs text-muted truncate">{c.prochaineAction || (c.criteres?.budgetMax ? `Budget ${eur(c.criteres.budgetMax)}` : "Relance prévue")}</div>
                    </Link>
                    {c.tel && <a href={`tel:${c.tel}`} className="btn-secondary btn-sm !px-2" aria-label="Appeler"><Phone size={14} /></a>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Personne à relancer aujourd&apos;hui.</p>
            )}
          </Card>

          <Card title="Pipeline acquéreurs">
            <div className="space-y-2.5">
              {pipeline.map(({ e, n }) => (
                <div key={e} className="flex items-center gap-3 text-xs">
                  <span className="w-20 text-muted">{ETAPE[e].label}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-coral transition-all" style={{ width: `${(n / maxPipe) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right font-semibold tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Mandats en vente" action={<Link href="/biens" className="text-xs text-accent font-medium">Tous</Link>}>
            {enVente.length ? (
              <ul className="space-y-2">
                {enVente.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    <Link href={`/biens/${b.id}`} className="flex items-center gap-3 rounded-xl p-1.5 -mx-1.5 hover:bg-surface-2">
                      <div className="size-11 shrink-0 rounded-lg bg-surface-2 bg-cover bg-center grid place-items-center text-muted" style={b.photos?.[0] ? { backgroundImage: `url(${b.photos[0]})` } : undefined}>
                        {!b.photos?.[0] && <Building2 size={16} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{b.titre || b.adresse}</div>
                        <div className="text-xs text-muted truncate">{b.quartier || b.ville}</div>
                      </div>
                      <div className="text-sm font-semibold tabular-nums">{eurK(b.prix)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucun bien en vente.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function BriefingCard({ brief }: { brief?: Briefing }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(false);
  const jour = today();
  const frais = brief?.date === jour;

  async function lancer() {
    setBusy(true);
    setErr("");
    const d = { biens: getAll("biens"), contacts: getAll("contacts"), rdvs: getAll("rdvs"), estimations: getAll("estimations"), taches: getAll("taches"), contenus: getAll("contenus") };
    const a = analyser(d);
    let resume = resumeCourt(a);
    if (a.points.length) {
      try {
        const r = await ask({ effort: "low", maxTokens: 600, prompt: `Voici les points détectés dans mon portefeuille ce jour :\n${a.points.map((p) => `- ${p.titre}${p.detail ? ` (${p.detail})` : ""}`).join("\n")}\n\nÉcris-moi en 2 ou 3 phrases mes priorités du jour, dans l'ordre, en me tutoyant. Pas de liste, pas de titre.` });
        if (r.text) resume = r.text;
      } catch {
        /* sans IA, on garde le résumé automatique */
      }
    }
    a.nouvellesTaches.forEach((t) => create("taches", t));
    create("briefings", { date: jour, resume, points: a.points });
    setOpen(true);
    setBusy(false);
  }

  return (
    <section className="relative overflow-hidden rounded-2xl bg-ink text-white shadow-card">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_100%_0%,rgba(108,25,30,.75),transparent_60%)]" />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/60">
            <MoonStar size={14} /> Briefing {frais ? "du matin" : brief ? `du ${brief.date.split("-").reverse().slice(0, 2).join("/")}` : ""}
          </div>
          <button onClick={lancer} disabled={busy} className="btn-sm btn bg-white/10 hover:bg-white/20 text-white">
            {busy ? <Spinner /> : <Sparkles size={14} />} {frais ? "Actualiser" : "Lancer l'analyse"}
          </button>
        </div>
        <p className="mt-3 font-serif text-lg sm:text-xl leading-snug text-white/95">
          {brief ? brief.resume : "Chaque nuit, l'agent analyse vos biens, contacts et visites, puis prépare ici vos priorités du jour."}
        </p>
        {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
        {brief && brief.points.length > 0 && (
          <>
            <ul className={cx("mt-4 space-y-2", !open && "max-h-[150px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]")}>
              {brief.points.map((p, i) => (
                <li key={i} className="rounded-xl bg-white/[0.06] px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <Badge tone={TYPE_POINT[p.type].tone} className="!bg-white/10 !text-white/80 !border-white/10 shrink-0">{TYPE_POINT[p.type].label}</Badge>
                    {p.lien && LIEN[p.lien.kind] ? (
                      <Link href={LIEN[p.lien.kind] + p.lien.id} className="text-sm text-white/90 hover:underline flex-1">{p.titre}</Link>
                    ) : (
                      <span className="text-sm text-white/90 flex-1">{p.titre}</span>
                    )}
                    {p.lien && <ArrowRight size={14} className="mt-0.5 text-white/40 shrink-0" />}
                  </div>
                  {p.detail && <p className="mt-1 text-xs text-white/55 whitespace-pre-line">{p.detail}</p>}
                </li>
              ))}
            </ul>
            {brief.points.length > 2 && (
              <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-white/60 hover:text-white">
                {open ? "Réduire" : `Voir les ${brief.points.length} points`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Invite à installer l'appli sur l'écran d'accueil du téléphone. */
function InstallBanner() {
  const [evt, setEvt] = useState<Event & { prompt?: () => void } | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("patrim-hub:install-dismissed") === "1";
    } catch {}
    if (standalone || dismissed) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos);
    if (isIos) setHidden(false);
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as Event & { prompt?: () => void });
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem("patrim-hub:install-dismissed", "1");
    } catch {}
  };
  return (
    <div className="card card-pad flex items-center gap-3 animate-fade-up">
      <span className="grid place-items-center size-10 rounded-xl bg-accent/10 text-accent shrink-0"><Download size={18} /></span>
      <div className="flex-1 text-sm">
        <div className="font-medium">Installer PATRIM sur votre téléphone</div>
        <div className="text-xs text-muted">{ios ? "Dans Safari : bouton Partager, puis « Sur l'écran d'accueil »." : "Accès direct depuis l'écran d'accueil, comme une vraie appli."}</div>
      </div>
      {evt?.prompt && <button onClick={() => evt.prompt?.()} className="btn-primary btn-sm">Installer</button>}
      <button onClick={close} className="btn-ghost btn-sm">Plus tard</button>
    </div>
  );
}
