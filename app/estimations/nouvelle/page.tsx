"use client";

import { ArrowLeft, ArrowRight, Building, Building2, Car, Check, ChevronDown, House, Info, Plus, RefreshCw, Sparkles, Trees, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Card, DpeBadge, Field, Spinner, cx } from "@/components/ui";
import { AdresseInput } from "@/components/estimations/AdresseInput";
import { ContactPicker, Fourchette, VenteItem } from "@/components/estimations/blocks";
import { Choix, Compteur, Interrupteur, Nombre } from "@/components/estimations/controls";
import {
  CONFIANCE_TONE,
  DPE_CLASSES,
  EXTERIEURS,
  SYSTEM_COMMENTAIRE,
  arrondi,
  asPlus,
  atypiques,
  calculer,
  chercherVentes,
  marcheDe,
  periodeDe,
  promptCommentaire,
  quartierDe,
  resumeBien,
  venteDepuisBloc,
  venteDepuisDvf,
  venteDepuisParking,
  ventesDe,
  type BienSaisi,
  type EstimationPlus,
  type Vente,
} from "@/components/estimations/shared";
import { ImmeubleEditor, LotsEditor } from "@/components/estimations/LotsEditor";
import { MethodesImmeuble } from "@/components/estimations/MethodesImmeuble";
import {
  PARAMS_DEFAUT,
  TYPES_PARKING,
  calculerImmeuble,
  calculerParking,
  logements,
  nouveauLot,
  promptImmeuble,
  promptParking,
  surfaceTotale,
  type LotImmeuble,
  type ParamsImmeuble,
  type TypeParking,
} from "@/components/estimations/immeuble";
import { ask } from "@/lib/ai";
import { CONDITIONS, type MarketBase } from "@/lib/expressEstimate";
import { eur, pct } from "@/lib/format";
import { create, getAll, update } from "@/lib/store";
import { useEtapesHistorique, useRetour } from "@/lib/retour";

/* ============================================================
   Nouvelle estimation : parcours en 3 étapes, pensé pour être
   rempli debout chez le propriétaire, au téléphone.
   ============================================================ */

type Saisie = BienSaisi & {
  adresse: string;
  codePostal?: string;
  ville?: string;
  citycode?: string;
  lat?: number;
  lon?: number;
  surfaceTerrain?: number;
  lots?: LotImmeuble[];
  immeuble?: Partial<ParamsImmeuble>;
  typeParking?: TypeParking;
};

type Brouillon = {
  step: number;
  saisie: Saisie;
  ventes: Vente[];
  rayon: number;
  rayonBloc?: number;
  cle?: string;
  prixM2Manuel?: number;
  prixConseille?: number;
  prixTouche?: boolean;
  commentaire: string;
  proprietaireId?: string;
  notes: string;
};

const DRAFT_KEY = "patrim-hub:estimation-brouillon";
const RAYONS = [300, 500, 800, 1200, 2000];
const VIDE: Brouillon = {
  step: 0,
  saisie: { adresse: "", type: "appartement", surface: 0, etat: "bon" },
  ventes: [],
  rayon: 500,
  commentaire: "",
  notes: "",
};

const cleRecherche = (s: Saisie, rayon: number) =>
  [
    s.adresse.trim().toLowerCase(),
    s.type,
    s.type === "immeuble"
      ? logements(s.lots ?? [])
          .map((l) => l.surface ?? 0)
          .join(",")
      : s.surface,
    s.pieces ?? 0,
    rayon,
  ].join("|");

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton h-64" />}>
      <Parcours />
    </Suspense>
  );
}

function Parcours() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id") ?? undefined;
  const retour = useRetour(editId ? `/estimations/${editId}` : "/estimations");

  const [b, setB] = useState<Brouillon>(VIDE);
  const [ready, setReady] = useState(false);
  const [repris, setRepris] = useState(false);
  const [recherche, setRecherche] = useState<{ loading: boolean; error?: string; message?: string; annees?: number[] }>({ loading: false });
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError] = useState("");
  const [voirTout, setVoirTout] = useState(false);
  const [tri, setTri] = useState<"pertinence" | "prix" | "date" | "distance">("pertinence");
  const [ajout, setAjout] = useState(false);
  const [saving, setSaving] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  /* --- Chargement : estimation à modifier, ou brouillon en cours --- */
  useEffect(() => {
    if (editId) {
      const e = getAll("estimations").find((x) => x.id === editId);
      if (e) {
        const p = asPlus(e);
        setB({
          step: 0,
          saisie: {
            adresse: p.adresse,
            codePostal: p.codePostal,
            ville: p.ville,
            lat: p.lat,
            lon: p.lon,
            type: p.type,
            surface: p.surface,
            pieces: p.pieces,
            etage: p.etage,
            ascenseur: p.ascenseur,
            exterieur: p.exterieur,
            parking: p.parking,
            etat: p.etat ?? "bon",
            dpe: p.dpe,
            surfaceTerrain: p.surfaceTerrain,
            lots: p.lots,
            immeuble: p.immeuble,
            typeParking: p.typeParking,
          },
          ventes: ventesDe(p),
          rayon: p.rayon ?? 500,
          rayonBloc: p.immeuble?.rayonBloc,
          prixM2Manuel: p.prixM2Manuel,
          prixConseille: p.prixConseille,
          prixTouche: true,
          commentaire: p.resultat?.commentaire ?? "",
          proprietaireId: p.proprietaireId,
          notes: p.notes ?? "",
        });
        setB((x) => ({ ...x, cle: cleRecherche(x.saisie, x.rayon) }));
      }
    } else {
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw) as Brouillon;
          if (d?.saisie?.adresse || d?.saisie?.surface) {
            setB({ ...VIDE, ...d });
            setRepris(true);
          }
        }
      } catch {}
    }
    setReady(true);
  }, [editId]);

  /* --- Sauvegarde automatique du brouillon --- */
  useEffect(() => {
    if (!ready || editId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(b));
    } catch {}
  }, [b, ready, editId]);

  const s = b.saisie;
  const setS = (patch: Partial<Saisie>) => setB((x) => ({ ...x, saisie: { ...x.saisie, ...patch } }));
  const set = (patch: Partial<Brouillon>) => setB((x) => ({ ...x, ...patch }));
  // Chaque étape a son entrée d'historique : le geste retour revient à l'étape précédente.
  const allerStep = useEtapesHistorique("estimation", b.step, (step) => set({ step }));

  /* --- Calculs --- */
  const atyp = useMemo(() => atypiques(b.ventes.filter((v) => !v.bloc)), [b.ventes]);
  const marcheVentes = useMemo(() => marcheDe(b.ventes), [b.ventes]);
  const marche: MarketBase | null = useMemo(() => {
    if (marcheVentes) return marcheVentes;
    const m = b.prixM2Manuel;
    return m && m > 0 ? { medianSqm: m, p25: Math.round(m * 0.94), p75: Math.round(m * 1.06), count: 0 } : null;
  }, [marcheVentes, b.prixM2Manuel]);
  const estImm = s.type === "immeuble";
  const estPk = s.type === "parking";
  const pImm: ParamsImmeuble = useMemo(() => ({ ...PARAMS_DEFAUT, ...s.immeuble }), [s.immeuble]);
  const resImm = useMemo(() => (estImm ? calculerImmeuble(s.lots ?? [], pImm, { ventes: b.ventes, marche, etat: s.etat }) : null), [estImm, s.lots, pImm, b.ventes, marche, s.etat]);
  const res = useMemo(() => {
    if (estImm)
      return resImm
        ? {
            baseSqm: marche?.medianSqm ?? 0,
            adjustments: [],
            totalPct: 0,
            sqm: s.surface ? Math.round(resImm.central / s.surface) : 0,
            central: resImm.central,
            low: resImm.bas,
            high: resImm.haut,
            confidence: resImm.confiance,
          }
        : null;
    if (estPk) return marche ? calculerParking(s.typeParking, marche, s.etat) : null;
    return marche && s.surface > 0 ? calculer(s, marche) : null;
  }, [estImm, estPk, resImm, marche, s]);
  const majImm = (x: Partial<ParamsImmeuble>) => setS({ immeuble: { ...s.immeuble, ...x } });
  const majLots = (lots: LotImmeuble[]) => setS({ lots, surface: surfaceTotale(lots) });
  const prixConseille = b.prixTouche ? b.prixConseille : res?.central;
  const quartier = quartierDe(s.lat, s.lon, s.citycode, s.ville);
  const periode = periodeDe(b.ventes);

  const blocs = useMemo(() => b.ventes.filter((v) => v.bloc), [b.ventes]);
  const ventesTriees = useMemo(() => {
    const v = b.ventes.filter((x) => !x.bloc);
    if (tri === "prix") v.sort((a, c) => c.prixM2 - a.prixM2);
    if (tri === "date") v.sort((a, c) => c.date.localeCompare(a.date));
    if (tri === "distance") v.sort((a, c) => (a.distance ?? 9e9) - (c.distance ?? 9e9));
    return v;
  }, [b.ventes, tri]);
  const visibles = voirTout ? ventesTriees : ventesTriees.slice(0, 15);
  const nbRetenues = b.ventes.filter((v) => !v.exclu && !v.bloc).length;
  const nbVentes = b.ventes.length - blocs.length;

  const adresseOk = s.adresse.trim().length > 4;
  const etape1Ok = estImm ? adresseOk && (s.lots ?? []).some((l) => l.surface || l.valeur || l.loyer) : estPk ? adresseOk : adresseOk && s.surface > 0;
  const etape2Ok = estImm ? !!resImm : !!marche;
  const parM2 = !estPk;

  /* --- Navigation --- */
  const goto = (step: number) => {
    allerStep(step);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (step === 1) {
      const cle = cleRecherche(s, b.rayon);
      if (cle !== b.cle || (!b.ventes.length && !recherche.loading)) void lancer(b.rayon);
    }
  };

  async function lancer(rayon: number) {
    setRecherche({ loading: true });
    setVoirTout(false);
    try {
      const surf = logements(s.lots ?? [])
        .map((l) => l.surface ?? 0)
        .filter((x) => x > 0);
      const r = await chercherVentes({
        adresse: s.adresse,
        surface: s.surface,
        type: s.type,
        pieces: s.pieces,
        rayon,
        ...(estImm ? { surfaceMin: surf.length ? Math.min(...surf) : undefined, surfaceMax: surf.length ? Math.max(...surf) : undefined } : {}),
      });
      const manuelles = b.ventes.filter((v) => v.source !== "dvf");
      const exclus = new Set(b.ventes.filter((v) => v.exclu).map((v) => v.id));
      const dvf = estPk ? (r.parkings ?? []).map(venteDepuisParking) : [...(r.blocs ?? []).map(venteDepuisBloc), ...r.ventes.map(venteDepuisDvf)];
      const ventes = [...manuelles, ...dvf.map((v) => (exclus.has(v.id) ? { ...v, exclu: true } : v))];
      setB((x) => ({
        ...x,
        ventes,
        rayon,
        rayonBloc: r.rayonBloc,
        cle: cleRecherche(x.saisie, rayon),
        saisie: {
          ...x.saisie,
          lat: x.saisie.lat ?? r.centre?.lat,
          lon: x.saisie.lon ?? r.centre?.lon,
          citycode: x.saisie.citycode ?? r.centre?.citycode,
        },
      }));
      setRecherche({ loading: false, message: r.message, annees: r.annees });
    } catch (e) {
      setB((x) => ({ ...x, rayon }));
      setRecherche({ loading: false, error: (e as Error).message });
    }
  }

  const toggle = (id: string) => setB((x) => ({ ...x, ventes: x.ventes.map((v) => (v.id === id ? { ...v, exclu: !v.exclu } : v)) }));
  const ecarterAtypiques = () => setB((x) => ({ ...x, ventes: x.ventes.map((v) => (atyp.has(v.id) ? { ...v, exclu: true } : v)) }));

  async function rediger() {
    if (!res || (!marche && !estImm)) return;
    setIaLoading(true);
    setIaError("");
    try {
      const r = await ask({
        system: SYSTEM_COMMENTAIRE,
        prompt:
          estImm && resImm
            ? promptImmeuble({ adresse: s.adresse, quartier, lots: s.lots ?? [], p: pImm, r: resImm, etat: s.etat, marche, rayon: b.rayon, prixConseille })
            : estPk
              ? promptParking({ adresse: s.adresse, typeParking: s.typeParking, r: res, marche: marche!, rayon: b.rayon, prixConseille })
              : promptCommentaire({
                  bien: { ...s, quartier },
                  res,
                  marche: marche!,
                  rayon: b.rayon,
                  periode,
                  prixConseille,
                  ventesManuelles: !marcheVentes,
                }),
        effort: "low",
        maxTokens: 1200,
      });
      set({ commentaire: r.text.trim() });
    } catch (e) {
      setIaError((e as Error).message);
    } finally {
      setIaLoading(false);
    }
  }

  function enregistrer() {
    if (!res || (!marche && !estImm)) return;
    setSaving(true);
    const data: Omit<EstimationPlus, "id" | "createdAt" | "updatedAt"> = {
      adresse: s.adresse.trim(),
      codePostal: s.codePostal,
      ville: s.ville,
      lat: s.lat,
      lon: s.lon,
      type: s.type,
      surface: s.surface,
      pieces: s.pieces,
      etage: s.type === "appartement" ? s.etage : undefined,
      ascenseur: s.type === "appartement" ? s.ascenseur : undefined,
      exterieur: s.exterieur,
      parking: s.parking,
      etat: s.etat,
      dpe: s.dpe,
      surfaceTerrain: s.type === "maison" ? s.surfaceTerrain : undefined,
      lots: estImm ? s.lots : undefined,
      immeuble: estImm && resImm ? { ...pImm, methodes: { lots: resImm.parLots || undefined, rendement: resImm.parRendement, blocs: resImm.parBlocs }, rayonBloc: b.rayonBloc } : undefined,
      typeParking: estPk ? s.typeParking : undefined,
      proprietaireId: b.proprietaireId,
      comparables: estImm ? b.ventes.filter((v) => !v.exclu || v.bloc) : b.ventes.slice(0, 80),
      resultat: { bas: res.low, median: res.central, haut: res.high, prixM2: res.sqm, ajustements: res.adjustments, commentaire: b.commentaire.trim() || undefined },
      prixConseille: prixConseille ? arrondi(prixConseille, 100) : res.central,
      statut: "a_faire",
      notes: b.notes.trim() || undefined,
      rayon: marcheVentes || (estImm && blocs.length) ? b.rayon : undefined,
      quartier,
      confiance: marcheVentes || estImm ? res.confidence : "faible",
      marche: marche ?? undefined,
      periode,
      prixM2Manuel: marcheVentes ? undefined : b.prixM2Manuel,
    };
    let id = editId;
    if (editId) {
      const { statut: _ignore, ...patch } = data;
      void _ignore;
      update("estimations", editId, patch);
    } else {
      id = create("estimations", data).id;
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
    }
    router.push(`/estimations/${id}`);
  }

  const recommencer = () => {
    setB(VIDE);
    setRepris(false);
    setRecherche({ loading: false });
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  if (!ready) return <div className="skeleton h-64" />;

  const STEPS = ["Le bien", "Ventes du secteur", "Estimation"];

  return (
    <div ref={top} className="mx-auto max-w-2xl scroll-mt-20">
      {/* En-tête + progression */}
      <div className="mb-5 animate-fade-up">
        <button type="button" onClick={retour} className="text-xs text-muted hover:text-fg">
          ← {editId ? "Retour à l'estimation" : "Retour"}
        </button>
        <h1 className="h-title mt-1">{editId ? "Modifier l'estimation" : "Nouvelle estimation"}</h1>
        <ol className="mt-4 grid grid-cols-3 gap-2">
          {STEPS.map((label, i) => {
            const reachable = i === 0 || (i === 1 && etape1Ok) || (i === 2 && etape1Ok && etape2Ok);
            const on = i === b.step;
            const done = i < b.step;
            return (
              <li key={label}>
                <button type="button" disabled={!reachable} onClick={() => goto(i)} className="group w-full text-left disabled:opacity-50">
                  <span className={cx("block h-1.5 rounded-full transition-colors", on ? "bg-accent" : done ? "bg-accent/45" : "bg-line")} />
                  <span className={cx("mt-1.5 flex items-center gap-1 text-[11px] font-medium", on ? "text-fg" : "text-muted")}>
                    {done ? <Check size={12} className="text-accent" /> : <span className="tabular-nums">{i + 1}.</span>}
                    <span className="truncate">{label}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {repris && b.step === 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-2/60 px-4 py-3 text-sm animate-fade-up">
          <Info size={16} className="shrink-0 text-accent" />
          <span className="flex-1">Estimation en cours reprise là où vous l'aviez laissée.</span>
          <button type="button" onClick={recommencer} className="btn-ghost btn-sm">
            Recommencer
          </button>
        </div>
      )}

      {/* ===================== ÉTAPE 1 : LE BIEN ===================== */}
      {b.step === 0 && (
        <div key="e1" className="space-y-4 animate-fade-up">
          <Card>
            <div className="space-y-5">
              <div>
                <span className="label">Adresse du bien</span>
                <AdresseInput
                  value={s.adresse}
                  autoFocus={!s.adresse}
                  onText={(t) => setS({ adresse: t, lat: undefined, lon: undefined, citycode: undefined, codePostal: undefined, ville: undefined })}
                  onPick={(x) => setS({ adresse: x.label, codePostal: x.codePostal, ville: x.ville, citycode: x.citycode, lat: x.lat, lon: x.lon })}
                />
                {s.lat != null && quartierDe(s.lat, s.lon, s.citycode, s.ville) && (
                  <div className="mt-2 text-[11px] text-muted">
                    Quartier : <span className="font-medium text-fg">{quartierDe(s.lat, s.lon, s.citycode, s.ville)}</span>
                  </div>
                )}
              </div>

              <div>
                <span className="label">Type de bien</span>
                <Choix
                  size="lg"
                  value={s.type}
                  onChange={(v) => v && setS(v === "immeuble" && !s.lots?.length ? { type: v, lots: [nouveauLot(1), nouveauLot(2)], surface: 0 } : { type: v })}
                  options={[
                    {
                      value: "appartement",
                      label: (
                        <>
                          <Building size={17} /> Appartement
                        </>
                      ),
                    },
                    {
                      value: "maison",
                      label: (
                        <>
                          <House size={17} /> Maison
                        </>
                      ),
                    },
                    {
                      value: "immeuble",
                      label: (
                        <>
                          <Building2 size={17} /> Immeuble
                        </>
                      ),
                    },
                    {
                      value: "parking",
                      label: (
                        <>
                          <Car size={17} /> Parking, garage
                        </>
                      ),
                    },
                  ]}
                />
              </div>

              {estPk && (
                <>
                  <div>
                    <span className="label">Type de stationnement</span>
                    <Choix value={s.typeParking} onChange={(v) => setS({ typeParking: v })} allowEmpty options={TYPES_PARKING.map((t) => ({ value: t.value, label: t.label }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Surface (facultatif)">
                      <Nombre value={s.surface || undefined} onChange={(v) => setS({ surface: v ?? 0 })} unit="m²" decimal placeholder="12" />
                    </Field>
                  </div>
                </>
              )}

              {!estImm && !estPk && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={s.type === "appartement" ? "Surface Carrez" : "Surface habitable"}>
                      <Nombre value={s.surface || undefined} onChange={(v) => setS({ surface: v ?? 0 })} unit="m²" decimal placeholder="65" />
                    </Field>
                    {s.type === "maison" ? (
                      <Field label="Terrain">
                        <Nombre value={s.surfaceTerrain} onChange={(v) => setS({ surfaceTerrain: v })} unit="m²" placeholder="400" />
                      </Field>
                    ) : (
                      <div />
                    )}
                  </div>

                  <div>
                    <span className="label">Nombre de pièces {!s.pieces && <span className="font-normal text-muted">· touche le nombre</span>}</span>
                    <Choix value={s.pieces} onChange={(v) => setS({ pieces: v })} allowEmpty options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n === 7 ? "7 et +" : s.type === "maison" ? `${n} p.` : `T${n}` }))} />
                  </div>

                  {s.type === "appartement" && (
                    <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                      <div>
                        <span className="label">Étage</span>
                        <Compteur value={s.etage} onChange={(v) => setS({ etage: v })} min={0} max={40} format={(v) => (v === 0 ? "RDC" : `${v}${v === 1 ? "er" : "e"}`)} placeholder="Non précisé" />
                      </div>
                      <Interrupteur checked={!!s.ascenseur} onChange={(v) => setS({ ascenseur: v })} label="Ascenseur" />
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {estImm && (
            <>
              <Card title="Les lots">
                <LotsEditor lots={s.lots ?? []} onChange={majLots} />
              </Card>
              <Card title="L'immeuble">
                <ImmeubleEditor p={pImm} onChange={majImm} etat={s.etat} onEtat={(etat) => setS({ etat })} />
              </Card>
            </>
          )}

          {!estImm && !estPk && (
            <Card title="Atouts et état">
              <div className="space-y-5">
                <div>
                  <span className="label flex items-center gap-1.5">
                    <Trees size={13} /> Extérieur
                  </span>
                  <Choix
                    value={s.exterieur ?? ""}
                    onChange={(v) => setS({ exterieur: v || undefined })}
                    options={[{ value: "", label: "Aucun" }, ...EXTERIEURS.map((e) => ({ value: e as string, label: e }))]}
                  />
                </div>
                <Interrupteur
                  checked={!!s.parking}
                  onChange={(v) => setS({ parking: v })}
                  label={
                    <span className="flex items-center gap-1.5">
                      <Car size={15} /> Stationnement (parking, box, garage)
                    </span>
                  }
                />
                <div>
                  <span className="label">État général</span>
                  <Choix value={s.etat} onChange={(v) => setS({ etat: v ?? "bon" })} options={CONDITIONS.map((c) => ({ value: c.id, label: c.label }))} />
                </div>
                <div>
                  <span className="label">Classe énergie (DPE)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {DPE_CLASSES.map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setS({ dpe: s.dpe === d ? undefined : d })}
                        className={cx(
                          "grid size-11 place-items-center rounded-xl border transition",
                          s.dpe === d ? "border-accent ring-2 ring-accent/25 bg-surface-2" : "border-line bg-surface hover:bg-surface-2",
                        )}
                        aria-pressed={s.dpe === d}
                      >
                        <DpeBadge value={d} />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setS({ dpe: undefined })}
                      className={cx("h-11 rounded-xl border px-3 text-xs font-medium", !s.dpe ? "border-accent bg-surface-2" : "border-line bg-surface text-muted")}
                    >
                      Inconnu
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div className="flex justify-end">
            <button type="button" className="btn-primary !h-12 w-full sm:w-auto sm:px-6" disabled={!etape1Ok} onClick={() => goto(1)}>
              Chercher les ventes du secteur <ArrowRight size={17} />
            </button>
          </div>
          {!etape1Ok && (
            <p className="text-center text-[11px] text-muted sm:text-right">
              {estImm
                ? "L'adresse et au moins un lot (surface, loyer ou valeur) suffisent pour lancer la recherche."
                : estPk
                  ? "L'adresse suffit pour lancer la recherche."
                  : "Adresse et surface suffisent pour lancer la recherche."}
            </p>
          )}
        </div>
      )}

      {/* ===================== ÉTAPE 2 : VENTES ===================== */}
      {b.step === 1 && (
        <div key="e2" className="space-y-4 animate-fade-up">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted">{estPk ? "Prix médian d'une place vendue seule" : estImm ? "Prix médian des appartements vendus seuls" : "Prix médian des ventes retenues"}</div>
                {recherche.loading ? (
                  <div className="skeleton mt-2 h-9 w-40" />
                ) : (
                  <div className="font-serif text-3xl font-semibold tracking-tight tabular-nums">
                    {marcheVentes ? `${marcheVentes.medianSqm.toLocaleString("fr-FR")} ${parM2 ? "€/m²" : "€"}` : "—"}
                  </div>
                )}
                <div className="mt-1 text-xs text-muted">
                  {recherche.loading
                    ? "Lecture des actes de vente notariés…"
                    : marcheVentes
                      ? `${nbRetenues} vente${nbRetenues > 1 ? "s" : ""} retenue${nbRetenues > 1 ? "s" : ""}${nbVentes > nbRetenues ? ` sur ${nbVentes}` : ""} · moitié entre ${marcheVentes.p25.toLocaleString("fr-FR")} et ${marcheVentes.p75.toLocaleString("fr-FR")} ${parM2 ? "€/m²" : "€"}`
                      : "Aucune vente retenue"}
                </div>
              </div>
              <button type="button" onClick={() => lancer(b.rayon)} disabled={recherche.loading} className="btn-ghost btn-sm !px-2 shrink-0" aria-label="Relancer la recherche">
                <RefreshCw size={16} className={cx(recherche.loading && "animate-spin")} />
              </button>
            </div>

            <div className="mt-4">
              <span className="label">Rayon de recherche</span>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {RAYONS.map((r) => (
                  <button
                    type="button"
                    key={r}
                    disabled={recherche.loading}
                    onClick={() => lancer(r)}
                    className={cx(
                      "h-10 shrink-0 rounded-xl border px-3.5 text-sm font-medium transition",
                      b.rayon === r ? "border-accent bg-accent text-white dark:text-bg" : "border-line bg-surface hover:bg-surface-2",
                    )}
                  >
                    {r < 1000 ? `${r} m` : `${(r / 1000).toLocaleString("fr-FR")} km`}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted">
                {estImm
                  ? `Appartements vendus seuls de la surface des logements · immeubles entiers à moins de ${(b.rayonBloc ?? Math.min(3000, Math.max(b.rayon * 2, 1500))) / 1000} km`
                  : estPk
                    ? "Places, box et garages vendus seuls"
                    : `${resumeBien(s)} · surface ± ${s.type === "maison" ? 30 : 25} %${s.pieces ? " · ± 1 pièce" : ""}`}
                {recherche.annees?.length ? ` · ventes ${recherche.annees[0]} – ${recherche.annees[recherche.annees.length - 1]}` : ""}
              </p>
            </div>
          </Card>

          {recherche.loading && (
            <div className="space-y-2">
              <p className="px-1 text-xs text-muted">La première recherche sur une commune peut prendre jusqu'à 30 secondes.</p>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-[86px] rounded-2xl" />
              ))}
            </div>
          )}

          {!recherche.loading && (recherche.error || recherche.message) && (
            <div className="card card-pad border-warn/30">
              <div className="flex gap-3">
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
                <div className="flex-1 text-sm">
                  <p>{recherche.error || recherche.message}</p>
                  {!marcheVentes && (
                    <div className="mt-3">
                      <Field
                        label={
                          estPk
                            ? "Ou saisissez un prix de référence pour une place"
                            : estImm
                              ? "Ou saisissez un prix au m² de référence pour les appartements"
                              : "Ou saisissez un prix au m² de référence"
                        }
                        hint="Vos ventes récentes, les références notaires… L'avis le précisera."
                      >
                        <Nombre value={b.prixM2Manuel} onChange={(v) => set({ prixM2Manuel: v })} unit={estPk ? "€" : "€/m²"} placeholder={estPk ? "15 000" : "3 800"} />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!recherche.loading && estImm && (
            <div className="space-y-2">
              <div className="h-section px-1">Immeubles vendus en bloc ({blocs.filter((v) => !v.exclu).length})</div>
              {blocs.length ? (
                blocs.map((v) => <VenteItem key={v.id} v={v} onToggle={() => toggle(v.id)} />)
              ) : (
                <p className="px-1 text-xs text-muted">Aucun immeuble entier vendu dans le secteur depuis {recherche.annees?.[0] ?? 2021}. L&apos;estimation repose sur les lots et le rendement.</p>
              )}
            </div>
          )}

          {!recherche.loading && nbVentes > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 px-1">
                <div className="h-section mr-auto">{estImm ? "Appartements vendus seuls" : estPk ? "Stationnements vendus seuls" : "Ventes comparables"}</div>
                <select className="input !h-8 !w-auto !rounded-lg text-xs" value={tri} onChange={(e) => setTri(e.target.value as typeof tri)} aria-label="Trier">
                  <option value="pertinence">Les plus proches du bien</option>
                  <option value="date">Les plus récentes</option>
                  <option value="distance">Les plus près</option>
                  <option value="prix">Prix au m²</option>
                </select>
              </div>
              {[...atyp].some((id) => b.ventes.find((v) => v.id === id && !v.exclu)) && (
                <div className="flex items-center gap-3 rounded-2xl bg-warn/10 px-4 py-3 text-sm">
                  <span className="flex-1">Certaines ventes ont un prix au m² très éloigné des autres.</span>
                  <button type="button" onClick={ecarterAtypiques} className="btn-secondary btn-sm">
                    Les écarter
                  </button>
                </div>
              )}
              <div className="space-y-2">
                {visibles.map((v) => (
                  <VenteItem key={v.id} v={v} atypique={atyp.has(v.id)} mediane={marcheVentes?.medianSqm} onToggle={() => toggle(v.id)} />
                ))}
              </div>
              {ventesTriees.length > visibles.length && (
                <button type="button" onClick={() => setVoirTout(true)} className="btn-ghost w-full">
                  <ChevronDown size={16} /> Voir les {ventesTriees.length - visibles.length} autres ventes
                </button>
              )}
            </>
          )}

          {!recherche.loading && !estPk && (
            <div>
              {!ajout ? (
                <button type="button" onClick={() => setAjout(true)} className="btn-ghost btn-sm text-muted">
                  <Plus size={14} /> Ajouter une vente connue (agence, notaire…)
                </button>
              ) : (
                <AjoutVente
                  onCancel={() => setAjout(false)}
                  onAdd={(v) => {
                    setB((x) => ({ ...x, ventes: [v, ...x.ventes] }));
                    setAjout(false);
                  }}
                />
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary !h-12" onClick={() => goto(0)}>
              <ArrowLeft size={17} />
              <span className="hidden sm:inline">Le bien</span>
            </button>
            <button type="button" className="btn-primary !h-12 flex-1 sm:flex-none sm:ml-auto sm:px-6" disabled={!etape2Ok || recherche.loading} onClick={() => goto(2)}>
              Voir l'estimation <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* ===================== ÉTAPE 3 : RÉSULTAT ===================== */}
      {b.step === 2 && res && (marche || (estImm && resImm)) && (
        <div key="e3" className="space-y-4 animate-fade-up">
          <section className="card overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-brand via-brand to-coral" />
            <div className="card-pad">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">Valeur de marché estimée</div>
                  <div className="font-serif text-[34px] leading-tight font-semibold tracking-tight tabular-nums">{eur(res.central)}</div>
                  <div className="text-xs text-muted">
                    {parM2 && res.sqm ? `soit ${res.sqm.toLocaleString("fr-FR")} €/m² · ` : ""}
                    {resumeBien(s)}
                  </div>
                </div>
                <Badge tone={marcheVentes || estImm ? CONFIANCE_TONE[res.confidence] : "warn"}>Fiabilité {marcheVentes || estImm ? res.confidence : "à confirmer"}</Badge>
              </div>
              <Fourchette bas={res.low} median={res.central} haut={res.high} conseille={prixConseille} />
            </div>
          </section>

          {estImm && resImm ? (
            <MethodesImmeuble r={resImm} p={pImm} onParams={majImm} rayonBloc={b.rayonBloc} />
          ) : marche ? (
            <Card title="Comment on arrive à ce prix">
              <ul className="divide-y divide-line text-sm">
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    {marcheVentes ? `Prix médian de ${marche.count} ${estPk ? "stationnements vendus seuls" : "ventes réelles"}` : "Prix de référence saisi"}
                    {marcheVentes && (
                      <span className="block text-[11px] text-muted">
                        rayon {b.rayon} m{periode ? ` · ${periode}` : ""}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {marche.medianSqm.toLocaleString("fr-FR")} {parM2 ? "€/m²" : "€"}
                  </span>
                </li>
                {res.adjustments.map((a) => (
                  <li key={a.label} className="flex items-center justify-between gap-3 py-2.5">
                    <span>{a.label}</span>
                    <span className={cx("font-semibold tabular-nums", a.pct > 0 ? "text-ok" : "text-warn")}>{pct(a.pct)}</span>
                  </li>
                ))}
                {!res.adjustments.length && <li className="py-2.5 text-muted">Aucun ajustement : bien dans la moyenne du secteur.</li>}
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-medium">{parM2 ? "Prix au m² retenu" : "Prix retenu"}</span>
                  <span className="font-semibold tabular-nums text-accent">
                    {res.sqm.toLocaleString("fr-FR")} {parM2 ? "€/m²" : "€"}
                  </span>
                </li>
              </ul>
            </Card>
          ) : null}

          <Card title="Prix de présentation conseillé">
            <div className="space-y-3">
              <Nombre value={prixConseille} onChange={(v) => set({ prixConseille: v, prixTouche: true })} unit="€" className="[&_input]:!h-12 [&_input]:text-lg [&_input]:font-semibold" />
              <div className="flex flex-wrap gap-1.5">
                {[
                  { l: "Basse", v: res.low },
                  { l: "Médiane", v: res.central },
                  { l: "Haute", v: res.high },
                ].map((o) => (
                  <button
                    type="button"
                    key={o.l}
                    onClick={() => set({ prixConseille: o.v, prixTouche: true })}
                    className={cx("chip !h-8 !px-3", prixConseille === o.v && "!border-accent !text-accent")}
                  >
                    {o.l} · {eur(o.v)}
                  </button>
                ))}
              </div>
              {prixConseille ? (
                <p className="text-[11px] text-muted">
                  {parM2 && s.surface ? `${Math.round(prixConseille / s.surface).toLocaleString("fr-FR")} €/m²` : ""}
                  {Math.abs(prixConseille - res.central) / res.central >= 0.005 && ` · ${pct((prixConseille - res.central) / res.central)} par rapport à la médiane`}
                </p>
              ) : null}
            </div>
          </Card>

          <Card
            title="Commentaire pour le propriétaire"
            action={
              <button type="button" onClick={rediger} disabled={iaLoading} className="btn-secondary btn-sm">
                {iaLoading ? <Spinner /> : <Sparkles size={14} />} {b.commentaire ? "Réécrire" : "Rédiger"}
              </button>
            }
          >
            {iaError && <p className="mb-2 text-xs text-danger">{iaError}</p>}
            {iaLoading && !b.commentaire ? (
              <div className="space-y-2">
                <div className="skeleton h-3.5 w-full" />
                <div className="skeleton h-3.5 w-11/12" />
                <div className="skeleton h-3.5 w-4/5" />
              </div>
            ) : (
              <textarea
                className="input min-h-[160px] text-[13px]"
                rows={7}
                value={b.commentaire}
                onChange={(e) => set({ commentaire: e.target.value })}
                placeholder="L'assistant rédige un argumentaire prudent et chiffré à partir des ventes. Vous pouvez aussi l'écrire vous-même."
              />
            )}
          </Card>

          <Card title="Propriétaire">
            <ContactPicker value={b.proprietaireId} onChange={(id) => set({ proprietaireId: id })} />
          </Card>

          <Card title="Notes internes">
            <textarea
              className="input text-[13px]"
              rows={3}
              value={b.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Motivation, délai, projet… (n'apparaît jamais sur l'avis de valeur)"
            />
          </Card>

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary !h-12" onClick={() => goto(1)}>
              <ArrowLeft size={17} />
              <span className="hidden sm:inline">Ventes</span>
            </button>
            <button type="button" className="btn-primary !h-12 flex-1 sm:flex-none sm:ml-auto sm:px-6" disabled={saving} onClick={enregistrer}>
              {saving ? <Spinner /> : <Check size={17} />} {editId ? "Enregistrer les modifications" : "Enregistrer l'estimation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Ajout d'une vente connue ---------- */

function AjoutVente({ onAdd, onCancel }: { onAdd: (v: Vente) => void; onCancel: () => void }) {
  const [adresse, setAdresse] = useState("");
  const [prix, setPrix] = useState<number>();
  const [surface, setSurface] = useState<number>();
  const [pieces, setPieces] = useState<number>();
  const [mois, setMois] = useState("");
  const ok = adresse.trim() && prix && surface;
  return (
    <div className="card card-pad space-y-3 animate-fade-up">
      <div className="h-section">Vente connue</div>
      <Field label="Adresse">
        <input className="input" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Rue, ville" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prix net vendeur">
          <Nombre value={prix} onChange={setPrix} unit="€" />
        </Field>
        <Field label="Surface">
          <Nombre value={surface} onChange={setSurface} unit="m²" decimal />
        </Field>
        <Field label="Pièces">
          <Nombre value={pieces} onChange={setPieces} />
        </Field>
        <Field label="Date de vente">
          <input className="input" type="month" value={mois} onChange={(e) => setMois(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!ok}
          onClick={() =>
            prix &&
            surface &&
            onAdd({
              id: "a-" + Date.now().toString(36),
              adresse: adresse.trim(),
              date: mois ? `${mois}-15` : new Date().toISOString().slice(0, 10),
              prix,
              surface,
              pieces,
              prixM2: Math.round(prix / surface),
              source: "agence",
            })
          }
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>
    </div>
  );
}
