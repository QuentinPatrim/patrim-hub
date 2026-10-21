"use client";

import { AlarmClock, Check, CheckSquare, Copy, Download, KanbanSquare, List, Plus, Search, Trash2, Upload, Users, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ContactCard } from "@/components/contacts/ContactCard";
import { ContactForm } from "@/components/contacts/ContactForm";
import { contactsToCsv, downloadText } from "@/components/contacts/csv";
import { contactHaystack, normalize, relanceDue, sortByRelance } from "@/components/contacts/helpers";
import { ImportSheet } from "@/components/contacts/ImportSheet";
import { Pipeline } from "@/components/contacts/Pipeline";
import { cx, Empty, PageHeader, Sheet, Spinner, Tabs } from "@/components/ui";
import { nomComplet, today } from "@/lib/format";
import { remove, useCollection } from "@/lib/store";
import type { Contact, ContactRole } from "@/lib/types";
import { useEspace } from "@/components/espace/espace";

type Vue = "liste" | "pipeline";
type Filtre = "tous" | "acquereur" | "vendeur" | "prospect_vendeur" | "locataire";
const VUE_KEY = "patrim-hub:contacts-vue";

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ContactsPage />
    </Suspense>
  );
}

function ContactsPage() {
  const { items: tous } = useCollection("contacts");
  const loc = useEspace() === "location";
  // Hub Location : propriétaires (communs) et candidats locataires. Hub Transaction : tout sauf les locataires.
  const items = useMemo(
    () => (loc ? tous.filter((c) => c.roles?.some((r) => r === "vendeur" || r === "locataire")) : tous.filter((c) => !(c.roles?.length && c.roles.every((r) => r === "locataire")))),
    [tous, loc]
  );
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [vueChoisie, setVue] = useState<Vue>("liste");
  const vue: Vue = loc ? "liste" : vueChoisie;
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [q, setQ] = useState("");
  const [relance, setRelance] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [limit, setLimit] = useState(40);
  // Sélection pour supprimer plusieurs fiches d'un coup
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const nouveau = params.get("nouveau") === "1";

  useEffect(() => {
    try {
      const v = localStorage.getItem(VUE_KEY);
      if (v === "liste" || v === "pipeline") setVue(v);
    } catch {}
    const r = params.get("filtre");
    if (r === "relance") setRelance(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const changeVue = (v: Vue) => {
    setVue(v);
    try {
      localStorage.setItem(VUE_KEY, v);
    } catch {}
  };

  const setNouveau = useCallback(
    (open: boolean) => {
      const sp = new URLSearchParams(params.toString());
      if (open) sp.set("nouveau", "1");
      else sp.delete("nouveau");
      const s = sp.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const counts = useMemo(() => {
    const has = (r: ContactRole) => items.filter((c) => c.roles?.includes(r)).length;
    return {
      tous: items.length,
      acquereur: has("acquereur"),
      vendeur: has("vendeur"),
      prospect_vendeur: has("prospect_vendeur"),
      locataire: has("locataire"),
      relance: items.filter(relanceDue).length,
    };
  }, [items]);

  const searched = useMemo(() => {
    const s = normalize(q);
    if (!s) return items;
    const words = s.split(/\s+/);
    return items.filter((c) => {
      const h = contactHaystack(c);
      return words.every((w) => h.includes(w));
    });
  }, [items, q]);

  const list = useMemo(() => {
    let l: Contact[] = searched;
    if (filtre !== "tous") l = l.filter((c) => c.roles?.includes(filtre));
    if (relance) l = l.filter(relanceDue);
    return [...l].sort((a, b) => {
      // les dossiers perdus/gagnés passent en fin de liste
      const pa = a.etape === "perdu" || a.etape === "gagne" ? 1 : 0;
      const pb = b.etape === "perdu" || b.etape === "gagne" ? 1 : 0;
      return pa - pb || sortByRelance(a, b);
    });
  }, [searched, filtre, relance]);

  useEffect(() => setLimit(40), [filtre, relance, q]);

  const basculer = (id: string) =>
    setSelection((s) => {
      const n = new Set(s ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const choisis = useMemo(() => items.filter((c) => selection?.has(c.id)), [items, selection]);
  const doublons = useMemo(() => doublonsDe(items), [items]);

  const exporter = () => downloadText(`contacts-patrim-${today()}.csv`, contactsToCsv(list.length ? list : items));

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={
          items.length ? (
            <>
              {loc ? (
                <>
                  {counts.vendeur} propriétaire{counts.vendeur > 1 ? "s" : ""} · {counts.locataire} candidat{counts.locataire > 1 ? "s" : ""} ou locataire{counts.locataire > 1 ? "s" : ""}
                </>
              ) : (
                <>
                  {counts.acquereur} acquéreur{counts.acquereur > 1 ? "s" : ""} · {counts.vendeur + counts.prospect_vendeur} propriétaire{counts.vendeur + counts.prospect_vendeur > 1 ? "s" : ""}
                </>
              )}
              {counts.relance > 0 && <span className="text-danger font-medium"> · {counts.relance} à relancer</span>}
            </>
          ) : (
            loc ? "Propriétaires et candidats locataires" : "Acquéreurs, propriétaires et prospects"
          )
        }
        actions={
          <>
            <button className="btn-secondary btn-sm !h-10 sm:!h-8" onClick={() => setImportOpen(true)}>
              <Upload size={15} /> Importer
            </button>
            {items.length > 0 && (
              <button className="btn-secondary btn-sm !h-10 sm:!h-8" onClick={exporter}>
                <Download size={15} /> Exporter
              </button>
            )}
            {items.length > 0 && vue === "liste" && (
              <button className="btn-secondary btn-sm !h-10 sm:!h-8" onClick={() => setSelection(selection ? null : new Set())} aria-pressed={!!selection}>
                <CheckSquare size={15} /> Sélectionner
              </button>
            )}
            <button className="btn-primary btn-sm !h-10 sm:!h-8 flex-1 sm:flex-none" onClick={() => setNouveau(true)}>
              <Plus size={16} /> Nouveau contact
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center animate-fade-up">
        <div className={cx("grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 sm:w-auto", loc && "hidden")}>
          {(
            [
              ["liste", "Liste", List],
              ["pipeline", "Pipeline", KanbanSquare],
            ] as const
          ).map(([v, label, Icon]) => (
            <button
              key={v}
              onClick={() => changeVue(v)}
              className={cx("h-9 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition", vue === v ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !h-11 sm:!h-10 pl-10 pr-10 !rounded-xl" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, téléphone, quartier…" type="search" enterKeyHint="search" />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 grid place-items-center size-8 rounded-lg text-muted hover:bg-surface-2" aria-label="Effacer">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {vue === "pipeline" ? (
        <div className="animate-fade-up">
          <Pipeline contacts={searched} onNew={() => setNouveau(true)} />
        </div>
      ) : (
        <>
          <div className="mb-4 space-y-2.5 animate-fade-up">
            <Tabs<Filtre>
              value={filtre}
              onChange={setFiltre}
              items={
                loc
                  ? [
                      { value: "tous", label: "Tous", count: counts.tous },
                      { value: "vendeur", label: "Propriétaires", count: counts.vendeur },
                      { value: "locataire", label: "Locataires", count: counts.locataire },
                    ]
                  : [
                      { value: "tous", label: "Tous", count: counts.tous },
                      { value: "acquereur", label: "Acquéreurs", count: counts.acquereur },
                      { value: "vendeur", label: "Propriétaires", count: counts.vendeur },
                      { value: "prospect_vendeur", label: "Prospects vendeurs", count: counts.prospect_vendeur },
                    ]
              }
            />
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              <FilterChip active={relance} onClick={() => setRelance((v) => !v)} tone="danger" icon={<AlarmClock size={14} />} count={counts.relance}>
                À relancer aujourd&apos;hui
              </FilterChip>
              {(relance || filtre !== "tous" || q) && (
                <button
                  className="shrink-0 h-9 px-3 rounded-full text-xs font-medium text-muted hover:text-fg"
                  onClick={() => {
                    setRelance(false);
                    setFiltre("tous");
                    setQ("");
                  }}
                >
                  Tout afficher
                </button>
              )}
            </div>
          </div>

          {!items.length ? (
            <div className="card animate-fade-up">
              <Empty
                icon={<Users size={22} />}
                title="Votre carnet est vide"
                text="Créez un premier contact, collez un lead reçu par mail ou importez votre fichier de prospects."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <button className="btn-primary" onClick={() => setNouveau(true)}>
                      <Plus size={16} /> Nouveau contact
                    </button>
                    <button className="btn-secondary" onClick={() => setImportOpen(true)}>
                      <Upload size={16} /> Importer un fichier
                    </button>
                  </div>
                }
              />
            </div>
          ) : !list.length ? (
            <div className="card animate-fade-up">
              <Empty
                icon={relance ? <AlarmClock size={22} /> : <Search size={22} />}
                title={relance && !q ? "Aucune relance en attente" : "Aucun contact trouvé"}
                text={relance && !q ? "Vous êtes à jour. Bravo !" : "Essayez un autre nom, ou retirez un filtre."}
                action={
                  q ? (
                    <button className="btn-secondary" onClick={() => setNouveau(true)}>
                      <Plus size={16} /> Créer « {q} »
                    </button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              {selection && (
                <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] lg:top-2 z-20 mb-3 rounded-2xl border border-accent/25 bg-surface/95 backdrop-blur-xl p-2.5 shadow-card animate-fade-up">
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-sm font-semibold">
                      {selection.size ? `${selection.size} sélectionné${selection.size > 1 ? "s" : ""}` : "Touchez les fiches à supprimer"}
                    </span>
                    <button className="btn-ghost btn-sm !h-9 text-muted" onClick={() => setSelection(null)}>
                      <X size={15} /> Fermer
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="btn-secondary btn-sm !h-9"
                      onClick={() => setSelection(list.every((c) => selection.has(c.id)) ? new Set() : new Set(list.map((c) => c.id)))}
                    >
                      <Check size={14} /> {list.every((c) => selection.has(c.id)) ? "Tout décocher" : `Tout (${list.length})`}
                    </button>
                    {doublons.length > 0 && (
                      <button className="btn-secondary btn-sm !h-9" onClick={() => setSelection(new Set(doublons))}>
                        <Copy size={14} /> Les doublons ({doublons.length})
                      </button>
                    )}
                    <button className="btn-sm !h-9 btn bg-danger text-white ml-auto" disabled={!selection.size} onClick={() => setConfirmer(true)}>
                      <Trash2 size={14} /> Supprimer
                    </button>
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.slice(0, limit).map((c, i) =>
                  selection ? (
                    <div key={c.id} className="relative min-w-0">
                      <ContactCard c={c} index={i} />
                      <button
                        type="button"
                        onClick={() => basculer(c.id)}
                        aria-pressed={selection.has(c.id)}
                        aria-label={`Sélectionner ${nomComplet(c)}`}
                        className={cx("absolute inset-0 rounded-2xl border-2 transition", selection.has(c.id) ? "border-danger bg-danger/[0.06]" : "border-transparent")}
                      >
                        <span className={cx("absolute right-3 top-3 grid size-7 place-items-center rounded-full border-2", selection.has(c.id) ? "border-danger bg-danger text-white" : "border-line bg-surface")}>
                          {selection.has(c.id) && <Check size={15} strokeWidth={3} />}
                        </span>
                      </button>
                    </div>
                  ) : (
                    <ContactCard key={c.id} c={c} index={i} />
                  )
                )}
              </div>
              {list.length > limit && (
                <div className="mt-4 flex justify-center">
                  <button className="btn-secondary" onClick={() => setLimit((l) => l + 60)}>
                    Afficher plus ({list.length - limit})
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <ContactForm open={nouveau} onClose={() => setNouveau(false)} defaultRole={filtre === "vendeur" || filtre === "prospect_vendeur" || filtre === "locataire" ? filtre : loc ? "locataire" : undefined} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
      <SupprimerSheet
        open={confirmer}
        contacts={choisis}
        onClose={() => setConfirmer(false)}
        onDone={() => {
          setConfirmer(false);
          setSelection(null);
        }}
      />
    </>
  );
}

/** Fiches en double (même prénom et même nom, sans téléphone ou e-mail différent) : on garde la plus ancienne. */
function doublonsDe(items: Contact[]) {
  const groupes = new Map<string, Contact[]>();
  for (const c of items) {
    const k = `${normalize(c.prenom)}|${normalize(c.nom)}`;
    if (k === "|") continue;
    groupes.set(k, [...(groupes.get(k) ?? []), c]);
  }
  const ids: string[] = [];
  const tel = (c: Contact) => c.tel?.replace(/\D/g, "").slice(-9) || "";
  for (const g of groupes.values()) {
    if (g.length < 2) continue;
    const [garde, ...autres] = [...g].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    for (const c of autres) {
      const autreTel = tel(c) && tel(garde) && tel(c) !== tel(garde);
      const autreMail = c.email && garde.email && normalize(c.email) !== normalize(garde.email);
      if (!autreTel && !autreMail) ids.push(c.id);
    }
  }
  return ids;
}

function SupprimerSheet({ open, contacts, onClose, onDone }: { open: boolean; contacts: Contact[]; onClose: () => void; onDone: () => void }) {
  const { items: biens } = useCollection("biens");
  const { items: rdvs } = useCollection("rdvs");
  const ids = new Set(contacts.map((c) => c.id));
  const lies = biens.filter((b) => b.vendeurIds?.some((v) => ids.has(v))).length;
  const visites = rdvs.filter((r) => r.contactIds?.some((v) => ids.has(v))).length;
  const n = contacts.length;
  const [busy, setBusy] = useState(false);
  const [refus, setRefus] = useState<Contact[]>([]);
  useEffect(() => {
    if (open) setRefus([]);
  }, [open]);
  const supprimer = async () => {
    setBusy(true);
    const ok = await Promise.all(contacts.map((c) => remove("contacts", c.id)));
    setBusy(false);
    const rates = contacts.filter((_, i) => !ok[i]);
    if (rates.length) setRefus(rates);
    else onDone();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Supprimer ${n} fiche${n > 1 ? "s" : ""} ?`}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn bg-danger text-white flex-1 sm:flex-none"
            disabled={!n || busy}
            onClick={supprimer}
          >
            {busy ? <Spinner /> : <Trash2 size={16} />} {busy ? "Suppression…" : "Supprimer définitivement"}
          </button>
        </>
      }
    >
      {refus.length > 0 && (
        <p className="mb-3 rounded-xl border border-danger/25 bg-danger/10 px-3 py-2.5 text-[13px] text-danger">
          {refus.length} fiche{refus.length > 1 ? "s n'ont" : " n'a"} pas pu être supprimée{refus.length > 1 ? "s" : ""} : {refus.length > 1 ? "elles ont été créées" : "elle a été créée"} depuis le compte d&apos;un collègue, et
          seul ce compte peut {refus.length > 1 ? "les" : "la"} supprimer pour l&apos;instant. {refus.map(nomComplet).join(", ")}.
        </p>
      )}
      <p className="text-sm text-muted">La suppression est définitive : l&apos;historique de ces fiches est perdu.</p>
      {(lies > 0 || visites > 0) && (
        <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[13px]">
          Attention : {[lies > 0 && `${lies} bien${lies > 1 ? "s" : ""} en vente`, visites > 0 && `${visites} rendez-vous`].filter(Boolean).join(" et ")} {lies + visites > 1 ? "sont rattachés" : "est rattaché"} à ces fiches.
        </p>
      )}
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
        {contacts.slice(0, 12).map((c) => (
          <li key={c.id} className="px-3 py-2 text-sm">
            <span className="font-medium">{nomComplet(c)}</span>
            {c.tel && <span className="text-muted"> · {c.tel}</span>}
          </li>
        ))}
        {n > 12 && <li className="px-3 py-2 text-sm text-muted">et {n - 12} autre{n - 12 > 1 ? "s" : ""}</li>}
      </ul>
    </Sheet>
  );
}

function FilterChip({ active, onClick, children, icon, count, tone }: { active: boolean; onClick: () => void; children: ReactNode; icon: ReactNode; count: number; tone: "danger" | "coral" }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "shrink-0 inline-flex items-center gap-1.5 h-9 pl-3 pr-2 rounded-full border text-xs font-medium transition active:scale-[.97]",
        active
          ? tone === "danger"
            ? "bg-danger text-white border-danger"
            : "bg-coral text-white border-coral"
          : "bg-surface border-line hover:border-accent/40"
      )}
    >
      <span className={cx(!active && (tone === "danger" ? "text-danger" : "text-coral"))}>{icon}</span>
      {children}
      <span className={cx("min-w-5 h-5 px-1.5 grid place-items-center rounded-full text-[11px] font-semibold", active ? "bg-white/20" : "bg-surface-2 text-muted")}>{count}</span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-9 w-40" />
      <div className="skeleton h-11 w-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-36 w-full rounded-2xl" />
      ))}
    </div>
  );
}
