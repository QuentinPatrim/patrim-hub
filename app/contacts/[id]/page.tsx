"use client";

import {
  AlarmClock,
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Home,
  Mail,
  MapPin,
  MessageSquareText,
  NotebookPen,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { PickChip, QuickActions, Toggle } from "@/components/contacts/bits";
import { CriteresEditor, NumInput } from "@/components/contacts/CriteresEditor";
import { ETAPES, etapeDe, etapeLabel, HISTO_LABEL, type HistoType, relanceEnRetard, ROLES, SOURCES, telAffiche, vientDEtreCree } from "@/components/contacts/helpers";
import { MessageAssistant, type Objectif } from "@/components/contacts/MessageAssistant";
import { Avatar, Badge, Card, cx, Empty, Field, Sheet } from "@/components/ui";
import { addDays, dateCourte, dateLongue, ETAPE, eur, heure, ilya, initiales, m2, nomComplet, RDV_TYPE, ROLE, SOURCE, STATUT_BIEN, today, TYPE_BIEN } from "@/lib/format";
import { BIEN_DISPONIBLE, matchScore, niveauMatch, topMatches } from "@/lib/matching";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { titrePublic } from "@/lib/titrePublic";
import { marquerPropose } from "@/components/biens/AcquereursCompatibles";
import { mapsHref, texteProposition } from "@/components/biens/utils";
import { dateLettres, ne, type ContactEtatCivil } from "@/components/offre/offre";
import { useCollection, useDoc } from "@/lib/store";
import type { Bien, Contact, ContactRole, Criteres, EtapeAcquereur, Rdv, Source } from "@/lib/types";

type Section = "suivi" | "recherche" | "biens";

/** Sauvegarde différée : l'état local s'affiche tout de suite, le store est mis à jour après une courte pause. */
function useDebounced<T>(initial: T, save: (v: T) => void, delay = 500) {
  const [v, setV] = useState<T>(initial);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ v: T; dirty: boolean }>({ v: initial, dirty: false });
  const saveRef = useRef(save);
  saveRef.current = save;
  const set = (nv: T) => {
    setV(nv);
    latest.current = { v: nv, dirty: true };
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      saveRef.current(nv);
      latest.current.dirty = false;
    }, delay);
  };
  useEffect(
    () => () => {
      if (t.current) clearTimeout(t.current);
      if (latest.current.dirty) saveRef.current(latest.current.v);
    },
    []
  );
  return [v, set] as const;
}

export default function ContactPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: c, update, remove } = useDoc("contacts", id);
  const { items: all } = useCollection("contacts");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 600);
    return () => clearTimeout(t);
  }, []);

  if (!c) {
    if (!ready && !all.length)
      return (
        <div className="space-y-3">
          <div className="skeleton h-5 w-24" />
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="skeleton h-64 w-full rounded-2xl" />
        </div>
      );
    return (
      <div className="card">
        <Empty
          icon={<UserRound size={22} />}
          title="Contact introuvable"
          text="Il a peut-être été supprimé."
          action={
            <Link href="/contacts" className="btn-primary">
              Retour aux contacts
            </Link>
          }
        />
      </div>
    );
  }
  return <Fiche key={c.id} c={c} update={update} remove={remove} />;
}

function Fiche({ c, update, remove }: { c: Contact; update: (p: Partial<Contact>) => unknown; remove: () => unknown }) {
  const router = useRouter();
  const { items: biens } = useCollection("biens");
  const { items: rdvs } = useCollection("rdvs");
  const [section, setSection] = useState<Section>("suivi");
  const [edit, setEdit] = useState(false);
  const [msg, setMsg] = useState<{ objectif?: Objectif; bienId?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [brouillonBien, setBrouillonBien] = useState<Bien | null>(null);
  const [composerType, setComposerType] = useState<HistoType>("note");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const acq = c.roles?.includes("acquereur");
  const vend = c.roles?.includes("vendeur") || c.roles?.includes("prospect_vendeur");

  const matches = useMemo(() => (acq ? topMatches(biens.filter(BIEN_DISPONIBLE), (b) => matchScore(c, b), 55).slice(0, 8) : []), [acq, biens, c]);
  const proposes = useMemo(() => (c.biensProposes ?? []).map((bid) => biens.find((b) => b.id === bid)).filter((b): b is Bien => !!b), [c.biensProposes, biens]);
  const visites = useMemo(() => rdvs.filter((r) => r.contactIds?.includes(c.id)).sort((a, b) => b.debut.localeCompare(a.debut)), [rdvs, c.id]);
  const sesBiens = useMemo(() => biens.filter((b) => b.vendeurIds?.includes(c.id)), [biens, c.id]);
  const origine = biens.find((b) => b.id === c.bienOrigineId);

  const flash = (t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    if (vientDEtreCree(c.id)) flash("Fiche créée");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // État civil (repris dans les offres et les mandats) : « Née le 3 mars 1950 à Albi (81) · Retraitée »
  const ec = c as ContactEtatCivil;
  const naissance = ec.dateNaissance || ec.lieuNaissance ? [ne(ec), ec.dateNaissance && `le ${dateLettres(ec.dateNaissance)}`, ec.lieuNaissance && `à ${ec.lieuNaissance}`].filter(Boolean).join(" ") : "";
  const etatCivil = [naissance.replace(/^./, (x) => x.toUpperCase()), ec.profession].filter(Boolean).join(" · ");

  const addHisto = (type: HistoType, texte: string, extra?: Partial<Contact>) => {
    const now = new Date().toISOString();
    update({ historique: [{ date: now, type, texte }, ...(c.historique ?? [])], ...(type !== "note" ? { dernierContact: now } : {}), ...extra });
  };

  const setRelance = (d?: string) => update({ dateRelance: d });

  const supprimer = async () => {
    if (await remove()) router.replace("/contacts");
    else flash("Fiche créée depuis le compte d'un collègue : seul ce compte peut la supprimer");
  };

  const onQuick = (k: "appel" | "sms" | "whatsapp" | "mail") => {
    setComposerType(k === "appel" ? "appel" : k === "mail" ? "mail" : "sms");
    setSection("suivi");
    flash(k === "appel" ? "Pensez à noter le compte rendu de l'appel" : "Pensez à noter l'échange dans l'historique");
  };

  return (
    <div className="pb-4">
      {/* En-tête */}
      <div className="mb-3 flex items-center justify-between gap-2 animate-fade-up">
        <button onClick={() => (history.length > 1 ? router.back() : router.push("/contacts"))} className="btn-ghost btn-sm !h-10 -ml-2 text-muted">
          <ArrowLeft size={16} /> Contacts
        </button>
        <div className="flex gap-1">
          <button className="btn-ghost btn-sm !h-10" onClick={() => setEdit(true)}>
            <Pencil size={15} /> Modifier
          </button>
        </div>
      </div>

      <section className="card relative overflow-hidden mb-4 animate-fade-up">
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-br from-brand/15 via-accent/5 to-transparent" aria-hidden />
        <div className="relative p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <Avatar text={initiales(c)} className="size-16 text-lg shadow-glow" />
            <div className="min-w-0 flex-1 pt-1">
              <h1 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight leading-tight break-words">
                {c.civilite ? <span className="text-muted font-normal text-lg sm:text-xl mr-1.5">{c.civilite}</span> : null}
                {nomComplet(c)}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {(c.roles ?? []).map((r) => (
                  <Badge key={r} tone={r === "acquereur" ? "brand" : r === "vendeur" ? "ok" : "neutral"}>
                    {ROLE[r]}
                  </Badge>
                ))}
                {c.source && <Badge>{SOURCE[c.source]}</Badge>}
                {!c.optinTel && (
                  <Badge tone="warn">
                    <PhoneOff size={11} /> Pas d&apos;accord démarchage
                  </Badge>
                )}
              </div>
              <div className="mt-2 text-xs text-muted">
                Dernier échange : {ilya(c.dernierContact)} · fiche créée le {dateCourte(c.createdAt)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-1 text-sm sm:grid-cols-2">
            {c.tel && (
              <a href={`tel:${c.tel.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 h-9 text-fg/90 hover:text-accent">
                <Phone size={15} className="text-muted" /> {telAffiche(c.tel)}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-2 h-9 min-w-0 text-fg/90 hover:text-accent">
                <Mail size={15} className="text-muted shrink-0" /> <span className="truncate">{c.email}</span>
              </a>
            )}
            {c.adresse && (
              <a href={mapsHref(c.adresse)} target="_blank" rel="noreferrer" className="flex items-start gap-2 min-h-9 py-2 min-w-0 text-fg/90 hover:text-accent sm:col-span-2">
                <MapPin size={15} className="text-muted shrink-0 mt-0.5" /> <span>{c.adresse}</span>
              </a>
            )}
            {etatCivil && (
              <div className="flex items-start gap-2 min-h-9 py-2 text-fg/90 sm:col-span-2">
                <UserRound size={15} className="text-muted shrink-0 mt-0.5" /> <span>{etatCivil}</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <QuickActions contact={c} size="md" onAction={onQuick} />
            <button className="btn-primary !h-11 flex-1 sm:flex-none min-w-[180px]" onClick={() => setMsg({})}>
              <Sparkles size={16} /> Préparer un message
            </button>
          </div>

          {acq && (
            <div className="mt-4 border-t border-line pt-4 sm:max-w-xs">
              <span className="label">Étape</span>
              <select
                className="input"
                value={etapeDe(c) ?? ""}
                onChange={(e) => {
                  const e2 = e.target.value as EtapeAcquereur;
                  if (e2) addHisto("note", `Étape : ${etapeLabel(etapeDe(c))} → ${ETAPE[e2].label}`, { etape: e2 });
                }}
              >
                {!etapeDe(c) && <option value="">Sans étape</option>}
                {ETAPES.map((e) => (
                  <option key={e} value={e}>
                    {ETAPE[e].label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>

      <ProchaineAction c={c} update={update} setRelance={setRelance} addHisto={addHisto} />

      {/* Onglets de section (mobile) */}
      <div className="lg:hidden sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-4 px-4 py-2 mb-2 bg-bg/90 backdrop-blur-xl">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {(
            [
              ["suivi", "Suivi"],
              ["recherche", acq ? "Recherche" : "Profil"],
              ["biens", "Biens"],
            ] as const
          ).map(([s, label]) => (
            <button key={s} onClick={() => setSection(s)} className={cx("h-9 rounded-lg text-sm font-medium transition", section === s ? "bg-surface shadow-sm text-fg" : "text-muted")}>
              {label}
              {s === "biens" && acq && matches.length > 0 && <span className="ml-1 text-[11px] text-accent">{matches.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="space-y-4 min-w-0">
          <div className={cx("space-y-4", section !== "biens" && "hidden lg:block")}>
            {acq && (
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Target size={16} className="text-accent" /> Biens compatibles
                  </span>
                }
                action={<span className="text-xs text-muted">{matches.length ? `${matches.length} bien${matches.length > 1 ? "s" : ""}` : ""}</span>}
              >
                {!c.criteres || !Object.keys(c.criteres).length ? (
                  <p className="text-sm text-muted">Renseignez ses critères de recherche pour voir les biens qui lui correspondent.</p>
                ) : matches.length ? (
                  <ul className="space-y-2">
                    {matches.map((m) => (
                      <BienRow
                        key={m.item.id}
                        b={m.item}
                        score={m.score}
                        raisons={m.raisons}
                        ecarts={m.ecarts}
                        dejaPropose={(c.biensProposes ?? []).includes(m.item.id)}
                        onPropose={() => setMsg({ objectif: "proposition", bienId: m.item.id })}
                        onMail={() => setBrouillonBien(m.item)}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Aucun bien disponible ne correspond pour l&apos;instant. Les nouveaux mandats seront comparés automatiquement.</p>
                )}
              </Card>
            )}
            {(proposes.length > 0 || origine || acq) && (
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Send size={15} className="text-accent" /> Biens déjà proposés
                  </span>
                }
              >
                {origine && (
                  <Link href={`/biens/${origine.id}`} className="mb-3 flex items-center gap-3 rounded-xl bg-accent/5 border border-accent/15 px-3 py-2.5 hover:bg-accent/10">
                    <Home size={16} className="text-accent shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] uppercase tracking-wide text-accent font-semibold">Bien à l&apos;origine du contact</span>
                      <span className="block truncate text-sm font-medium">{origine.titre || origine.adresse}</span>
                    </span>
                    <span className="text-xs text-muted shrink-0">{eur(origine.prix)}</span>
                  </Link>
                )}
                {proposes.length ? (
                  <ul className="divide-y divide-line">
                    {proposes.map((b) => (
                      <li key={b.id} className="flex items-center gap-3 py-2">
                        <Link href={`/biens/${b.id}`} className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{b.titre || b.adresse}</div>
                          <div className="text-xs text-muted">
                            {[b.quartier || b.ville, eur(b.prix), STATUT_BIEN[b.statut].label].filter(Boolean).join(" · ")}
                          </div>
                        </Link>
                        <button className="grid place-items-center size-10 rounded-lg text-muted hover:bg-surface-2 hover:text-danger" aria-label="Retirer" onClick={() => update({ biensProposes: (c.biensProposes ?? []).filter((x) => x !== b.id) })}>
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !origine && <p className="text-sm text-muted">Aucun bien proposé pour l&apos;instant.</p>
                )}
              </Card>
            )}
            {vend && (
              <Card
                title={
                  <span className="flex items-center gap-2">
                    <Home size={15} className="text-accent" /> Ses biens
                  </span>
                }
              >
                {sesBiens.length ? (
                  <ul className="divide-y divide-line">
                    {sesBiens.map((b) => (
                      <li key={b.id}>
                        <Link href={`/biens/${b.id}`} className="flex items-center gap-3 py-2.5">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{b.titre || b.adresse}</span>
                            <span className="block text-xs text-muted">{b.adresse}</span>
                          </span>
                          <Badge tone={STATUT_BIEN[b.statut].tone}>{STATUT_BIEN[b.statut].label}</Badge>
                          <ChevronRight size={16} className="text-muted" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Aucun bien rattaché à ce vendeur. Rattachez-le depuis la fiche du bien.</p>
                )}
              </Card>
            )}
          </div>

          <div className={cx(section !== "suivi" && "hidden lg:block")}>
            <Historique c={c} addHisto={addHisto} update={update} type={composerType} setType={setComposerType} inputRef={composerRef} />
          </div>
        </div>

        <aside className="space-y-4 min-w-0">
          <div className={cx("space-y-4", section !== "recherche" && "hidden lg:block")}>
            {acq && <CriteresCard c={c} update={update} />}
            {acq && <FinancementCard c={c} update={update} />}
            <ConsentCard c={c} update={update} />
            <NotesCard c={c} update={update} />
          </div>
          <div className={cx(section !== "suivi" && "hidden lg:block")}>
            <VisitesCard visites={visites} biens={biens} />
          </div>
          <div className="hidden lg:block">
            <DangerZone
              onDelete={supprimer}
            />
          </div>
        </aside>
      </div>

      <div className={cx("mt-4 lg:hidden", section !== "recherche" && "hidden")}>
        <DangerZone
              onDelete={supprimer}
        />
      </div>

      <EditSheet open={edit} onClose={() => setEdit(false)} c={c} update={update} />
      {brouillonBien && (
        <BrouillonMail
          open
          onClose={() => setBrouillonBien(null)}
          titre="Proposer ce bien"
          to={c.email}
          tel={c.tel}
          sujet={`Un bien pour vous : ${titrePublic(brouillonBien)}`}
          corps={texteProposition(brouillonBien, c)}
          onPrepare={() => marquerPropose(brouillonBien, c)}
        />
      )}
      <MessageAssistant open={!!msg} onClose={() => setMsg(null)} contact={c} compatibles={matches.map((m) => m.item)} biens={biens} visites={visites} initial={msg ?? undefined} />

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-8 z-50 rounded-full bg-ink text-white text-sm px-4 py-2.5 shadow-2xl animate-fade-up flex items-center gap-2 max-w-[90vw]">
          <NotebookPen size={15} /> {toast}
        </div>
      )}
    </div>
  );
}

/* ---------- Prochaine action ---------- */

function ProchaineAction({ c, update, setRelance, addHisto }: { c: Contact; update: (p: Partial<Contact>) => unknown; setRelance: (d?: string) => void; addHisto: (t: HistoType, x: string, e?: Partial<Contact>) => void }) {
  const [action, setAction] = useDebounced(c.prochaineAction ?? "", (v) => update({ prochaineAction: v || undefined }));
  const retard = relanceEnRetard(c);
  const jour = c.dateRelance === today();
  const base = today();
  const raccourcis: [string, string][] = [
    ["+2 j", addDays(base, 2)],
    ["+7 j", addDays(base, 7)],
    ["+1 mois", addDays(base, 30)],
  ];
  return (
    <section className={cx("card mb-4 p-4 sm:p-5 animate-fade-up", retard && "border-danger/30")}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="h-section flex items-center gap-2">
          <AlarmClock size={16} className={retard ? "text-danger" : jour ? "text-warn" : "text-accent"} /> Prochaine action
        </h2>
        {c.dateRelance && (
          <span className={cx("text-xs font-semibold", retard ? "text-danger" : jour ? "text-warn" : "text-muted")}>
            {retard ? `En retard · ${dateCourte(c.dateRelance)}` : jour ? "Aujourd'hui" : dateLongue(c.dateRelance)}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <input className="input !h-11" value={action} onChange={(e) => setAction(e.target.value)} placeholder="ex. Rappeler pour fixer une visite" />
        <input type="date" className={cx("input !h-11", retard && "!border-danger/50 text-danger")} value={c.dateRelance ?? ""} onChange={(e) => setRelance(e.target.value || undefined)} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {raccourcis.map(([l, d]) => (
          <button key={l} className={cx("h-9 px-3 rounded-full border text-xs font-medium transition", c.dateRelance === d ? "bg-brand text-white border-brand" : "border-line bg-surface hover:border-accent/40")} onClick={() => setRelance(d)}>
            {l}
          </button>
        ))}
        {(c.prochaineAction || c.dateRelance) && (
          <button
            className="ml-auto h-9 px-3 rounded-full text-xs font-medium text-ok hover:bg-ok/10 flex items-center gap-1.5"
            onClick={() => {
              addHisto("note", `Fait : ${c.prochaineAction || "relance"}`, { prochaineAction: undefined, dateRelance: addDays(base, 7) });
              setAction("");
            }}
          >
            <CheckCircle2 size={15} /> Fait, relancer dans 7 j
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- Historique ---------- */

const HISTO_ICON: Record<HistoType, typeof Phone> = { appel: Phone, mail: Mail, sms: MessageSquareText, visite: Home, note: NotebookPen };
const HISTO_COLOR: Record<HistoType, string> = { appel: "bg-ok/10 text-ok", mail: "bg-sky-500/10 text-sky-600 dark:text-sky-300", sms: "bg-accent/10 text-accent", visite: "bg-warn/10 text-warn", note: "bg-surface-2 text-muted" };

function Historique({ c, addHisto, update, type, setType, inputRef }: { c: Contact; addHisto: (t: HistoType, x: string) => void; update: (p: Partial<Contact>) => unknown; type: HistoType; setType: (t: HistoType) => void; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const [txt, setTxt] = useState("");
  const [all, setAll] = useState(false);
  const list = useMemo(() => [...(c.historique ?? [])].sort((a, b) => b.date.localeCompare(a.date)), [c.historique]);
  const shown = all ? list : list.slice(0, 12);
  const submit = () => {
    if (!txt.trim()) return;
    addHisto(type, txt.trim());
    setTxt("");
  };
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <NotebookPen size={15} className="text-accent" /> Historique
        </span>
      }
      action={<span className="text-xs text-muted">{list.length} élément{list.length > 1 ? "s" : ""}</span>}
    >
      <div className="rounded-2xl border border-line bg-surface-2/40 p-2.5 focus-within:border-accent/40 transition">
        <div className="flex gap-1 overflow-x-auto no-scrollbar mb-2">
          {(Object.keys(HISTO_LABEL) as HistoType[]).map((t) => {
            const Icon = HISTO_ICON[t];
            return (
              <button key={t} onClick={() => setType(t)} className={cx("shrink-0 h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition", type === t ? "bg-surface shadow-sm text-fg" : "text-muted hover:text-fg")}>
                <Icon size={13} /> {HISTO_LABEL[t]}
              </button>
            );
          })}
        </div>
        <textarea
          ref={inputRef}
          className="w-full bg-transparent outline-none resize-none text-sm px-1.5 min-h-[64px] placeholder:text-muted/70"
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={type === "appel" ? "Compte rendu de l'appel…" : type === "visite" ? "Retour de visite…" : "Ajouter une note…"}
        />
        <div className="flex justify-end">
          <button className="btn-primary btn-sm !h-9" disabled={!txt.trim()} onClick={submit}>
            <Plus size={14} /> Ajouter
          </button>
        </div>
      </div>

      {list.length ? (
        <ol className="relative mt-4 ml-1">
          <span className="absolute left-[15px] top-2 bottom-2 w-px bg-line" aria-hidden />
          {shown.map((h, i) => {
            const Icon = HISTO_ICON[h.type] ?? NotebookPen;
            return (
              <li key={h.date + i} className="group relative flex gap-3 pb-4 last:pb-0">
                <span className={cx("relative z-[1] grid place-items-center size-8 shrink-0 rounded-full ring-4 ring-surface", HISTO_COLOR[h.type] ?? HISTO_COLOR.note)}>
                  <Icon size={14} />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-semibold text-fg/80">{HISTO_LABEL[h.type] ?? "Note"}</span>
                    <span>
                      {dateCourte(h.date)}
                      {h.date.length > 10 && ` · ${heure(h.date)}`}
                    </span>
                    <button
                      className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 grid place-items-center size-7 rounded-md hover:bg-surface-2 hover:text-danger transition"
                      aria-label="Supprimer"
                      onClick={() => {
                        if (confirm("Supprimer cet élément de l'historique ?")) update({ historique: (c.historique ?? []).filter((x) => x !== h) });
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm leading-relaxed line-clamp-[12]">{h.texte}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-muted text-center py-4">Aucun échange noté pour l&apos;instant.</p>
      )}
      {list.length > 12 && !all && (
        <button className="btn-ghost btn-sm w-full mt-2" onClick={() => setAll(true)}>
          Voir tout l&apos;historique ({list.length})
        </button>
      )}
    </Card>
  );
}

/* ---------- Critères, financement, consentement, notes ---------- */

function CriteresCard({ c, update }: { c: Contact; update: (p: Partial<Contact>) => unknown }) {
  const [k, setK] = useDebounced<Criteres>(c.criteres ?? {}, (v) => update({ criteres: v }), 600);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <MapPin size={15} className="text-accent" /> Critères de recherche
        </span>
      }
    >
      <CriteresEditor value={k} onChange={setK} />
    </Card>
  );
}

function FinancementCard({ c, update }: { c: Contact; update: (p: Partial<Contact>) => unknown }) {
  const [f, setF] = useDebounced(c.financement ?? {}, (v) => update({ financement: v }), 600);
  const set = (p: Partial<NonNullable<Contact["financement"]>>) => setF({ ...f, ...p });
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Banknote size={15} className="text-accent" /> Financement
        </span>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Apport">
            <NumInput value={f.apport} onChange={(v) => set({ apport: v })} suffix="€" placeholder="—" />
          </Field>
          <Field label="Courtier / banque">
            <input className="input" value={f.courtier ?? ""} onChange={(e) => set({ courtier: e.target.value || undefined })} placeholder="—" />
          </Field>
        </div>
        <Toggle checked={f.accordBanque} onChange={(v) => set({ accordBanque: v || undefined })} label="Accord de principe de la banque" />
        <Toggle checked={f.aVendre} onChange={(v) => set({ aVendre: v || undefined })} label="A un bien à vendre" hint="Achat conditionné à une vente : pensez à lui proposer une estimation." />
      </div>
    </Card>
  );
}

function ConsentCard({ c, update }: { c: Contact; update: (p: Partial<Contact>) => unknown }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-accent" /> Démarchage téléphonique
        </span>
      }
    >
      <Toggle
        checked={c.optinTel}
        onChange={(v) => {
          const now = new Date().toISOString();
          update({ optinTel: v, historique: [{ date: now, type: "note" as const, texte: v ? "Accord donné pour être appelé (démarchage téléphonique)" : "Accord de démarchage téléphonique retiré" }, ...(c.historique ?? [])] });
        }}
        label={c.optinTel ? "Accord donné" : "Pas d'accord enregistré"}
        hint="Depuis le 11 août 2026, on ne peut appeler un particulier pour lui proposer un service ou un bien qu'avec son accord préalable. Les appels en réponse à sa propre demande restent possibles."
      />
    </Card>
  );
}

function NotesCard({ c, update }: { c: Contact; update: (p: Partial<Contact>) => unknown }) {
  const [n, setN] = useDebounced(c.notes ?? "", (v) => update({ notes: v || undefined }), 700);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <NotebookPen size={15} className="text-accent" /> Notes
        </span>
      }
    >
      <textarea className="input" rows={4} value={n} onChange={(e) => setN(e.target.value)} placeholder="Situation familiale, contraintes, disponibilités…" />
    </Card>
  );
}

/* ---------- Biens ---------- */

function BienRow({ b, score, raisons, ecarts, dejaPropose, onPropose, onMail }: { b: Bien; score: number; raisons: string[]; ecarts?: string[]; dejaPropose: boolean; onPropose: () => void; onMail: () => void }) {
  const photo = b.photos?.[0];
  return (
    <li className="rounded-xl border border-line p-2.5 hover:border-accent/30 transition">
      <div className="flex gap-3">
        <Link href={`/biens/${b.id}`} className="relative shrink-0 size-[72px] rounded-lg overflow-hidden bg-surface-2 grid place-items-center">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <Home size={20} className="text-muted" />
          )}

        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/biens/${b.id}`} className="block">
            <div className="truncate text-sm font-semibold">{b.titre || b.adresse}</div>
            <div className="text-xs text-muted truncate">
              {[TYPE_BIEN[b.type], b.surface && m2(b.surface), b.pieces && `${b.pieces} p.`, b.quartier || b.ville].filter(Boolean).join(" · ")}
            </div>
            <div className="mt-0.5 text-sm font-semibold">
              {eur(b.prix)} <span className="ml-1 text-[11px] font-medium text-muted">{niveauMatch(score)}</span>
            </div>
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {raisons.slice(0, 3).map((r) => (
              <span key={r} className="chip !h-5 !text-[10px]">
                <Check size={10} className="text-ok" /> {r}
              </span>
            ))}
            {ecarts?.slice(0, 2).map((r) => (
              <span key={r} className="chip !h-5 !text-[10px] text-warn">
                {r}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        {dejaPropose && (
          <span className="mr-auto text-[11px] text-ok font-medium flex items-center gap-1">
            <Check size={13} /> Déjà proposé
          </span>
        )}
        <button className="btn-ghost btn-sm !h-10" onClick={onPropose}>
          <Sparkles size={13} /> Message IA
        </button>
        <button className="btn-secondary btn-sm !h-10" onClick={onMail}>
          <Mail size={13} /> Préparer un mail
        </button>
      </div>
    </li>
  );
}

function VisitesCard({ visites, biens }: { visites: Rdv[]; biens: Bien[] }) {
  const now = new Date().toISOString();
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <CalendarDays size={15} className="text-accent" /> Visites et rendez-vous
        </span>
      }
      action={
        <Link href="/agenda" className="btn-ghost btn-sm text-accent">
          <Plus size={14} /> Planifier
        </Link>
      }
    >
      {visites.length ? (
        <ul className="space-y-2">
          {visites.slice(0, 10).map((r) => {
            const b = biens.find((x) => x.id === r.bienId);
            const futur = r.debut > now;
            return (
              <li key={r.id} className={cx("flex gap-3 rounded-xl px-3 py-2.5", futur ? "bg-accent/5 border border-accent/15" : "bg-surface-2/60")}>
                <div className="w-11 shrink-0 text-center">
                  <div className="text-[10px] uppercase text-muted">{new Date(r.debut).toLocaleDateString("fr-FR", { month: "short", timeZone: "Europe/Paris" })}</div>
                  <div className="font-serif text-lg font-semibold leading-none">{new Date(r.debut).toLocaleDateString("fr-FR", { day: "numeric", timeZone: "Europe/Paris" })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <span className="font-semibold text-fg/80">{RDV_TYPE[r.type]}</span> · {heure(r.debut)}
                    {r.statut === "annule" && <Badge tone="neutral">Annulé</Badge>}
                    {futur && r.statut === "prevu" && <Badge tone="brand">À venir</Badge>}
                  </div>
                  {b ? (
                    <Link href={`/biens/${b.id}`} className="block truncate text-sm font-medium hover:text-accent">
                      {b.titre || b.adresse}
                    </Link>
                  ) : (
                    <div className="truncate text-sm font-medium">{r.titre ?? r.lieu ?? "Rendez-vous"}</div>
                  )}
                  {r.avisClient && <div className="mt-0.5 text-xs text-warn">{"★".repeat(r.avisClient)}<span className="text-line">{"★".repeat(5 - r.avisClient)}</span></div>}
                  {r.compteRendu && <p className="mt-1 text-xs text-muted line-clamp-3">{r.compteRendu}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune visite enregistrée avec ce contact.</p>
      )}
    </Card>
  );
}

function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      className="btn-ghost w-full text-danger/80 hover:text-danger hover:bg-danger/10"
      onClick={() => {
        if (confirm("Supprimer définitivement ce contact et son historique ?")) onDelete();
      }}
    >
      <Trash2 size={15} /> Supprimer le contact
    </button>
  );
}

/* ---------- Modification de l'identité ---------- */

function EditSheet({ open, onClose, c, update }: { open: boolean; onClose: () => void; c: Contact; update: (p: Partial<Contact>) => unknown }) {
  const [d, setD] = useState<Partial<ContactEtatCivil>>({});
  useEffect(() => {
    const ec = c as ContactEtatCivil;
    if (open)
      setD({
        civilite: c.civilite ?? "",
        prenom: c.prenom,
        nom: c.nom,
        tel: c.tel,
        email: c.email,
        adresse: c.adresse,
        dateNaissance: ec.dateNaissance,
        lieuNaissance: ec.lieuNaissance,
        profession: ec.profession,
        roles: c.roles ?? [],
        source: c.source,
      });
  }, [open, c]);
  const set = (p: Partial<ContactEtatCivil>) => setD((x) => ({ ...x, ...p }));
  const roles = d.roles ?? [];
  const toggleRole = (r: ContactRole) => set({ roles: roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r] });
  const save = () => {
    const patch: Partial<ContactEtatCivil> = {
      ...d,
      nom: (d.nom ?? "").trim() || (d.prenom ?? "").trim() || c.nom,
      prenom: d.prenom?.trim() || undefined,
      tel: d.tel?.trim() || undefined,
      email: d.email?.trim() || undefined,
      adresse: d.adresse?.trim() || undefined,
      dateNaissance: d.dateNaissance || undefined,
      lieuNaissance: d.lieuNaissance?.trim() || undefined,
      profession: d.profession?.trim() || undefined,
      roles: roles.length ? roles : ["acquereur"],
    };
    if (patch.roles?.includes("acquereur") && !c.etape) patch.etape = "nouveau";
    update(patch);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Modifier le contact"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary flex-1 sm:flex-none" onClick={save}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <span className="label">Rôles</span>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <PickChip key={r} active={roles.includes(r)} onClick={() => toggleRole(r)}>
                {ROLE[r]}
              </PickChip>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
          <Field label="Civilité">
            <select className="input" value={d.civilite ?? ""} onChange={(e) => set({ civilite: e.target.value as Contact["civilite"] })}>
              <option value="">—</option>
              <option value="Mme">Mme</option>
              <option value="M.">M.</option>
            </select>
          </Field>
          <Field label="Prénom">
            <input className="input" value={d.prenom ?? ""} onChange={(e) => set({ prenom: e.target.value })} />
          </Field>
        </div>
        <Field label="Nom">
          <input className="input" value={d.nom ?? ""} onChange={(e) => set({ nom: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone">
            <input className="input" type="tel" value={d.tel ?? ""} onChange={(e) => set({ tel: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={d.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Adresse">
          <input className="input" value={d.adresse ?? ""} onChange={(e) => set({ adresse: e.target.value })} placeholder="N°, rue, code postal, ville" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de naissance">
            <input className="input" type="date" value={d.dateNaissance ?? ""} onChange={(e) => set({ dateNaissance: e.target.value })} />
          </Field>
          <Field label="Lieu de naissance">
            <input className="input" value={d.lieuNaissance ?? ""} onChange={(e) => set({ lieuNaissance: e.target.value })} placeholder="Ville (dépt)" />
          </Field>
        </div>
        <Field label="Profession">
          <input className="input" value={d.profession ?? ""} onChange={(e) => set({ profession: e.target.value })} />
        </Field>
        <Field label="Source">
          <select className="input" value={d.source ?? ""} onChange={(e) => set({ source: (e.target.value || undefined) as Source | undefined })}>
            <option value="">—</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Sheet>
  );
}

