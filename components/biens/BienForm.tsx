"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Building2,
  Camera,
  Check,
  ClipboardList,
  Euro,
  FileText,
  Gauge,
  MapPin,
  Plus,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import { Field, cx } from "@/components/ui";
import { STATUT_BIEN, TYPE_BIEN, eur, today } from "@/lib/format";
import type { Bien, BienStatut, BienType, ClasseDpe, MandatType } from "@/lib/types";
import { TOULOUSE_QUARTIERS } from "@/lib/toulouseQuartiers";
import { ContactPicker } from "./ContactPicker";
import { PhotosEditor } from "./PhotosEditor";
import { STATUTS, TYPE_ICON, estCopro, prixM2 } from "./utils";

/** Champ ajouté par le module (non présent dans lib/types.ts). */
export type BienExt = Bien & { honorairesCharge?: "acquereur" | "vendeur" };
export type BienDraft = Partial<BienExt>;

const TYPES: BienType[] = ["appartement", "maison", "terrain", "local", "immeuble", "parking"];
const CLASSES: ClasseDpe[] = ["A", "B", "C", "D", "E", "F", "G"];
const DPE_COLORS: Record<ClasseDpe, string> = { A: "#009c6d", B: "#52b153", C: "#78bd76", D: "#f4e70f", E: "#f0b50f", F: "#eb8235", G: "#d7221f" };
const MANDATS: { value: MandatType; label: string }[] = [
  { value: "exclusif", label: "Exclusif" },
  { value: "semi_exclusif", label: "Semi-exclusif" },
  { value: "simple", label: "Simple" },
];
const EXTERIEURS = ["Balcon", "Terrasse", "Jardin", "Loggia", "Cour"];
const PARKINGS = ["Place de parking", "Garage", "Box fermé", "Parking en sous-sol"];
const CHAUFFAGES = ["Individuel électrique", "Individuel gaz", "Collectif gaz", "Pompe à chaleur", "Chaudière fioul", "Poêle à bois", "Réseau de chaleur"];

export const SECTIONS = [
  { id: "bien", label: "Le bien", icon: Building2 },
  { id: "adresse", label: "Adresse", icon: MapPin },
  { id: "prix", label: "Prix & mandat", icon: Euro },
  { id: "copro", label: "Copropriété & charges", icon: ClipboardList },
  { id: "diag", label: "Diagnostics", icon: Gauge },
  { id: "vendeur", label: "Vendeur(s)", icon: UserRound },
  { id: "photos", label: "Photos", icon: Camera },
  { id: "texte", label: "Description & points forts", icon: FileText },
] as const;

export function emptyBien(): BienDraft {
  return { type: "appartement", statut: "en_vente", ville: "Toulouse", dateMiseEnVente: today(), photos: [], pointsForts: [], vendeurIds: [], mandat: { type: "exclusif", debut: today() } };
}

export function titreSuggere(d: BienDraft) {
  const t = d.type ?? "appartement";
  const base = t === "appartement" && d.pieces ? `T${d.pieces}` : TYPE_BIEN[t];
  const parts = [base, d.surface ? `${d.surface.toLocaleString("fr-FR")} m²` : "", d.exterieur ? `avec ${d.exterieur.toLowerCase()}` : "", d.quartier ? `– ${d.quartier}` : ""];
  return parts.filter(Boolean).join(" ");
}

/** Nettoie le brouillon avant enregistrement (honoraires calculés, titre par défaut). */
export function finaliserBien(d: BienDraft): Omit<BienExt, "id" | "createdAt" | "updatedAt"> {
  const honoraires = d.prix && d.netVendeur ? Math.max(0, d.prix - d.netVendeur) : d.honoraires;
  return {
    ...d,
    titre: d.titre?.trim() || titreSuggere(d),
    type: d.type ?? "appartement",
    adresse: d.adresse?.trim() ?? "",
    ville: d.ville?.trim() || "Toulouse",
    statut: d.statut ?? "en_vente",
    honoraires,
    pointsForts: (d.pointsForts ?? []).filter(Boolean),
  } as Omit<BienExt, "id" | "createdAt" | "updatedAt">;
}

export function BienForm({ initial, onSubmit, onCancel, submitLabel = "Enregistrer" }: { initial: BienDraft; onSubmit: (d: BienDraft) => void; onCancel: () => void; submitLabel?: string }) {
  const [d, setD] = useState<BienDraft>(initial);
  const [pf, setPf] = useState("");
  const [err, setErr] = useState("");
  const set = <K extends keyof BienExt>(k: K, v: BienExt[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  const setMandat = (p: Partial<NonNullable<Bien["mandat"]>>) => setD((x) => ({ ...x, mandat: { ...x.mandat, ...p } }));

  const pm2 = prixM2({ prix: d.prix, surface: d.surface });
  const honoraires = d.prix && d.netVendeur ? d.prix - d.netVendeur : undefined;
  const tauxHono = honoraires != null && d.netVendeur ? honoraires / d.netVendeur : undefined;
  const habitable = d.type !== "terrain" && d.type !== "parking";
  const suggestion = useMemo(() => titreSuggere(d), [d]);

  const submit = () => {
    if (!d.adresse?.trim()) {
      setErr("Indiquez au moins l'adresse du bien.");
      document.getElementById("sec-adresse")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (honoraires != null && honoraires < 0) {
      setErr("Le net vendeur est supérieur au prix affiché.");
      document.getElementById("sec-prix")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setErr("");
    onSubmit(d);
  };

  const addPf = () => {
    const v = pf.trim();
    if (!v) return;
    set("pointsForts", [...(d.pointsForts ?? []), v]);
    setPf("");
  };

  return (
    <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      {/* Sommaire (ordinateur) / navigation horizontale (mobile) */}
      <nav className="lg:sticky lg:top-8 lg:self-start mb-4 lg:mb-0 -mx-4 px-4 sm:mx-0 sm:px-0 flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#sec-${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="chip lg:!h-9 lg:!rounded-xl lg:!border-transparent lg:!bg-transparent lg:hover:!bg-surface-2 lg:!text-sm lg:!font-normal lg:!px-3 !h-8 shrink-0"
          >
            <Icon size={14} className="text-muted" /> {label}
          </a>
        ))}
      </nav>

      <div className="space-y-4 min-w-0">
        <Section id="bien" title="Le bien" icon={Building2}>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {TYPES.map((t) => {
              const Icon = TYPE_ICON[t];
              const on = d.type === t;
              return (
                <button
                  type="button"
                  key={t}
                  onClick={() => set("type", t)}
                  className={cx("flex flex-col items-center justify-center gap-1 rounded-xl border h-16 text-xs font-medium transition", on ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface hover:bg-surface-2 text-muted")}
                >
                  <Icon size={19} strokeWidth={1.7} />
                  {TYPE_BIEN[t]}
                </button>
              );
            })}
          </div>
          <Group label="Titre" hint={!d.titre && suggestion ? <>Si vide : « {suggestion} »</> : undefined}>
            <div className="flex gap-2">
              <input className="input" value={d.titre ?? ""} onChange={(e) => set("titre", e.target.value)} placeholder="Ex. T3 lumineux avec balcon" />
              <button type="button" className="btn-secondary !px-3" onClick={() => set("titre", suggestion)} title="Proposer un titre" aria-label="Proposer un titre">
                <Wand2 size={16} />
              </button>
            </div>
          </Group>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Num label={estCopro({ type: d.type ?? "appartement" }) ? "Surface Carrez" : "Surface habitable"} suffix="m²" value={d.surface} onChange={(v) => set("surface", v)} decimal />
            {(d.type === "maison" || d.type === "terrain" || d.type === "immeuble") && <Num label="Terrain" suffix="m²" value={d.surfaceTerrain} onChange={(v) => set("surfaceTerrain", v)} />}
            {habitable && <Num label="Pièces" value={d.pieces} onChange={(v) => set("pieces", v)} />}
            {habitable && <Num label="Chambres" value={d.chambres} onChange={(v) => set("chambres", v)} />}
            {d.type !== "terrain" && <Num label="Étage" value={d.etage} onChange={(v) => set("etage", v)} hint="0 = RDC" />}
            {d.type !== "terrain" && <Num label="Étages (immeuble)" value={d.nbEtages} onChange={(v) => set("nbEtages", v)} />}
            <Field label="Référence">
              <input className="input" value={d.ref ?? ""} onChange={(e) => set("ref", e.target.value || undefined)} placeholder="TAPP…" />
            </Field>
          </div>
          {d.type !== "terrain" && (
            <div className="grid grid-cols-2 gap-3">
              <TriState label="Ascenseur" value={d.ascenseur} onChange={(v) => set("ascenseur", v)} />
              <TriState label="Cave" value={d.cave} onChange={(v) => set("cave", v)} />
            </div>
          )}
          <Suggest label="Extérieur" value={d.exterieur} onChange={(v) => set("exterieur", v)} options={EXTERIEURS} placeholder="Ex. Balcon de 8 m² plein sud" />
          <Suggest label="Stationnement" value={d.parking} onChange={(v) => set("parking", v)} options={PARKINGS} placeholder="Ex. Place en sous-sol" />
        </Section>

        <Section id="adresse" title="Adresse" icon={MapPin}>
          <Field label="Adresse *">
            <input className="input" value={d.adresse ?? ""} onChange={(e) => set("adresse", e.target.value)} placeholder="12 rue des Filatiers" autoComplete="street-address" />
          </Field>
          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
            <Field label="Code postal">
              <input className="input" value={d.codePostal ?? ""} onChange={(e) => set("codePostal", e.target.value || undefined)} inputMode="numeric" placeholder="31000" maxLength={5} />
            </Field>
            <Field label="Ville">
              <input className="input" value={d.ville ?? ""} onChange={(e) => set("ville", e.target.value)} placeholder="Toulouse" />
            </Field>
          </div>
          <Field label="Quartier">
            <input className="input" list="patrim-quartiers" value={d.quartier ?? ""} onChange={(e) => set("quartier", e.target.value || undefined)} placeholder="Carmes, Saint-Cyprien…" />
            <datalist id="patrim-quartiers">
              {TOULOUSE_QUARTIERS.map((q) => (
                <option key={q.n} value={q.name} />
              ))}
            </datalist>
          </Field>
        </Section>

        <Section id="prix" title="Prix & mandat" icon={Euro}>
          <div className="grid grid-cols-2 gap-3">
            <Num label="Prix affiché (FAI)" suffix="€" value={d.prix} onChange={(v) => set("prix", v)} big />
            <Num label="Net vendeur" suffix="€" value={d.netVendeur} onChange={(v) => set("netVendeur", v)} big />
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 text-sm">
            <div>
              <div className="text-[11px] text-muted">Honoraires</div>
              <div className={cx("font-semibold", honoraires != null && honoraires < 0 && "text-danger")}>
                {honoraires != null ? eur(honoraires) : "—"}
                {tauxHono != null && honoraires! >= 0 && <span className="ml-1 text-xs font-normal text-muted">({(tauxHono * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)</span>}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Prix au m²</div>
              <div className="font-semibold">{pm2 ? eur(pm2) : "—"}</div>
            </div>
          </div>
          <Group label="Honoraires à la charge de">
            <Segmented
              value={d.honorairesCharge}
              onChange={(v) => set("honorairesCharge", v)}
              options={[
                { value: "acquereur", label: "L'acquéreur" },
                { value: "vendeur", label: "Le vendeur" },
              ]}
            />
          </Group>
          <Field label="Statut">
            <select className="input" value={d.statut} onChange={(e) => set("statut", e.target.value as BienStatut)}>
              {STATUTS.map((s) => (
                <option key={s} value={s}>
                  {STATUT_BIEN[s].label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="N° de mandat">
              <input className="input" value={d.mandat?.numero ?? ""} onChange={(e) => setMandat({ numero: e.target.value || undefined })} placeholder="Ex. 2026-118" />
            </Field>
            <Field label="Type de mandat">
              <select className="input" value={d.mandat?.type ?? ""} onChange={(e) => setMandat({ type: (e.target.value || undefined) as MandatType | undefined })}>
                <option value="">—</option>
                {MANDATS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Signé le">
              <input type="date" className="input" value={d.mandat?.debut ?? ""} onChange={(e) => setMandat({ debut: e.target.value || undefined })} />
            </Field>
            <Field label="Fin du mandat">
              <input type="date" className="input" value={d.mandat?.fin ?? ""} onChange={(e) => setMandat({ fin: e.target.value || undefined })} />
            </Field>
            <Field label="Mise en vente le" className="col-span-2 sm:col-span-1">
              <input type="date" className="input" value={d.dateMiseEnVente ?? ""} onChange={(e) => set("dateMiseEnVente", e.target.value || undefined)} />
            </Field>
          </div>
        </Section>

        <Section id="copro" title="Copropriété & charges" icon={ClipboardList}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {d.type !== "maison" && d.type !== "terrain" && <Num label="Lots de copropriété" value={d.lotsCopro} onChange={(v) => set("lotsCopro", v)} />}
            {d.type !== "maison" && d.type !== "terrain" && (
              <Num label="Charges annuelles" suffix="€" value={d.chargesAnnuelles} onChange={(v) => set("chargesAnnuelles", v)} hint={d.chargesAnnuelles ? `soit ${eur(d.chargesAnnuelles / 12)} / mois` : undefined} />
            )}
            <Num label="Taxe foncière" suffix="€" value={d.taxeFonciere} onChange={(v) => set("taxeFonciere", v)} />
          </div>
        </Section>

        <Section id="diag" title="Diagnostics" icon={Gauge}>
          <Group label="Classe énergie (DPE)">
            <Classes value={d.dpe} onChange={(v) => set("dpe", v)} />
          </Group>
          <Group label="Classe climat (GES)">
            <Classes value={d.ges} onChange={(v) => set("ges", v)} />
          </Group>
          <div className="grid grid-cols-2 gap-3">
            <Num label="Année de construction" value={d.anneeConstruction} onChange={(v) => set("anneeConstruction", v)} />
            <Field label="Chauffage">
              <input className="input" list="patrim-chauffages" value={d.chauffage ?? ""} onChange={(e) => set("chauffage", e.target.value || undefined)} placeholder="Individuel gaz…" />
              <datalist id="patrim-chauffages">
                {CHAUFFAGES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        </Section>

        <Section id="vendeur" title="Vendeur(s)" icon={UserRound} note="Confidentiel : n'apparaît jamais dans les annonces ni les mails aux acquéreurs.">
          <ContactPicker value={d.vendeurIds ?? []} onChange={(ids) => set("vendeurIds", ids)} role="vendeur" placeholder="Rechercher ou créer le vendeur…" />
        </Section>

        <Section id="photos" title="Photos" icon={Camera}>
          <PhotosEditor photos={d.photos ?? []} onChange={(p) => set("photos", p)} />
        </Section>

        <Section id="texte" title="Description & points forts" icon={FileText}>
          <Group label="Points forts">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(d.pointsForts ?? []).map((p, i) => (
                <span key={i} className="chip !h-8 !pl-3 !pr-1 !text-xs">
                  {p}
                  <button type="button" onClick={() => set("pointsForts", d.pointsForts!.filter((_, k) => k !== i))} className="grid place-items-center size-6 rounded-full hover:bg-line" aria-label="Retirer">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input"
                value={pf}
                onChange={(e) => setPf(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPf();
                  }
                }}
                placeholder="Ex. Traversant, calme absolu, proche métro…"
              />
              <button type="button" onClick={addPf} className="btn-secondary !px-3" aria-label="Ajouter">
                <Plus size={16} />
              </button>
            </div>
          </Group>
          <Field label="Description" hint="Reprise telle quelle dans la fiche envoyée aux acquéreurs : rien de confidentiel ici.">
            <textarea className="input min-h-[140px]" value={d.description ?? ""} onChange={(e) => set("description", e.target.value || undefined)} placeholder="Ce qui fait le charme du bien, l'état, l'environnement…" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Dossier Drive">
              <input className="input" value={d.driveUrl ?? ""} onChange={(e) => set("driveUrl", e.target.value || undefined)} placeholder="https://drive.google.com/…" inputMode="url" />
            </Field>
            <Field label="Annonce en ligne">
              <input className="input" value={d.annonceUrl ?? ""} onChange={(e) => set("annonceUrl", e.target.value || undefined)} placeholder="https://…" inputMode="url" />
            </Field>
          </div>
          <Field label="Notes internes">
            <textarea className="input min-h-[80px]" value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value || undefined)} placeholder="Visible uniquement par vous" />
          </Field>
        </Section>

        {err && <p className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger">{err}</p>}

        <div className="lg:sticky lg:bottom-4 z-20 flex gap-2 rounded-2xl border border-line bg-surface/90 p-2 shadow-card backdrop-blur-xl">
          <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn-primary flex-[2] sm:flex-none sm:ml-auto sm:px-8" onClick={submit}>
            <Check size={16} /> {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Petits éléments de formulaire ---------- */

function Section({ id, title, icon: Icon, children, note }: { id: string; title: string; icon: typeof Building2; children: ReactNode; note?: string }) {
  return (
    <section id={`sec-${id}`} className="card card-pad scroll-mt-20 lg:scroll-mt-6">
      <header className="mb-4 flex items-center gap-2.5">
        <span className="grid place-items-center size-8 rounded-xl bg-accent/10 text-accent">
          <Icon size={16} />
        </span>
        <div>
          <h2 className="h-section">{title}</h2>
          {note && <p className="text-[11px] text-muted">{note}</p>}
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Num({ label, value, onChange, suffix, hint, decimal, big }: { label: string; value?: number; onChange: (v: number | undefined) => void; suffix?: string; hint?: ReactNode; decimal?: boolean; big?: boolean }) {
  const [txt, setTxt] = useState(value != null ? fmt(value) : "");
  const [last, setLast] = useState(value);
  if (value !== last) {
    setLast(value);
    if (parse(txt) !== value) setTxt(value != null ? fmt(value) : "");
  }
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          className={cx("input", suffix && "pr-9", big && "!h-11 text-base font-semibold")}
          inputMode={decimal ? "decimal" : "numeric"}
          value={txt}
          onChange={(e) => {
            const t = e.target.value.replace(/[^\d.,\s]/g, "");
            setTxt(t);
            const n = parse(t);
            setLast(n);
            onChange(n);
          }}
          onBlur={() => setTxt(value != null ? fmt(value) : "")}
        />
        {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">{suffix}</span>}
      </div>
    </Field>
  );
}
const parse = (t: string) => {
  const s = t.replace(/\s/g, "").replace(",", ".");
  if (!s) return undefined;
  const n = Number(s);
  return isNaN(n) ? undefined : n;
};
const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 }).replace(/ /g, " ");

function TriState({ label, value, onChange }: { label: string; value?: boolean; onChange: (v: boolean | undefined) => void }) {
  return (
    <Group label={label}>
      <Segmented
        value={value == null ? undefined : value ? "oui" : "non"}
        onChange={(v) => onChange(v == null ? undefined : v === "oui")}
        options={[
          { value: "oui", label: "Oui" },
          { value: "non", label: "Non" },
        ]}
      />
    </Group>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value?: T; onChange: (v: T | undefined) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(value === o.value ? undefined : o.value)}
          className={cx("flex-1 h-8 rounded-lg text-xs font-medium transition", value === o.value ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Classes({ value, onChange }: { value?: ClasseDpe; onChange: (v: ClasseDpe | undefined) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {CLASSES.map((c) => {
        const on = value === c;
        return (
          <button
            type="button"
            key={c}
            onClick={() => onChange(on ? undefined : c)}
            className={cx("h-10 rounded-lg text-sm font-bold transition", on ? "ring-2 ring-offset-2 ring-offset-surface ring-fg/60 scale-105" : "opacity-45 hover:opacity-80")}
            style={{ background: DPE_COLORS[c], color: c === "D" ? "#333" : "white" }}
            aria-pressed={on}
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}

function Suggest({ label, value, onChange, options, placeholder }: { label: string; value?: string; onChange: (v: string | undefined) => void; options: string[]; placeholder?: string }) {
  return (
    <Group label={label}>
      <input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} placeholder={placeholder} aria-label={label} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button type="button" key={o} onClick={() => onChange(value === o ? undefined : o)} className={cx("chip !h-7 transition", value === o && "!bg-accent/10 !text-accent !border-accent/30")}>
            {o}
          </button>
        ))}
      </div>
    </Group>
  );
}

/** Comme Field, mais sans <label> (pour les groupes de boutons). */
function Group({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </div>
  );
}
