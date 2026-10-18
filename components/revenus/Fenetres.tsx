"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Field, Sheet, Spinner, cx } from "@/components/ui";
import { eur } from "@/lib/format";
import { uid } from "@/lib/store";
import { ErreurLecture } from "@/components/ics/lecture";
import { lireClasseur, lireFeuilles, type Reprise } from "./excel";
import { enregistrer, supprimer } from "./stockage";
import {
  TYPE_DOSSIER,
  commissionDe,
  delais,
  ligne,
  majuscule,
  nomMois,
  type Contrat,
  type Donnees,
  type MoisRevenu,
  type Periode,
  type StatutVente,
  type TypeDossier,
  type VenteRevenu,
} from "./revenus";

/* Fenêtres de « Mes revenus » : pointer un mois, un dossier, le contrat, la reprise de l'Excel. */

type Doc = Parameters<typeof enregistrer>[0][number];

const nb = (t: string) => {
  const n = Number(t.replace(/\s|€/g, "").replace(",", "."));
  return t.trim() === "" || !Number.isFinite(n) ? undefined : n;
};
const texte = (n?: number) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
const s = (n: number) => (n > 1 ? "s" : "");

function Erreur({ msg }: { msg: string }) {
  return msg ? <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{msg}</p> : null;
}

function Montant({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input className="input pr-8 tabular-nums" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>
      </div>
    </Field>
  );
}

/* ---------- Pointer un mois ---------- */

export function PointerMois({ mois, d, auj, onClose, onVente }: { mois: string | null; d: Donnees; auj: string; onClose: () => void; onVente: () => void }) {
  const l = mois ? ligne(mois, d, auj) : undefined;
  const vide = { fixe: "", commissions: "", primes: "", ik: "", autres: "", verse: "", note: "" };
  const [f, setF] = useState(vide);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!l) return;
    setMsg("");
    setF({
      fixe: texte(l.pointe?.fixe ?? (l.fixeConnu ? l.fixe : undefined)),
      commissions: texte(l.pointe?.commissions),
      primes: texte(l.pointe?.primes),
      ik: texte(l.pointe?.ik ?? l.periode?.ik),
      autres: texte(l.pointe?.autres),
      verse: texte(l.pointe?.verse),
      note: l.pointe?.note ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mois]);
  if (!mois || !l) return null;

  async function valider() {
    const doc: Doc = {
      id: l!.pointe?.id,
      nature: "mois",
      mois: mois!,
      fixe: nb(f.fixe),
      commissions: nb(f.commissions),
      primes: nb(f.primes),
      ik: nb(f.ik),
      autres: nb(f.autres),
      verse: nb(f.verse),
      note: f.note.trim() || undefined,
      source: "saisie",
    };
    try {
      await enregistrer([doc]);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le mois n'a pas pu être enregistré.");
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={majuscule(nomMois(mois))}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={valider}>
            {l.pointe ? "Enregistrer" : "Pointer le mois"}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">Reprends ta fiche de paie. Les montants sont en {d.contrat.base}, comme ton contrat.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Montant label="Fixe" value={f.fixe} onChange={(v) => setF({ ...f, fixe: v })} hint={l.periode ? l.periode.intitule : "Hors période du contrat"} />
        <Montant label="Indemnités km" value={f.ik} onChange={(v) => setF({ ...f, ik: v })} />
        <Montant label="Autres commissions" value={f.commissions} onChange={(v) => setF({ ...f, commissions: v })} hint="Non détaillées par dossier" />
        <Montant label="Primes" value={f.primes} onChange={(v) => setF({ ...f, primes: v })} />
        <Montant label="Autres" value={f.autres} onChange={(v) => setF({ ...f, autres: v })} hint="Remboursements, avantages…" />
        <Montant label="Total versé" value={f.verse} onChange={(v) => setF({ ...f, verse: v })} hint="Facultatif, pour comparer" />
      </div>

      <div className="mt-5">
        <div className="label">Dossiers payés ce mois-ci</div>
        {l.ventes.length ? (
          <ul className="divide-y divide-line/70 rounded-xl border border-line/70">
            {l.ventes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {v.libelle} <span className="text-muted">· {TYPE_DOSSIER[v.type ?? "vente"]}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{eur(commissionDe(v, d.contrat))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted">Aucun dossier payé ce mois-ci.</p>
        )}
        <button className="btn-ghost btn-sm mt-2" onClick={onVente}>
          <Plus size={15} /> Ajouter un dossier
        </button>
      </div>

      <Field label="Note" className="mt-4">
        <textarea className="input min-h-[72px]" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Congés, régularisation…" />
      </Field>
      <Erreur msg={msg} />
    </Sheet>
  );
}

/* ---------- Un dossier ---------- */

const STATUTS: Record<TypeDossier, { value: StatutVente; label: string }[]> = {
  vente: [
    { value: "acte", label: "Acte signé" },
    { value: "compromis", label: "Sous compromis" },
    { value: "offre", label: "Offre acceptée" },
  ],
  location: [
    { value: "acte", label: "Encaissée" },
    { value: "offre", label: "En attente" },
  ],
  gestion: [
    { value: "acte", label: "Encaissée" },
    { value: "offre", label: "En attente" },
  ],
};

export function FicheVente({ vente, d, auj, onClose }: { vente: VenteRevenu | "nouvelle" | null; d: Donnees; auj: string; onClose: () => void }) {
  const v = vente && vente !== "nouvelle" ? vente : undefined;
  /** Vente lue sur la fiche d'un bien du Hub : pas encore dans les dossiers. */
  const duHub = !!v?.id.startsWith("hub:");
  const vide = { type: "vente" as TypeDossier, libelle: "", adresse: "", honoraires: "", partage: "1", statut: "acte" as StatutVente, dateOffre: "", dateCompromis: "", dateActe: auj, moisPaie: "", commission: "" };
  const [f, setF] = useState(vide);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setMsg("");
    setF(
      v
        ? {
            type: v.type ?? "vente",
            libelle: v.libelle,
            adresse: v.adresse ?? "",
            honoraires: texte(v.honoraires),
            partage: String(v.partage || 1),
            statut: v.statut,
            dateOffre: v.dateOffre ?? "",
            dateCompromis: v.dateCompromis ?? "",
            dateActe: v.dateActe ?? "",
            moisPaie: v.moisPaie ?? "",
            commission: texte(v.commission),
          }
        : vide
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vente]);
  if (!vente) return null;

  const brouillon: VenteRevenu = {
    id: duHub ? "" : (v?.id ?? ""),
    nature: "vente",
    type: f.type,
    libelle: f.libelle.trim(),
    adresse: f.adresse.trim() || undefined,
    mandat: v?.mandat,
    prixVente: v?.prixVente,
    honoraires: nb(f.honoraires),
    dateOffre: f.type === "vente" ? f.dateOffre || undefined : undefined,
    dateCompromis: f.type === "vente" ? f.dateCompromis || undefined : undefined,
    dateActe: f.dateActe || undefined,
    moisPaie: f.moisPaie || undefined,
    statut: f.statut,
    partage: Math.max(1, Math.round(nb(f.partage) ?? 1)),
    commission: nb(f.commission),
    source: v?.source ?? "saisie",
    cle: v?.cle,
    bienId: v?.bienId,
    updatedAt: "",
  };
  const calculee = commissionDe({ ...brouillon, commission: undefined }, d.contrat);
  const c = d.contrat;
  const pct = (x: number) => `${Math.round(x * 1000) / 10} %`.replace(".", ",");
  const ttc = c.honorairesTTC ? "TTC" : "HT";
  const champ = f.type === "gestion" ? "Loyer mensuel" : f.type === "location" ? `Honoraires locataire ${ttc}` : `Honoraires agence ${ttc}`;
  const regle =
    f.type === "gestion"
      ? `${pct(c.tauxGestion)} du loyer × ${c.moisGestion} mois`
      : f.type === "location"
        ? `${pct(c.tauxLocation)} des honoraires HT (locataire × 2)`
        : `${pct(c.taux)} des honoraires HT`;

  async function valider() {
    if (!brouillon.libelle) return setMsg("Donne un nom au dossier (propriétaire ou bien).");
    if (brouillon.statut === "acte" && !brouillon.dateActe && !brouillon.moisPaie) return setMsg("Indique la date (acte ou encaissement) : c'est le mois où la commission est payée.");
    const { updatedAt: _u, ...doc } = brouillon;
    try {
      await enregistrer([{ ...doc, id: doc.id || undefined }]);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le dossier n'a pas pu être enregistré.");
    }
  }
  async function ignorer() {
    if (!v?.bienId) return;
    const { updatedAt: _u, ...c } = d.contrat;
    try {
      await enregistrer([{ ...c, id: c.id || undefined, nature: "contrat", ignores: [...new Set([...(c.ignores ?? []), v.bienId])] }]);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le changement n'a pas pu être enregistré.");
    }
  }
  async function effacer() {
    if (!v || !confirm(`Retirer « ${v.libelle} » de tes revenus ?`)) return;
    try {
      await supprimer(v.id);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le dossier n'a pas pu être retiré.");
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={v ? v.libelle : "Nouveau dossier"}
      footer={
        <>
          {duHub ? (
            <button className="btn-ghost mr-auto text-muted" onClick={ignorer}>
              Ne pas compter
            </button>
          ) : (
            v && (
              <button className="btn-ghost mr-auto text-danger" onClick={effacer} aria-label="Retirer le dossier">
                <Trash2 size={16} />
              </button>
            )
          )}
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={valider}>
            Enregistrer
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        {duHub && (
          <p className="rounded-xl bg-surface-2/70 px-3 py-2.5 text-sm text-muted ring-1 ring-inset ring-line/60">
            Repris de la fiche du bien. Enregistre-le pour l&apos;ajouter à tes dossiers (tu peux préciser le partage ou la date de l&apos;acte), ou choisis « Ne pas compter » si ce n&apos;est pas ta vente.
          </p>
        )}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1" role="radiogroup" aria-label="Type de dossier">
          {(Object.keys(TYPE_DOSSIER) as TypeDossier[]).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={f.type === t}
              onClick={() => setF({ ...f, type: t, statut: STATUTS[t].some((x) => x.value === f.statut) ? f.statut : "acte" })}
              className={cx("h-10 rounded-xl text-sm font-medium transition", f.type === t ? "bg-surface text-fg shadow-sm" : "text-muted")}
            >
              {TYPE_DOSSIER[t]}
            </button>
          ))}
        </div>
        <Field label="Dossier">
          <input className="input" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="Nom du propriétaire ou du bien" />
        </Field>
        <Field label="Où en est-il">
          <select className="input" value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value as StatutVente })}>
            {STATUTS[f.type].map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {f.type === "vente" && f.statut === "offre" && (
            <Field label="Offre acceptée le">
              <input type="date" className="input" value={f.dateOffre} onChange={(e) => setF({ ...f, dateOffre: e.target.value })} />
            </Field>
          )}
          {f.type === "vente" && (
            <Field label="Compromis">
              <input type="date" className="input" value={f.dateCompromis} onChange={(e) => setF({ ...f, dateCompromis: e.target.value })} />
            </Field>
          )}
          <Field label={f.type === "vente" ? (f.statut === "acte" ? "Acte signé le" : "Acte prévu le") : f.statut === "acte" ? "Encaissée le" : "Prévue le"}>
            <input type="date" className="input" value={f.dateActe} onChange={(e) => setF({ ...f, dateActe: e.target.value })} />
          </Field>
          <Field label="Payée avec la paie de" hint="Vide = mois de la date">
            <input type="month" className="input" value={f.moisPaie} onChange={(e) => setF({ ...f, moisPaie: e.target.value })} />
          </Field>
          <Montant label={champ} value={f.honoraires} onChange={(x) => setF({ ...f, honoraires: x })} />
          <Field label="Commerciaux" hint="La commission est partagée">
            <input className="input tabular-nums" inputMode="numeric" value={f.partage} onChange={(e) => setF({ ...f, partage: e.target.value })} />
          </Field>
        </div>
        <Montant
          label="Ma commission"
          value={f.commission}
          onChange={(x) => setF({ ...f, commission: x })}
          hint={calculee != null ? `Laisse vide pour le calcul : ${eur(calculee)} (${regle}${brouillon.partage > 1 ? `, partagés à ${brouillon.partage}` : ""})` : `Laisse vide pour la calculer (${regle})`}
        />
      </div>
      <Erreur msg={msg} />
    </Sheet>
  );
}

/* ---------- Le contrat ---------- */

type PeriodeSaisie = Omit<Periode, "fixe" | "ik"> & { fixe: string; ik: string };

export function FicheContrat({ open, d, auj, onClose }: { open: boolean; d: Donnees; auj: string; onClose: () => void }) {
  const an = auj.slice(0, 4);
  const [periodes, setPeriodes] = useState<PeriodeSaisie[]>([]);
  const [base, setBase] = useState<"brut" | "net">("brut");
  const [taux, setTaux] = useState("15");
  const [ttc, setTtc] = useState(true);
  const [objectif, setObjectif] = useState("");
  const [delaiC, setDelaiC] = useState("1");
  const [delaiA, setDelaiA] = useState("3");
  const [ignores, setIgnores] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!open) return;
    const c = d.contrat;
    setMsg("");
    setPeriodes(
      c.periodes.length
        ? c.periodes.map((p) => ({ ...p, fixe: texte(p.fixe), ik: texte(p.ik) }))
        : [{ id: uid(), intitule: "Alternance", debut: "", fin: "", fixe: "", ik: "" }]
    );
    setBase(c.base);
    setTaux(texte(c.taux * 100));
    setTtc(c.honorairesTTC);
    setObjectif(texte(c.objectifs[an]));
    setDelaiC(String(delais(c).compromis));
    setDelaiA(String(delais(c).acte));
    setIgnores(c.ignores ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;

  async function valider() {
    const ps: Periode[] = periodes
      .filter((p) => p.debut)
      .map((p) => ({ id: p.id, intitule: p.intitule.trim() || "Contrat", debut: p.debut, fin: p.fin || undefined, fixe: nb(p.fixe), ik: nb(p.ik), treizieme: p.treizieme || undefined }))
      .sort((a, b) => a.debut.localeCompare(b.debut));
    const t = nb(taux);
    if (t == null || t <= 0 || t > 100) return setMsg("Le taux de commission doit être un pourcentage, par exemple 15.");
    const obj = nb(objectif);
    const objectifs = { ...d.contrat.objectifs };
    if (obj != null) objectifs[an] = obj;
    else delete objectifs[an];
    const mois = (x: string, defaut: number) => {
      const n = nb(x);
      return n != null && n >= 0 && n <= 24 ? Math.round(n) : defaut;
    };
    const { updatedAt: _u, ...c } = d.contrat;
    try {
      await enregistrer([
        { ...c, id: c.id || undefined, nature: "contrat", periodes: ps, base, taux: t / 100, honorairesTTC: ttc, objectifs, delaiCompromis: mois(delaiC, 1), delaiActe: mois(delaiA, 3), ignores },
      ]);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le contrat n'a pas pu être enregistré.");
    }
  }
  const maj = (i: number, p: Partial<PeriodeSaisie>) => setPeriodes(periodes.map((x, k) => (k === i ? { ...x, ...p } : x)));

  return (
    <Sheet
      open
      onClose={onClose}
      title="Mon contrat"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={valider}>
            Enregistrer
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">Une ligne par période : ton fixe et tes indemnités se reportent tout seuls sur chaque mois que tu n&apos;as pas pointé.</p>
      <div className="mt-4 space-y-3">
        {periodes.map((p, i) => (
          <div key={p.id} className="rounded-2xl border border-line/80 p-3">
            <div className="flex items-center gap-2">
              <input className="input flex-1" value={p.intitule} onChange={(e) => maj(i, { intitule: e.target.value })} placeholder="Alternance, CDI…" aria-label="Période" />
              <button className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:text-danger" onClick={() => setPeriodes(periodes.filter((_, k) => k !== i))} aria-label="Retirer la période">
                <Trash2 size={16} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Du mois">
                <input type="month" className="input" value={p.debut} onChange={(e) => maj(i, { debut: e.target.value })} />
              </Field>
              <Field label="Au mois" hint="Vide = en cours">
                <input type="month" className="input" value={p.fin ?? ""} onChange={(e) => maj(i, { fin: e.target.value })} />
              </Field>
              <Montant label={`Fixe ${base}`} value={p.fixe} onChange={(v) => maj(i, { fixe: v })} />
              <Montant label="Indemnités km" value={p.ik} onChange={(v) => maj(i, { ik: v })} />
            </div>
            <label className="mt-2 flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand" checked={!!p.treizieme} onChange={(e) => maj(i, { treizieme: e.target.checked })} />
              13e mois en décembre
            </label>
          </div>
        ))}
        <button className="btn-ghost btn-sm" onClick={() => setPeriodes([...periodes, { id: uid(), intitule: "CDI", debut: "", fin: "", fixe: "", ik: "" }])}>
          <Plus size={15} /> Ajouter une période
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Field label="Montants en">
          <select className="input" value={base} onChange={(e) => setBase(e.target.value as "brut" | "net")}>
            <option value="brut">Brut</option>
            <option value="net">Net</option>
          </select>
        </Field>
        <Field label="Sur une vente" hint="% des honoraires HT">
          <div className="relative">
            <input className="input pr-8 tabular-nums" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
          </div>
        </Field>
        <Field label="Honoraires saisis">
          <select className="input" value={ttc ? "ttc" : "ht"} onChange={(e) => setTtc(e.target.value === "ttc")}>
            <option value="ttc">TTC</option>
            <option value="ht">HT</option>
          </select>
        </Field>
        <Montant label={`Objectif ${an}`} value={objectif} onChange={setObjectif} hint="En commissions" />
      </div>
      <div className="mt-5">
        <div className="text-sm font-semibold">Pour le prévisionnel</div>
        <p className="mt-0.5 text-xs text-muted">Quand l&apos;acte n&apos;a pas de date, il est estimé avec ces délais.</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Field label="Offre → compromis" hint="En mois">
            <input className="input tabular-nums" inputMode="numeric" value={delaiC} onChange={(e) => setDelaiC(e.target.value)} />
          </Field>
          <Field label="Compromis → acte" hint="En mois">
            <input className="input tabular-nums" inputMode="numeric" value={delaiA} onChange={(e) => setDelaiA(e.target.value)} />
          </Field>
        </div>
        {ignores.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted">
            <span>
              {ignores.length} vente{ignores.length > 1 ? "s" : ""} du Hub non comptée{ignores.length > 1 ? "s" : ""}
            </span>
            <button className="btn-ghost btn-sm" onClick={() => setIgnores([])}>
              Les recompter
            </button>
          </div>
        )}
      </div>
      <Erreur msg={msg} />
    </Sheet>
  );
}

/* ---------- Reprise de l'Excel ---------- */

export function RepriseExcel({ open, d, prenom, auj, onClose }: { open: boolean; d: Donnees; prenom: string; auj: string; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [lu, setLu] = useState<Reprise | null>(null);
  const [etat, setEtat] = useState<"" | "lecture" | "envoi" | "fait">("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (open) {
      setLu(null);
      setEtat("");
      setMsg("");
    }
  }, [open]);
  if (!open) return null;

  async function lire(fichier?: File) {
    if (!fichier) return;
    setEtat("lecture");
    setMsg("");
    try {
      const f = await lireFeuilles(new Uint8Array(await fichier.arrayBuffer()));
      const r = lireClasseur(f, prenom, auj);
      if (!r.ventes.length && !r.mois.length) throw new ErreurLecture(`Aucune vente au nom de ${prenom} dans la colonne Commercial de ce classeur.`);
      setLu(r);
      setEtat("");
    } catch (e) {
      setEtat("");
      setMsg(e instanceof ErreurLecture ? e.message : "Ce fichier n'a pas pu être lu. Vérifie que c'est bien un classeur Excel (.xlsx).");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const parCle = new Map(d.ventes.filter((v) => v.cle).map((v) => [v.cle!, v]));
  const parMois = new Map(d.mois.map((m) => [m.mois, m]));
  const gardes = lu ? lu.mois.filter((m) => parMois.get(m.mois)?.source === "saisie").length : 0;

  async function importer() {
    if (!lu) return;
    setEtat("envoi");
    try {
      const docs: Doc[] = [];
      for (const v of lu.ventes) {
        const avant = parCle.get(v.cle!);
        docs.push({ ...v, id: avant?.id, commission: v.commission ?? avant?.commission });
      }
      for (const m of lu.mois) {
        const avant = parMois.get(m.mois);
        if (avant?.source === "saisie") continue; // un mois pointé dans le Hub reste tel quel
        docs.push({ ...m, id: avant?.id, note: avant?.note });
      }
      const c = d.contrat;
      const { updatedAt: _u, ...contrat } = c;
      const r = lu.reglages;
      docs.push({
        ...contrat,
        id: c.id || undefined,
        nature: "contrat",
        periodes: lu.periodes.length ? lu.periodes : c.periodes,
        base: r.base ?? c.base,
        taux: r.taux ?? c.taux,
        tauxLocation: r.tauxLocation ?? c.tauxLocation,
        tauxGestion: r.tauxGestion ?? c.tauxGestion,
        moisGestion: r.moisGestion ?? c.moisGestion,
        honorairesTTC: r.honorairesTTC ?? c.honorairesTTC,
        tva: r.tva ?? c.tva,
        objectifs: { ...lu.objectifs, ...c.objectifs },
      });
      await enregistrer(docs);
      // Le classeur personnel couvre déjà les commissions de ventes : on retire celles reprises du suivi de l'agence
      if (lu.genre === "revenus") for (const v of d.ventes.filter((x) => x.cle?.startsWith("excel:"))) await supprimer(v.id);
      setEtat("fait");
    } catch (e) {
      setEtat("");
      setMsg(e instanceof Error ? e.message : "La reprise n'a pas pu être enregistrée.");
    }
  }

  const contratLu = { ...d.contrat, ...Object.fromEntries(Object.entries(lu?.reglages ?? {}).filter(([, x]) => x != null)) } as Contrat;
  const encaisses = lu?.ventes.filter((v) => v.statut === "acte") ?? [];
  const enCours = lu?.ventes.filter((v) => v.statut !== "acte") ?? [];
  const comDossiers = encaisses.reduce((t, v) => t + (commissionDe({ ...v, id: "", updatedAt: "" }, contratLu) ?? 0), 0);
  const totalMois = lu?.mois.reduce((t, m) => t + (m.fixe ?? 0) + (m.commissions ?? 0) + (m.ik ?? 0) + (m.primes ?? 0) + (m.autres ?? 0), 0) ?? 0;
  const comMois = lu?.mois.reduce((t, m) => t + (m.commissions ?? 0), 0) ?? 0;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Reprendre mon Excel"
      footer={
        etat === "fait" ? (
          <button className="btn-primary" onClick={onClose}>
            Voir mes revenus
          </button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Annuler
            </button>
            {lu && (
              <button className="btn-primary" onClick={importer} disabled={etat === "envoi"}>
                {etat === "envoi" ? <Spinner /> : null} Reprendre
              </button>
            )}
          </>
        )
      }
    >
      {etat === "fait" ? (
        <p className="text-sm">
          C&apos;est fait : ton historique est dans tes revenus. Désormais, pointe chaque mois ici. Si tu reprends à nouveau l&apos;Excel, les mois que tu as pointés dans le Hub ne sont pas touchés et rien n&apos;est compté deux fois.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Choisis ton classeur de revenus (par exemple «&nbsp;Quentin vf&nbsp;», depuis Drive ou ton téléphone). Il est lu ici, sur ton appareil, et rien n&apos;est envoyé ailleurs que dans ton compte.
          </p>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => lire(e.target.files?.[0])} />
          <button className={cx("btn-secondary mt-4 w-full", etat === "lecture" && "opacity-70")} onClick={() => input.current?.click()} disabled={etat === "lecture"}>
            {etat === "lecture" ? <Spinner /> : <FileSpreadsheet size={17} />} {lu ? "Choisir un autre fichier" : "Choisir le fichier Excel"}
          </button>
          {lu && (
            <div className="mt-4 space-y-1 rounded-2xl bg-surface-2/70 p-4 text-sm ring-1 ring-inset ring-line/60">
              {lu.genre === "revenus" ? (
                <>
                  <div className="font-semibold">
                    {lu.mois.length} mois, de {nomMois(lu.mois[0].mois)} à {nomMois(lu.mois[lu.mois.length - 1].mois)}
                  </div>
                  <div className="text-muted">
                    {eur(totalMois + comDossiers)} perçus, dont {eur(comMois + comDossiers)} de commissions{encaisses.length ? ` (${encaisses.length} dossier${s(encaisses.length)} détaillé${s(encaisses.length)})` : ""}.
                  </div>
                  {lu.periodes.length > 0 && (
                    <div className="text-muted">
                      Contrat : {lu.periodes.map((p) => `${p.intitule} depuis ${nomMois(p.debut)}${p.fixe != null ? ` (${eur(p.fixe)} de fixe)` : ""}`).join(", puis ")}.
                    </div>
                  )}
                  {gardes > 0 && <div className="text-muted">{gardes} mois déjà pointé{s(gardes)} dans le Hub, gardé{s(gardes)} tel{s(gardes)} quel{s(gardes)}.</div>}
                </>
              ) : (
                <>
                  <div className="font-semibold">
                    {encaisses.length} vente{s(encaisses.length)} actée{s(encaisses.length)}, {eur(comDossiers)} de commissions
                  </div>
                  {enCours.length > 0 && <div className="text-muted">+ {enCours.length} vente{s(enCours.length)} en cours (compromis ou offre)</div>}
                  {lu.ignorees > 0 && <div className="text-warn">{lu.ignorees} vente{s(lu.ignorees)} actée{s(lu.ignorees)} sans date d&apos;acte, non reprise{s(lu.ignorees)}.</div>}
                </>
              )}
            </div>
          )}
        </>
      )}
      <Erreur msg={msg} />
    </Sheet>
  );
}
