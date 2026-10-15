"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Copy, Lightbulb, Plus, Share2, Trash2 } from "lucide-react";
import { titrePublic } from "@/lib/titrePublic";
import { useMemo, useState, type DragEvent } from "react";
import { Badge, cx, Empty, Field, Sheet, Spinner } from "@/components/ui";
import { ask } from "@/lib/ai";
import { addDays, dateCourte, eurK, STATUT_BIEN, today } from "@/lib/format";
import { useCollection } from "@/lib/store";
import type { Bien, Canal, Contenu } from "@/lib/types";
import { AutoTextarea, Segmented, useToast } from "./bits";
import { CANAL, copier, errMsg, partager, STATUT_CONTENU } from "./shared";

type Statut = Contenu["statut"];
const STATUTS = Object.keys(STATUT_CONTENU) as Statut[];
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

const lundi = (ymd: string) => {
  const d = new Date(ymd + "T12:00:00Z").getUTCDay();
  return addDays(ymd, -((d + 6) % 7));
};

type Draft = Partial<Contenu> & { canal: Canal; titre: string; texte: string; statut: Statut; tags?: string };

export function Calendrier({ bienCourant }: { bienCourant?: Bien }) {
  const { items, create, update, remove } = useCollection("contenus");
  const biens = useCollection("biens").items;
  const [week, setWeek] = useState(() => lundi(today()));
  const [filtre, setFiltre] = useState<Statut | "tous">("tous");
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const { toast, node } = useToast();

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const fin = jours[6];
  const auj = today();
  const visible = (c: Contenu) => filtre === "tous" || c.statut === filtre;
  const semaine = items.filter((c) => c.datePrevue && c.datePrevue >= week && c.datePrevue <= fin);
  const aPlanifier = items.filter((c) => !c.datePrevue && c.statut !== "publie" && visible(c));
  const parJour = (d: string) => semaine.filter((c) => c.datePrevue === d && visible(c)).sort((a, b) => STATUTS.indexOf(b.statut) - STATUTS.indexOf(a.statut));
  const bienDe = (id?: string) => biens.find((b) => b.id === id);
  const publies = semaine.filter((c) => c.statut === "publie").length;

  function cycle(c: Contenu) {
    const next = STATUTS[(STATUTS.indexOf(c.statut) + 1) % STATUTS.length];
    update(c.id, { statut: next });
    toast(STATUT_CONTENU[next].label);
  }

  function saveDraft() {
    if (!edit) return;
    const { id, createdAt, updatedAt, tags, ...rest } = edit;
    void createdAt;
    void updatedAt;
    const hashtags = (tags ?? "").split(/\s+/).filter(Boolean);
    const clean = { ...rest, hashtags: hashtags.length ? hashtags : undefined, titre: rest.titre.trim() || "Sans titre", datePrevue: rest.datePrevue || undefined, bienId: rest.bienId || undefined };
    if (id) update(id, clean);
    else create(clean);
    setEdit(null);
    toast("Enregistré");
  }

  async function idees() {
    setBusy(true);
    setErr(null);
    try {
      const portefeuille = biens
        .filter((b) => ["en_vente", "mandat_signe", "sous_offre", "compromis", "vendu"].includes(b.statut))
        .slice(0, 15)
        .map((b, i) => `B${i + 1} : ${titrePublic(b)} — ${[b.quartier, b.ville].filter(Boolean).join(", ")} — ${STATUT_BIEN[b.statut].label}${b.prix ? ` — ${eurK(b.prix)}` : ""}${b.dpe ? ` — DPE ${b.dpe}` : ""}`);
      const refs = biens.filter((b) => ["en_vente", "mandat_signe", "sous_offre", "compromis", "vendu"].includes(b.statut)).slice(0, 15);
      const deja = semaine.map((c) => `- ${c.titre}`).join("\n") || "aucun";
      const res = await ask<{ idees?: { titre: string; canal: Canal; jour: number; texte: string; bien?: string | null }[] }>({
        json: true,
        system:
          "Tu es le community manager de l'agence immobilière PATRIM à Toulouse (Instagram @patrim.toulouse). Tu proposes un planning éditorial varié et réaliste pour un conseiller en vente : marché toulousain, conseils vendeurs, conseils acquéreurs, coulisses du métier, biens du portefeuille. Pas de chiffres de marché inventés : propose de les vérifier ([À compléter : chiffre]).",
        prompt: `Semaine du ${dateCourte(week)} au ${dateCourte(fin)} (aujourd'hui : ${dateCourte(auj)}).
Biens du portefeuille :
${portefeuille.join("\n") || "aucun bien renseigné"}
Contenus déjà prévus cette semaine :
${deja}

Propose exactement 5 idées de posts complémentaires, réparties sur la semaine (jour 1 = lundi … 7 = dimanche), sur des canaux variés parmi : instagram_post, instagram_reel, instagram_story, facebook, linkedin.
Au moins une idée « marché local », une « conseil vendeur », une « conseil acquéreur », une « coulisses », une « bien du portefeuille » (si un bien existe).
Réponds en JSON : { "idees": [ { "titre": "titre court", "canal": "instagram_post", "jour": 2, "texte": "angle et plan du post en 2 à 4 phrases", "bien": "B1 ou null" } ] }`,
      });
      const list = res.json?.idees;
      if (!list?.length) throw new Error("Aucune idée reçue, réessayez.");
      list.slice(0, 5).forEach((it) => {
        const j = Math.max(1, Math.min(7, Number(it.jour) || 1));
        const idx = it.bien ? Number(String(it.bien).replace(/\D/g, "")) - 1 : -1;
        create({
          canal: (Object.keys(CANAL) as Canal[]).includes(it.canal) ? it.canal : "instagram_post",
          titre: it.titre || "Idée de post",
          texte: it.texte || "",
          statut: "idee",
          datePrevue: addDays(week, j - 1),
          bienId: refs[idx]?.id,
        });
      });
      toast("5 idées ajoutées à la semaine");
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const nouveau = (d?: string) => setEdit({ canal: "instagram_post", titre: "", texte: "", statut: "brouillon", datePrevue: d, bienId: bienCourant?.id });

  const onDrop = (d: string | null) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    setDragOver(null);
    if (id) update(id, { datePrevue: d ?? undefined });
  };

  const carte = (c: Contenu) => {
    const b = bienDe(c.bienId);
    return (
      <div
        key={c.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
        onClick={() => setEdit({ ...c, tags: c.hashtags?.join(" ") ?? "" })}
        className={cx(
          "group relative cursor-pointer overflow-hidden rounded-xl border border-line bg-surface p-2.5 pl-3.5 text-left shadow-sm transition hover:shadow-card",
          c.statut === "publie" && "opacity-70"
        )}
      >
        <span className="absolute inset-y-0 left-0 w-1" style={{ background: CANAL[c.canal].color }} />
        <div className="flex items-center justify-between gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: CANAL[c.canal].color }}>
            {CANAL[c.canal].short}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              cycle(c);
            }}
            title="Passer à l'étape suivante"
          >
            <Badge tone={STATUT_CONTENU[c.statut].tone}>{STATUT_CONTENU[c.statut].label}</Badge>
          </button>
        </div>
        <div className="mt-1 text-[13px] font-medium leading-snug line-clamp-2">{c.titre}</div>
        {b && <div className="mt-1 text-[11px] text-muted truncate">{b.titre}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {node}
      <div className="card card-pad">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button className="btn-secondary !px-2.5" onClick={() => setWeek(addDays(week, -7))} aria-label="Semaine précédente">
              <ChevronLeft size={18} />
            </button>
            <div className="min-w-0 flex-1 text-center sm:text-left sm:flex-none sm:min-w-[190px]">
              <div className="font-serif text-lg font-semibold leading-tight">
                {dateCourte(week)} – {dateCourte(fin)}
              </div>
              <div className="text-[11px] text-muted">
                {semaine.length} contenu{semaine.length > 1 ? "s" : ""} · {publies} publié{publies > 1 ? "s" : ""}
              </div>
            </div>
            <button className="btn-secondary !px-2.5" onClick={() => setWeek(addDays(week, 7))} aria-label="Semaine suivante">
              <ChevronRight size={18} />
            </button>
            {week !== lundi(auj) && (
              <button className="btn-ghost btn-sm" onClick={() => setWeek(lundi(auj))}>
                Aujourd&apos;hui
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button className="btn-secondary" onClick={() => nouveau()}>
              <Plus size={16} /> Contenu
            </button>
            <button className="btn-primary" onClick={idees} disabled={busy}>
              {busy ? <Spinner /> : <Lightbulb size={16} />} Idées de la semaine
            </button>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden flex">
          {STATUTS.map((s) => {
            const n = semaine.filter((c) => c.statut === s).length;
            const color = { idee: "rgb(var(--line))", brouillon: "rgb(var(--warn))", pret: "#0ea5e9", programme: "rgb(var(--accent))", publie: "rgb(var(--ok))" }[s];
            return n ? <span key={s} style={{ width: `${(n / semaine.length) * 100}%`, background: color }} /> : null;
          })}
        </div>
        <div className="mt-3 -mx-1 px-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {(["tous", ...STATUTS] as const).map((s) => {
            const n = s === "tous" ? semaine.length : semaine.filter((c) => c.statut === s).length;
            return (
              <button
                key={s}
                onClick={() => setFiltre(s)}
                className={cx("h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition", filtre === s ? "border-brand bg-brand text-white" : "border-line bg-surface text-fg/80")}
              >
                {s === "tous" ? "Tous" : STATUT_CONTENU[s].label} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {err && <div className="card card-pad text-sm text-danger">{err}</div>}

      <div className="grid gap-2.5 md:grid-cols-7">
        {jours.map((d, i) => {
          const list = parJour(d);
          const isToday = d === auj;
          return (
            <div
              key={d}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(d);
              }}
              onDragLeave={() => setDragOver((x) => (x === d ? null : x))}
              onDrop={onDrop(d)}
              className={cx(
                "rounded-2xl border p-2 md:min-h-[220px] transition",
                isToday ? "border-accent/40 bg-accent/[0.04]" : "border-line bg-surface-2/50",
                dragOver === d && "ring-2 ring-accent/40",
                !list.length && "max-md:py-1.5"
              )}
            >
              <div className="flex items-center justify-between px-1 pb-1.5">
                <div className="flex items-baseline gap-1.5">
                  <span className={cx("text-xs font-semibold", isToday && "text-accent")}>{JOURS[i].slice(0, 3)}.</span>
                  <span className="text-xs text-muted">{dateCourte(d)}</span>
                  {isToday && <span className="text-[10px] font-semibold text-accent">· aujourd&apos;hui</span>}
                </div>
                <button className="btn-ghost !h-7 !w-7 !px-0 !rounded-lg" onClick={() => nouveau(d)} aria-label={`Ajouter le ${JOURS[i]}`}>
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-1.5">
                {list.map((c) => (
                  carte(c)
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={cx("card card-pad", dragOver === "none" && "ring-2 ring-accent/40")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver("none");
        }}
        onDragLeave={() => setDragOver(null)}
        onDrop={onDrop(null)}
      >
        <div className="flex items-center justify-between">
          <div className="h-section">À planifier</div>
          <span className="text-xs text-muted">{aPlanifier.length}</span>
        </div>
        {aPlanifier.length ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {aPlanifier.map((c) => (
              carte(c)
            ))}
          </div>
        ) : (
          <Empty icon={<CalendarDays size={22} />} title="Rien en attente" text="Les contenus enregistrés depuis le kit de diffusion arrivent ici. Donnez-leur une date pour les planifier." />
        )}
      </div>

      <Sheet
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.id ? "Contenu" : "Nouveau contenu"}
        wide
        footer={
          edit && (
            <>
              {edit.id && (
                <button
                  className="btn-ghost text-danger mr-auto !px-3"
                  onClick={() => {
                    if (confirm("Supprimer ce contenu ?")) {
                      remove(edit.id!);
                      setEdit(null);
                    }
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button className="btn-secondary !px-3" onClick={async () => toast((await copier([edit.texte, edit.tags].filter(Boolean).join("\n\n"))) ? "Copié" : "Copie impossible")} aria-label="Copier">
                <Copy size={16} />
              </button>
              <button className="btn-secondary !px-3" onClick={() => partager({ title: edit.titre, text: [edit.texte, edit.tags].filter(Boolean).join("\n\n") })} aria-label="Partager">
                <Share2 size={16} />
              </button>
              <button className="btn-primary" onClick={saveDraft}>
                Enregistrer
              </button>
            </>
          )
        }
      >
        {edit && (
          <div className="space-y-3">
            <Field label="Titre">
              <input className="input" autoFocus={!edit.id} value={edit.titre} onChange={(e) => setEdit({ ...edit, titre: e.target.value })} placeholder="ex. 3 erreurs à éviter avant de vendre" />
            </Field>
            <div>
              <div className="label">Étape</div>
              <Segmented value={edit.statut} onChange={(s) => setEdit({ ...edit, statut: s })} items={STATUTS.map((s) => ({ value: s, label: STATUT_CONTENU[s].label }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Canal">
                <select className="input" value={edit.canal} onChange={(e) => setEdit({ ...edit, canal: e.target.value as Canal })}>
                  {(Object.keys(CANAL) as Canal[]).map((k) => (
                    <option key={k} value={k}>
                      {CANAL[k].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date prévue">
                <input type="date" className="input" value={edit.datePrevue ?? ""} onChange={(e) => setEdit({ ...edit, datePrevue: e.target.value })} />
              </Field>
            </div>
            <Field label="Bien lié">
              <select className="input" value={edit.bienId ?? ""} onChange={(e) => setEdit({ ...edit, bienId: e.target.value })}>
                <option value="">Aucun</option>
                {biens.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.titre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Texte">
              <AutoTextarea minRows={6} value={edit.texte} onChange={(e) => setEdit({ ...edit, texte: e.target.value })} />
            </Field>
            <Field label="Hashtags">
              <input
                className="input"
                value={edit.tags ?? ""}
                onChange={(e) => setEdit({ ...edit, tags: e.target.value })}
                placeholder="#toulouse #immobiliertoulouse"
              />
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
