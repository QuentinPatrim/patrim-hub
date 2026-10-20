"use client";

import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  UserPlus,
  Calculator,
  CheckCircle2,
  Circle,
  Download,
  ListChecks,
  MoonStar,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Spinner, cx } from "@/components/ui";
import { ask } from "@/lib/ai";
import { analyser, resumeCourt } from "@/lib/briefing";
import { ETAPE, dateLongue, eurK, today } from "@/lib/format";
import { ACQUEREUR_ACTIF, BIEN_DISPONIBLE } from "@/lib/matching";
import { create, getAll, useCollection } from "@/lib/store";
import { Aujourdhui, aRappeler, delaiChoisi } from "@/components/accueil/Aujourdhui";
import { honorairesPotentiels } from "@/components/chiffres/chiffres";
import type { Briefing, EtapeAcquereur } from "@/lib/types";
import { useMoi } from "@/lib/equipe";
import { locationDe } from "@/components/location/bienLocation";

const LIEN: Record<string, string> = { bien: "/biens/", contact: "/contacts/", estimation: "/estimations/", rdv: "/agenda?rdv=", page: "/" };
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
  const moi = useMoi();
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const { items: rdvs } = useCollection("rdvs");
  const { items: taches, update: majTache, create: nouvelleTache } = useCollection("taches");
  const { items: briefings } = useCollection("briefings");
  const { items: estimations } = useCollection("estimations");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const jour = today();
  const enVente = biens.filter(BIEN_DISPONIBLE);
  const valeur = enVente.reduce((s, b) => s + (b.prix ?? 0), 0);
  const aLouer = biens.filter((b) => locationDe(b)?.statut === "a_louer").length;
  const honoraires = honorairesPotentiels(biens, jour);
  const acquereurs = contacts.filter(ACQUEREUR_ACTIF);
  const semaine = useMemo(() => {
    const now = Date.now();
    return rdvs.filter((r) => r.statut !== "annule" && new Date(r.debut).getTime() >= now - 3600e3 && new Date(r.debut).getTime() < now + 7 * 86400e3);
  }, [rdvs]);
  const rdvJour = rdvs
    .filter((r) => r.statut !== "annule" && new Date(r.debut).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) === jour)
    .sort((a, b) => a.debut.localeCompare(b.debut));
  const aFaire = taches.filter((t) => !t.fait).sort((a, b) => (a.priorite ?? 3) - (b.priorite ?? 3) || (a.echeance ?? "9").localeCompare(b.echeance ?? "9"));
  const tachesFaites = taches.filter((t) => t.fait).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const relances = mounted ? aRappeler(contacts, delaiChoisi()) : [];
  const brief = [...briefings].sort((a, b) => b.date.localeCompare(a.date))[0];
  const pipeline = (["nouveau", "qualifie", "visite", "offre", "compromis"] as EtapeAcquereur[]).map((e) => ({ e, n: acquereurs.filter((c) => (c.etape ?? "nouveau") === e).length }));
  const maxPipe = Math.max(1, ...pipeline.map((p) => p.n));
  const [tacheTxt, setTacheTxt] = useState("");

  if (!mounted)
    return (
      <div className="space-y-5">
        <div className="skeleton h-56 sm:h-64 !rounded-3xl" />
        <div className="grid grid-cols-4 gap-2 sm:gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[88px] !rounded-2xl" />)}</div>
        <div className="skeleton h-40 !rounded-2xl" />
      </div>
    );

  const vide = !biens.length && !contacts.length;
  const chauds = acquereurs.filter((c) => c.chaleur === 3).length;
  const visites = semaine.filter((r) => r.type === "visite").length;
  const resumeJour = vide
    ? "Votre espace de vente est prêt. Commencez par vos mandats et vos contacts, le reste suivra."
    : [
        rdvJour.length ? `${rdvJour.length} rendez-vous aujourd'hui` : "Aucun rendez-vous aujourd'hui",
        relances.length ? `${relances.length} personne${relances.length > 1 ? "s" : ""} à rappeler` : null,
        aFaire.length ? `${aFaire.length} tâche${aFaire.length > 1 ? "s" : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
  const etapes = [
    { done: biens.length > 0, href: "/reglages", icon: Building2, titre: "Importer mes mandats", texte: "Vos biens PATRIM en un geste, depuis les Réglages." },
    { done: contacts.length > 0, href: "/contacts?nouveau=1", icon: Users, titre: "Ajouter un contact", texte: "Un acquéreur, un vendeur ou un prospect." },
    { done: rdvs.length > 0, href: "/agenda?nouveau=1", icon: CalendarDays, titre: "Planifier une visite", texte: "Le rendez-vous apparaîtra ici le jour venu." },
    { done: getAll("estimations").length > 0, href: "/estimations/nouvelle", icon: Calculator, titre: "Faire une estimation", texte: "Avec les ventes réelles du quartier." },
  ];
  const faites = etapes.filter((e) => e.done).length;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Bandeau d'accueil */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-[#561317] to-ink text-white shadow-lift animate-fade-up">
        <div aria-hidden className="arcades absolute inset-x-0 bottom-0 h-32 sm:h-40 opacity-[0.11] -z-10" />
        <div aria-hidden className="absolute -right-16 -top-24 size-72 rounded-full bg-coral/25 blur-3xl -z-10" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(120%_70%_at_0%_0%,rgba(255,255,255,.08),transparent_60%)] -z-10" />
        <div className="p-5 pt-6 sm:p-8">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65">
            <span className="h-px w-5 bg-coral" />
            <span className="first-letter:uppercase">{dateLongue(new Date().toISOString())}</span>
          </div>
          <h1 className="mt-3 font-serif text-[34px] sm:text-[44px] leading-[1.05] font-semibold tracking-[-0.02em]">
            {salut()} {moi.prenom}
          </h1>
          <p className="mt-2.5 max-w-xl text-sm sm:text-[15px] leading-relaxed text-white/75 text-pretty">{resumeJour}</p>

          {vide ? (
            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <Link href="/reglages" className="btn h-11 bg-white text-brand hover:bg-white/90 shadow-[0_8px_24px_-8px_rgba(0,0,0,.5)]">
                <Download size={17} /> Importer mes mandats
              </Link>
              <Link href="/contacts?nouveau=1" className="btn h-11 bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/15 backdrop-blur">
                <UserPlus size={17} /> Ajouter un contact
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
              <HeroFig href="/biens" label="Biens en vente" value={enVente.length} hint={aLouer ? `${aLouer} à louer en plus` : valeur ? `${eurK(valeur)} en portefeuille` : "Aucun mandat actif"} />
              <HeroFig href="/chiffres" label="Honoraires potentiels" value={eurK(honoraires)} hint="Voir mes chiffres" />
              <HeroFig href="/contacts" label="Acquéreurs actifs" value={acquereurs.length} hint={`${chauds} chaud${chauds > 1 ? "s" : ""}`} />
              <HeroFig href="/agenda" label="Rendez-vous à 7 jours" value={semaine.length} hint={`${visites} visite${visites > 1 ? "s" : ""}`} />
            </div>
          )}
        </div>
      </section>

      <InstallBanner />

      {faites < etapes.length && (biens.length === 0 || contacts.length === 0) && (
        <section className="card overflow-hidden animate-fade-up">
          <div className="flex items-end justify-between gap-3 px-4 sm:px-5 pt-5">
            <div>
              <div className="eyebrow">Bien démarrer</div>
              <h2 className="mt-1 font-serif text-xl font-semibold tracking-tight">Votre espace en 4 étapes</h2>
            </div>
            <div className="shrink-0 text-xs font-semibold text-muted tabular-nums">{faites} sur {etapes.length}</div>
          </div>
          <div className="mx-4 sm:mx-5 mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-coral transition-all duration-700" style={{ width: `${Math.max(4, (faites / etapes.length) * 100)}%` }} />
          </div>
          <ol className="mt-3 p-2 sm:p-3 grid gap-1 sm:grid-cols-2">
            {etapes.map(({ done, href, icon: Icon, titre, texte }, i) => (
              <li key={titre}>
                <Link href={href} className={cx("group flex items-center gap-3 rounded-2xl p-2.5 sm:p-3 transition hover:bg-surface-2", !done && i === etapes.findIndex((e) => !e.done) && "bg-accent/[0.05] ring-1 ring-inset ring-accent/15")}>
                  <span className={cx("grid place-items-center size-11 shrink-0 rounded-xl transition", done ? "bg-ok/10 text-ok" : "bg-gradient-to-b from-brand-light to-brand text-white shadow-btn")}>
                    {done ? <CheckCircle2 size={20} /> : <Icon size={19} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block text-sm font-semibold", done && "text-muted line-through decoration-muted/50")}>{titre}</span>
                    <span className="block text-xs text-muted leading-snug">{texte}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-fg" />
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Raccourcis */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 animate-fade-up [animation-delay:60ms]">
        {[
          { href: "/contacts?nouveau=1", label: "Contact", icon: UserPlus },
          { href: "/agenda?nouveau=1", label: "Visite", icon: CalendarPlus },
          { href: "/estimations/nouvelle", label: "Estimer", icon: Calculator },
          { href: "/a-regler", label: "À régler", icon: ListChecks },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="card card-hover group min-w-0 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 py-3.5 sm:p-4 text-[11.5px] sm:text-sm font-semibold active:scale-[.97]">
            <span className="grid place-items-center size-10 sm:size-11 rounded-2xl bg-accent/[0.08] text-accent ring-1 ring-inset ring-accent/10 transition group-hover:bg-gradient-to-b group-hover:from-brand-light group-hover:to-brand group-hover:text-white">
              <Icon size={19} />
            </span>
            <span className="truncate max-w-full px-1">{label}</span>
          </Link>
        ))}
      </div>

      <BriefingCard brief={brief} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
        <div className="lg:col-span-3 space-y-4 sm:space-y-5 min-w-0">
          <Aujourdhui biens={biens} contacts={contacts} rdvs={rdvs} estimations={estimations} />

          <Card title={<span className="flex items-center gap-2">Tâches{aFaire.length > 0 && <span className="grid place-items-center min-w-5 h-5 px-1.5 rounded-full bg-accent/10 text-accent text-[11px] tabular-nums">{aFaire.length}</span>}</span>}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!tacheTxt.trim()) return;
                nouvelleTache({ titre: tacheTxt.trim(), fait: false, origine: "moi", echeance: jour });
                setTacheTxt("");
              }}
              className="flex gap-2 mb-2"
            >
              <input className="input" placeholder="Ajouter une tâche…" value={tacheTxt} onChange={(e) => setTacheTxt(e.target.value)} />
              <button className="btn-secondary !px-3 shrink-0" aria-label="Ajouter"><Plus size={16} /></button>
            </form>
            {aFaire.length ? (
              <ul className="-mx-2">
                {aFaire.slice(0, 10).map((t) => (
                  <li key={t.id} className="group flex items-start gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2 transition">
                    <button onClick={() => majTache(t.id, { fait: true })} className="mt-px shrink-0 text-line hover:text-ok transition" aria-label="Marquer comme faite">
                      <Circle size={20} strokeWidth={1.8} className="text-muted/60 group-hover:text-ok" />
                    </button>
                    <div className="min-w-0 flex-1">
                      {t.lien ? (
                        <Link href={LIEN[t.lien.kind] + t.lien.id} className="text-sm font-medium hover:underline">{t.titre}</Link>
                      ) : (
                        <span className="text-sm font-medium">{t.titre}</span>
                      )}
                      {t.detail && <div className="mt-0.5 text-xs text-muted line-clamp-2">{t.detail}</div>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {t.origine === "agent" && <Badge tone="info"><MoonStar size={11} /> Agent</Badge>}
                      {t.echeance && t.echeance < jour && <Badge tone="danger">En retard</Badge>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-1 pt-2 text-sm text-muted"><CheckCircle2 size={17} className="text-ok" /> Tout est fait, beau travail.</p>
            )}
            {tachesFaites.length > 0 && (
              <details className="mt-2 rounded-xl border border-line px-2">
                <summary className="cursor-pointer list-none py-2 text-xs text-muted select-none">
                  {tachesFaites.length} tâche{tachesFaites.length > 1 ? "s" : ""} faite{tachesFaites.length > 1 ? "s" : ""} · archivée{tachesFaites.length > 1 ? "s" : ""}
                </summary>
                <ul className="-mx-2 pb-2">
                  {tachesFaites.slice(0, 20).map((t) => (
                    <li key={t.id} className="flex items-start gap-3 rounded-xl px-2 py-2">
                      <CheckCircle2 size={20} strokeWidth={1.8} className="mt-px shrink-0 text-ok/70" />
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-muted line-through">{t.titre}</span>
                      </div>
                      <button onClick={() => majTache(t.id, { fait: false })} className="btn-ghost btn-sm shrink-0 text-muted" aria-label="Remettre à faire">Remettre</button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4 sm:space-y-5 min-w-0">
          <Card title="Pipeline acquéreurs" action={acquereurs.length > 0 && <span className="text-xs font-semibold text-muted tabular-nums">{acquereurs.length} actif{acquereurs.length > 1 ? "s" : ""}</span>}>
            {acquereurs.length ? (
              <div className="space-y-3">
                {pipeline.map(({ e, n }) => (
                  <div key={e} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 font-medium text-muted">{ETAPE[e].label}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand to-coral transition-all duration-700" style={{ width: `${n ? Math.max(6, (n / maxPipe) * 100) : 0}%` }} />
                    </div>
                    <span className="w-6 text-right font-semibold tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            ) : (
              <MiniEmpty icon={<Users size={17} />} text="Ajoutez vos acquéreurs pour suivre leur avancement." href="/contacts?nouveau=1" cta="Ajouter un acquéreur" />
            )}
          </Card>

          <Card title="Mandats en vente" action={enVente.length > 0 && <Link href="/biens" className="link">Tous <ChevronRight size={14} /></Link>}>
            {enVente.length ? (
              <ul className="-mx-2">
                {enVente.slice(0, 5).map((b) => (
                  <li key={b.id}>
                    <Link href={`/biens/${b.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2 transition">
                      <div className="size-12 shrink-0 rounded-xl bg-gradient-to-br from-brand to-ink bg-cover bg-center grid place-items-center text-white/80 ring-1 ring-inset ring-black/5" style={b.photos?.[0] ? { backgroundImage: `url(${b.photos[0]})` } : undefined}>
                        {!b.photos?.[0] && <Building2 size={17} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{b.titre || b.adresse}</div>
                        <div className="text-xs text-muted truncate">{b.quartier || b.ville}</div>
                      </div>
                      <div className="font-serif text-[15px] font-semibold tabular-nums">{eurK(b.prix)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <MiniEmpty icon={<Building2 size={17} />} text="Aucun bien en vente pour l'instant." href={biens.length ? "/biens/nouveau" : "/reglages"} cta={biens.length ? "Ajouter un bien" : "Importer mes mandats"} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function HeroFig({ href, label, value, hint }: { href: string; label: string; value: React.ReactNode; hint: string }) {
  return (
    <Link href={href} className="group min-w-0 rounded-2xl bg-white/[0.07] ring-1 ring-inset ring-white/10 backdrop-blur-sm p-3 sm:p-4 transition hover:bg-white/[0.11]">
      <div className="text-[11px] font-medium text-white/60 truncate">{label}</div>
      <div className="mt-1.5 font-serif text-[26px] sm:text-[30px] leading-none font-semibold tabular-nums truncate">{value}</div>
      <div className="mt-1.5 text-[11px] text-white/55 truncate">{hint}</div>
    </Link>
  );
}

function MiniEmpty({ icon, text, href, cta }: { icon: React.ReactNode; text: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line bg-surface-2/40 p-3">
      <span className="grid place-items-center size-10 shrink-0 rounded-xl bg-surface text-muted ring-1 ring-inset ring-line/80">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted leading-snug">{text}</p>
        {href && cta && (
          <Link href={href} className="link mt-0.5">
            {cta} <ArrowRight size={13} />
          </Link>
        )}
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
    const d = { biens: getAll("biens"), contacts: getAll("contacts"), rdvs: getAll("rdvs"), estimations: getAll("estimations"), taches: getAll("taches") };
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
    <section className="relative overflow-hidden rounded-2xl bg-ink text-white shadow-card ring-1 ring-inset ring-white/[0.06] animate-fade-up [animation-delay:90ms]">
      <div className="absolute inset-0 bg-[radial-gradient(110%_90%_at_100%_0%,rgba(108,25,30,.7),transparent_60%)]" />
      <div className="absolute left-0 top-5 bottom-5 w-[3px] rounded-r-full bg-coral/80" />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
            <span className="grid place-items-center size-7 rounded-lg bg-white/10"><MoonStar size={14} /></span> Briefing {frais ? "du matin" : brief ? `du ${brief.date.split("-").reverse().slice(0, 2).join("/")}` : ""}
          </div>
          <button onClick={lancer} disabled={busy} className="btn-sm btn shrink-0 bg-white/10 hover:bg-white/20 text-white ring-1 ring-inset ring-white/10">
            {busy ? <Spinner /> : <Sparkles size={14} />} {frais ? "Actualiser" : "Lancer l'analyse"}
          </button>
        </div>
        <p className="mt-4 font-serif text-[19px] sm:text-[22px] leading-snug text-white/95 text-pretty">
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
    <div className="card card-pad flex flex-wrap sm:flex-nowrap items-center gap-3 animate-fade-up">
      <span className="grid place-items-center size-10 rounded-xl bg-accent/10 text-accent shrink-0"><Download size={18} /></span>
      <div className="flex-1 min-w-[180px] text-sm">
        <div className="font-medium">Installer PATRIM sur votre téléphone</div>
        <div className="text-xs text-muted">{ios ? "Dans Safari : bouton Partager, puis « Sur l'écran d'accueil »." : "Accès direct depuis l'écran d'accueil, comme une vraie appli."}</div>
      </div>
      {evt?.prompt && <button onClick={() => evt.prompt?.()} className="btn-primary btn-sm">Installer</button>}
      <button onClick={close} className="btn-ghost btn-sm">Plus tard</button>
    </div>
  );
}
