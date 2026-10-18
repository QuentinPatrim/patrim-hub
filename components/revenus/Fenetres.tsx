"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Field, Sheet, Spinner, cx } from "@/components/ui";
import { eur } from "@/lib/format";
import { uid } from "@/lib/store";
import { ErreurLecture } from "@/components/ics/lecture";
import { lireFeuilles, lireSuivi, type Reprise } from "./excel";
import { enregistrer, supprimer } from "./stockage";
import { commissionDe, ligne, majuscule, nomMois, type Contrat, type Donnees, type MoisRevenu, type Periode, type StatutVente, type VenteRevenu } from "./revenus";

/* Fenêtres de « Mes revenus » : pointer un mois, ajouter une vente, régler le contrat, reprendre l'Excel. */

const nb = (t: string) => {
  const n = Number(t.replace(/\s|€/g, "").replace(",", "."));
  return t.trim() === "" || !Number.isFinite(n) ? undefined : n;
};
const texte = (n?: number) => (n == null ? "" : String(Math.round(n * 100) / 100).replace(".", ","));

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
  const [f, setF] = useState({ fixe: "", primes: "", autres: "", verse: "", note: "" });
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!l) return;
    setMsg("");
    setF({
      fixe: texte(l.pointe?.fixe ?? l.periode?.fixe),
      primes: texte(l.pointe?.primes),
      autres: texte(l.pointe?.autres),
      verse: texte(l.pointe?.verse),
      note: l.pointe?.note ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mois]);
  if (!mois || !l) return null;

  async function valider() {
    const doc: Omit<MoisRevenu, "id" | "updatedAt"> & { id?: string } = {
      id: l!.pointe?.id,
      nature: "mois",
      mois: mois!,
      fixe: nb(f.fixe),
      primes: nb(f.primes),
      autres: nb(f.autres),
      verse: nb(f.verse),
      note: f.note.trim() || undefined,
    };
    try {
      await enregistrer([doc]);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le mois n'a pas pu être enregistré.");
    }
  }

  const base = d.contrat.base;
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
      <p className="text-sm text-muted">Reprends ta fiche de paie. Les montants sont en {base}, comme ton contrat.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Montant label="Fixe" value={f.fixe} onChange={(v) => setF({ ...f, fixe: v })} hint={l.periode ? `${l.periode.intitule}` : "Hors période du contrat"} />
        <Montant label="Primes" value={f.primes} onChange={(v) => setF({ ...f, primes: v })} />
        <Montant label="Autres" value={f.autres} onChange={(v) => setF({ ...f, autres: v })} hint="Remboursements, avantages…" />
        <Montant label="Total versé" value={f.verse} onChange={(v) => setF({ ...f, verse: v })} hint="Facultatif, pour comparer" />
      </div>

      <div className="mt-5">
        <div className="label">Commissions du mois</div>
        {l.ventes.length ? (
          <ul className="divide-y divide-line/70 rounded-xl border border-line/70">
            {l.ventes.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">{v.libelle}</span>
                <span className="shrink-0 font-semibold tabular-nums">{eur(commissionDe(v, d.contrat))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-3 py-3 text-sm text-muted">Aucun acte signé ce mois-ci.</p>
        )}
        <button className="btn-ghost btn-sm mt-2" onClick={onVente}>
          <Plus size={15} /> Ajouter une vente actée
        </button>
      </div>

      <Field label="Note" className="mt-4">
        <textarea className="input min-h-[72px]" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Congés, régularisation…" />
      </Field>
      <Erreur msg={msg} />
    </Sheet>
  );
}

/* ---------- Une vente ---------- */

const STATUTS: { value: StatutVente; label: string }[] = [
  { value: "acte", label: "Acte signé" },
  { value: "compromis", label: "Sous compromis" },
  { value: "offre", label: "Offre acceptée" },
];

export function FicheVente({ vente, d, auj, onClose }: { vente: VenteRevenu | "nouvelle" | null; d: Donnees; auj: string; onClose: () => void }) {
  const v = vente && vente !== "nouvelle" ? vente : undefined;
  const vide = { libelle: "", adresse: "", honoraires: "", partage: "1", statut: "acte" as StatutVente, dateCompromis: "", dateActe: auj, commission: "" };
  const [f, setF] = useState(vide);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    setMsg("");
    setF(
      v
        ? {
            libelle: v.libelle,
            adresse: v.adresse ?? "",
            honoraires: texte(v.honoraires),
            partage: String(v.partage || 1),
            statut: v.statut,
            dateCompromis: v.dateCompromis ?? "",
            dateActe: v.dateActe ?? "",
            commission: texte(v.commission),
          }
        : vide
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vente]);
  if (!vente) return null;

  const brouillon: VenteRevenu = {
    id: v?.id ?? "",
    nature: "vente",
    libelle: f.libelle.trim(),
    adresse: f.adresse.trim() || undefined,
    mandat: v?.mandat,
    prixVente: v?.prixVente,
    honoraires: nb(f.honoraires),
    dateCompromis: f.dateCompromis || undefined,
    dateActe: f.dateActe || undefined,
    statut: f.statut,
    partage: Math.max(1, Math.round(nb(f.partage) ?? 1)),
    commission: nb(f.commission),
    source: v?.source ?? "saisie",
    cle: v?.cle,
    updatedAt: "",
  };
  const calculee = commissionDe({ ...brouillon, commission: undefined }, d.contrat);

  async function valider() {
    if (!brouillon.libelle) return setMsg("Donne un nom à la vente (propriétaire ou bien).");
    if (brouillon.statut === "acte" && !brouillon.dateActe) return setMsg("Indique la date de l'acte : c'est le mois où la commission est payée.");
    const { updatedAt: _u, ...doc } = brouillon;
    try {
      await enregistrer([{ ...doc, id: v?.id }]);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "La vente n'a pas pu être enregistrée.");
    }
  }
  async function effacer() {
    if (!v || !confirm(`Retirer « ${v.libelle} » de tes revenus ?`)) return;
    try {
      await supprimer(v.id);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "La vente n'a pas pu être retirée.");
    }
  }

  const ht = d.contrat.honorairesTTC ? "TTC" : "HT";
  return (
    <Sheet
      open
      onClose={onClose}
      title={v ? v.libelle : "Nouvelle vente"}
      footer={
        <>
          {v && (
            <button className="btn-ghost mr-auto text-danger" onClick={effacer} aria-label="Retirer la vente">
              <Trash2 size={16} />
            </button>
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
        <Field label="Vente">
          <input className="input" value={f.libelle} onChange={(e) => setF({ ...f, libelle: e.target.value })} placeholder="Nom du propriétaire ou du bien" />
        </Field>
        <Field label="Adresse">
          <input className="input" value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} />
        </Field>
        <Field label="Où en est la vente">
          <select className="input" value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value as StatutVente })}>
            {STATUTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Compromis">
            <input type="date" className="input" value={f.dateCompromis} onChange={(e) => setF({ ...f, dateCompromis: e.target.value })} />
          </Field>
          <Field label={f.statut === "acte" ? "Acte signé le" : "Acte prévu le"}>
            <input type="date" className="input" value={f.dateActe} onChange={(e) => setF({ ...f, dateActe: e.target.value })} />
          </Field>
          <Montant label={`Honoraires agence ${ht}`} value={f.honoraires} onChange={(x) => setF({ ...f, honoraires: x })} />
          <Field label="Commerciaux sur le dossier" hint="La commission est partagée">
            <input className="input tabular-nums" inputMode="numeric" value={f.partage} onChange={(e) => setF({ ...f, partage: e.target.value })} />
          </Field>
        </div>
        <Montant
          label="Ma commission"
          value={f.commission}
          onChange={(x) => setF({ ...f, commission: x })}
          hint={calculee != null ? `Laisse vide pour le calcul : ${eur(calculee)} (${Math.round(d.contrat.taux * 100)} % des honoraires HT${brouillon.partage > 1 ? `, partagés à ${brouillon.partage}` : ""})` : "Laisse vide pour la calculer depuis les honoraires"}
        />
      </div>
      <Erreur msg={msg} />
    </Sheet>
  );
}

/* ---------- Le contrat ---------- */

export function FicheContrat({ open, d, auj, onClose }: { open: boolean; d: Donnees; auj: string; onClose: () => void }) {
  const an = auj.slice(0, 4);
  const [periodes, setPeriodes] = useState<(Omit<Periode, "fixe"> & { fixe: string })[]>([]);
  const [base, setBase] = useState<"brut" | "net">("brut");
  const [taux, setTaux] = useState("15");
  const [ttc, setTtc] = useState(true);
  const [objectif, setObjectif] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!open) return;
    const c = d.contrat;
    setMsg("");
    setPeriodes(c.periodes.length ? c.periodes.map((p) => ({ ...p, fixe: texte(p.fixe) })) : [{ id: uid(), intitule: "Alternance", debut: "", fin: "", fixe: "" }]);
    setBase(c.base);
    setTaux(texte(c.taux * 100));
    setTtc(c.honorairesTTC);
    setObjectif(texte(c.objectifs[an]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;

  async function valider() {
    const ps: Periode[] = periodes
      .filter((p) => p.debut)
      .map((p) => ({ id: p.id, intitule: p.intitule.trim() || "Contrat", debut: p.debut, fin: p.fin || undefined, fixe: nb(p.fixe) }))
      .sort((a, b) => a.debut.localeCompare(b.debut));
    const t = nb(taux);
    if (t == null || t <= 0 || t > 100) return setMsg("Le taux de commission doit être un pourcentage, par exemple 15.");
    const obj = nb(objectif);
    const objectifs = { ...d.contrat.objectifs };
    if (obj != null) objectifs[an] = obj;
    else delete objectifs[an];
    const { updatedAt: _u, ...c } = d.contrat;
    try {
      await enregistrer([{ ...c, id: c.id || undefined, nature: "contrat", periodes: ps, base, taux: t / 100, honorairesTTC: ttc, objectifs }]);
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Le contrat n'a pas pu être enregistré.");
    }
  }
  const maj = (i: number, p: Partial<(typeof periodes)[number]>) => setPeriodes(periodes.map((x, k) => (k === i ? { ...x, ...p } : x)));

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
      <p className="text-sm text-muted">Une ligne par période : ton fixe se reporte tout seul sur chaque mois, tu n&apos;as rien à retaper.</p>
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
            </div>
            <div className="mt-2">
              <Montant label={`Fixe mensuel ${base}`} value={p.fixe} onChange={(v) => maj(i, { fixe: v })} />
            </div>
          </div>
        ))}
        <button className="btn-ghost btn-sm" onClick={() => setPeriodes([...periodes, { id: uid(), intitule: "CDI", debut: "", fin: "", fixe: "" }])}>
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
        <Field label="Commission" hint="% des honoraires HT">
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
        <Montant label={`Objectif de commissions ${an}`} value={objectif} onChange={setObjectif} />
      </div>
      <Erreur msg={msg} />
    </Sheet>
  );
}

/* ---------- Reprise de l'Excel ---------- */

export function RepriseExcel({ open, d, prenom, onClose }: { open: boolean; d: Donnees; prenom: string; onClose: () => void }) {
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
      const r = lireSuivi(f, prenom);
      if (!r.ventes.length) throw new ErreurLecture(`Aucune vente au nom de ${prenom} dans la colonne Commercial de ce classeur.`);
      setLu(r);
      setEtat("");
    } catch (e) {
      setEtat("");
      setMsg(e instanceof ErreurLecture ? e.message : "Ce fichier n'a pas pu être lu. Vérifie que c'est bien le classeur Excel des commissions (.xlsx).");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const existantes = new Map(d.ventes.filter((v) => v.cle).map((v) => [v.cle!, v]));
  const nouvelles = lu?.ventes.filter((v) => !existantes.has(v.cle!)).length ?? 0;

  async function importer() {
    if (!lu) return;
    setEtat("envoi");
    try {
      const docs: Parameters<typeof enregistrer>[0] = lu.ventes.map((v) => {
        const avant = existantes.get(v.cle!);
        // Une vente déjà reprise garde sa commission corrigée à la main
        return { ...v, id: avant?.id, commission: avant?.commission };
      });
      const c = d.contrat;
      const { updatedAt: _u, ...contrat } = c;
      docs.push({
        ...contrat,
        id: c.id || undefined,
        nature: "contrat",
        taux: lu.reglages.taux ?? c.taux,
        honorairesTTC: lu.reglages.honorairesTTC ?? c.honorairesTTC,
        tva: lu.reglages.tva ?? c.tva,
        objectifs: { ...lu.objectifs, ...c.objectifs },
      });
      await enregistrer(docs);
      setEtat("fait");
    } catch (e) {
      setEtat("");
      setMsg(e instanceof Error ? e.message : "La reprise n'a pas pu être enregistrée.");
    }
  }

  const actees = lu?.ventes.filter((v) => v.statut === "acte") ?? [];
  const enCours = lu?.ventes.filter((v) => v.statut !== "acte") ?? [];
  const tot = actees.reduce((s, v) => s + (commissionDe({ ...v, id: "", updatedAt: "" }, { ...d.contrat, taux: lu?.reglages.taux ?? d.contrat.taux, honorairesTTC: lu?.reglages.honorairesTTC ?? d.contrat.honorairesTTC, tva: lu?.reglages.tva ?? d.contrat.tva } as Contrat) ?? 0), 0);

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
                {etat === "envoi" ? <Spinner /> : null} Reprendre {lu.ventes.length} vente{lu.ventes.length > 1 ? "s" : ""}
              </button>
            )}
          </>
        )
      }
    >
      {etat === "fait" ? (
        <p className="text-sm">C&apos;est fait : tes ventes sont dans tes revenus. Si tu complètes l&apos;Excel plus tard, reprends-le ici : les ventes déjà reprises sont mises à jour, sans doublon.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Choisis le classeur «&nbsp;Suivi_Commissions_Patrim&nbsp;» (depuis Drive ou ton téléphone). Il est lu ici, sur ton appareil, et seules tes ventes (colonne Commercial à ton nom) sont gardées.
          </p>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => lire(e.target.files?.[0])} />
          <button className={cx("btn-secondary mt-4 w-full", etat === "lecture" && "opacity-70")} onClick={() => input.current?.click()} disabled={etat === "lecture"}>
            {etat === "lecture" ? <Spinner /> : <FileSpreadsheet size={17} />} {lu ? "Choisir un autre fichier" : "Choisir le fichier Excel"}
          </button>
          {lu && (
            <div className="mt-4 rounded-2xl bg-surface-2/70 p-4 text-sm ring-1 ring-inset ring-line/60">
              <div className="font-semibold">
                {actees.length} vente{actees.length > 1 ? "s" : ""} actée{actees.length > 1 ? "s" : ""}, {eur(tot)} de commissions
              </div>
              {enCours.length > 0 && (
                <div className="mt-1 text-muted">
                  + {enCours.length} vente{enCours.length > 1 ? "s" : ""} en cours (compromis ou offre)
                </div>
              )}
              <div className="mt-1 text-muted">
                {nouvelles === lu.ventes.length ? "Toutes nouvelles." : `${nouvelles} nouvelle${nouvelles > 1 ? "s" : ""}, ${lu.ventes.length - nouvelles} mise${lu.ventes.length - nouvelles > 1 ? "s" : ""} à jour.`}
                {lu.reglages.taux != null && ` Commission : ${Math.round(lu.reglages.taux * 100)} % des honoraires HT.`}
                {Object.keys(lu.objectifs).length > 0 && ` Objectif ${Object.keys(lu.objectifs).join(", ")} repris.`}
              </div>
              {lu.ignorees > 0 && (
                <div className="mt-1 text-warn">
                  {lu.ignorees} vente{lu.ignorees > 1 ? "s" : ""} actée{lu.ignorees > 1 ? "s" : ""} sans date d&apos;acte, non reprise{lu.ignorees > 1 ? "s" : ""} : ajoute la date dans l&apos;Excel.
                </div>
              )}
            </div>
          )}
        </>
      )}
      <Erreur msg={msg} />
    </Sheet>
  );
}
