"use client";

import { AlarmClock, Download, Flame, KanbanSquare, List, Plus, Search, Upload, Users, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ContactCard } from "@/components/contacts/ContactCard";
import { ContactForm } from "@/components/contacts/ContactForm";
import { contactsToCsv, downloadText } from "@/components/contacts/csv";
import { contactHaystack, normalize, relanceDue, sortByRelance } from "@/components/contacts/helpers";
import { ImportSheet } from "@/components/contacts/ImportSheet";
import { Pipeline } from "@/components/contacts/Pipeline";
import { cx, Empty, PageHeader, Tabs } from "@/components/ui";
import { today } from "@/lib/format";
import { useCollection } from "@/lib/store";
import type { Contact, ContactRole } from "@/lib/types";

type Vue = "liste" | "pipeline";
type Filtre = "tous" | "acquereur" | "vendeur" | "prospect_vendeur";
const VUE_KEY = "patrim-hub:contacts-vue";

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ContactsPage />
    </Suspense>
  );
}

function ContactsPage() {
  const { items } = useCollection("contacts");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [vue, setVue] = useState<Vue>("liste");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [q, setQ] = useState("");
  const [relance, setRelance] = useState(false);
  const [chauds, setChauds] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [limit, setLimit] = useState(40);
  const nouveau = params.get("nouveau") === "1";

  useEffect(() => {
    try {
      const v = localStorage.getItem(VUE_KEY);
      if (v === "liste" || v === "pipeline") setVue(v);
    } catch {}
    const r = params.get("filtre");
    if (r === "relance") setRelance(true);
    if (r === "chauds") setChauds(true);
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
      relance: items.filter(relanceDue).length,
      chauds: items.filter((c) => c.chaleur === 3).length,
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
    if (chauds) l = l.filter((c) => c.chaleur === 3);
    return [...l].sort((a, b) => {
      // les dossiers perdus/gagnés passent en fin de liste
      const pa = a.etape === "perdu" || a.etape === "gagne" ? 1 : 0;
      const pb = b.etape === "perdu" || b.etape === "gagne" ? 1 : 0;
      return pa - pb || sortByRelance(a, b);
    });
  }, [searched, filtre, relance, chauds]);

  useEffect(() => setLimit(40), [filtre, relance, chauds, q]);

  const exporter = () => downloadText(`contacts-patrim-${today()}.csv`, contactsToCsv(list.length ? list : items));

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle={
          items.length ? (
            <>
              {counts.acquereur} acquéreur{counts.acquereur > 1 ? "s" : ""} · {counts.vendeur + counts.prospect_vendeur} vendeur{counts.vendeur + counts.prospect_vendeur > 1 ? "s" : ""}
              {counts.relance > 0 && <span className="text-danger font-medium"> · {counts.relance} à relancer</span>}
            </>
          ) : (
            "Acquéreurs, vendeurs et prospects"
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
            <button className="btn-primary btn-sm !h-10 sm:!h-8 flex-1 sm:flex-none" onClick={() => setNouveau(true)}>
              <Plus size={16} /> Nouveau contact
            </button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center animate-fade-up">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 sm:w-auto">
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
              items={[
                { value: "tous", label: "Tous", count: counts.tous },
                { value: "acquereur", label: "Acquéreurs", count: counts.acquereur },
                { value: "vendeur", label: "Vendeurs", count: counts.vendeur },
                { value: "prospect_vendeur", label: "Prospects vendeurs", count: counts.prospect_vendeur },
              ]}
            />
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
              <FilterChip active={relance} onClick={() => setRelance((v) => !v)} tone="danger" icon={<AlarmClock size={14} />} count={counts.relance}>
                À relancer aujourd&apos;hui
              </FilterChip>
              <FilterChip active={chauds} onClick={() => setChauds((v) => !v)} tone="coral" icon={<Flame size={14} />} count={counts.chauds}>
                Chauds
              </FilterChip>
              {(relance || chauds || filtre !== "tous" || q) && (
                <button
                  className="shrink-0 h-9 px-3 rounded-full text-xs font-medium text-muted hover:text-fg"
                  onClick={() => {
                    setRelance(false);
                    setChauds(false);
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.slice(0, limit).map((c, i) => (
                  <ContactCard key={c.id} c={c} index={i} />
                ))}
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

      <ContactForm open={nouveau} onClose={() => setNouveau(false)} defaultRole={filtre === "vendeur" || filtre === "prospect_vendeur" ? filtre : undefined} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} />
    </>
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
