"use client";

/* ============================================================
   ESTIMATION LOCATIVE EXPRESS
   Débroussaillage express du loyer d'un bien, sur le terrain
   ou au téléphone, avant l'expertise locative complète.
   - Base de loyer au m² : quartier Toulousain (source DGFiP
     « Valeurs locatives brutes 2023 », 2 déciles, corrigés du
     décalage entre valeur locative cadastrale et loyer de
     marché ≈ ×1,12), ou loyer au m² saisi à la main.
   - Comparables terrain : mises en gestion de « Mes revenus »
     + loyers saisis à la main. Aucune donnée personnelle ne
     quitte l'appareil : tout reste local, rien n'est envoyé.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building, Car, Check, FileDown, House, Info, KeyRound, Plus, Sparkles, Trees } from "lucide-react";
import { Badge, Card, DpeBadge, Field, PageHeader, Spinner, cx } from "@/components/ui";
import { AdresseInput } from "@/components/estimations/AdresseInput";
import { Choix, Compteur, Interrupteur, Nombre } from "@/components/estimations/controls";
import { ContactPicker } from "@/components/estimations/blocks";
import { CONFIANCE_TONE, DPE_CLASSES, ETAT_LABEL, EXTERIEURS, quartierDe, resumeBien, type Suggestion } from "@/components/locatives/shared";
import { ask } from "@/lib/ai";
import { LOYERS_QUARTIER, calculerLoyer, plafondEncadrement, type LoyerInput, type LoyerResult, type LoyersMarche } from "@/lib/loyerExpress";
import { CONDITIONS } from "@/lib/expressEstimate";
import { dateCourte, eur, pct } from "@/lib/format";
import { useRevenus } from "@/components/revenus/stockage";
import { useCollection as useBiens } from "@/lib/store";
import { useEtapesHistorique } from "@/lib/retour";

const DRAFT_KEY = "patrim-hub:locative-brouillon";

type EtatLoyer = (typeof CONDITIONS)[number]["id"];

type LoyerComp = {
  id: string;
  adresse: string;
  ville?: string;
  quartier?: string;
  loyer: number;
  surface: number;
  pieces?: number;
  distance?: number;
  source: "terrain" | "manuel";
  date?: string;
  exclu?: boolean;
};

type Saisie = {
  adresse: string;
  codePostal?: string;
  ville?: string;
  citycode?: string;
  lat?: number;
  lon?: number;
  type: "appartement" | "maison";
  surface: number;
  pieces?: number;
  etage?: number;
  ascenseur?: boolean;
  exterieur?: string;
  parking: boolean;
  meuble: boolean;
  etat: EtatLoyer;
  dpe?: string;
  loyerM2Manuel?: number;
};

type Brouillon = {
  step: number;
  saisie: Saisie;
  comps: LoyerComp[];
  commentaire: string;
  loyerConseille?: number;
  loyerTouche?: boolean;
  proprietaireId?: string;
};

const VIDE: Brouillon = { step: 0, saisie: { adresse: "", type: "appartement", surface: 0, parking: false, meuble: false, etat: "bon" }, comps: [], commentaire: "" };

export default function LocativesPage() {
  const [b, setB] = useState<Brouillon>(VIDE);
  const [ready, setReady] = useState(false);
  const [repris, setRepris] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaError, setIaError] = useState("");
  const [ajout, setAjout] = useState(false);

  const { saisies, pret, disponible } = useLoyersTerrain();

  useEffect(() => {
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
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(b));
    } catch {}
  }, [b, ready]);

  const s = b.saisie;
  const setS = (patch: Partial<Saisie>) => setB((x) => ({ ...x, saisie: { ...x.saisie, ...patch } }));
  const set = (patch: Partial<Brouillon>) => setB((x) => ({ ...x, ...patch }));
  // Chaque étape a son entrée d'historique : le geste retour revient à l'étape précédente.
  const allerStep = useEtapesHistorique("locative", b.step, (step) => set({ step }));

  const quartier = quartierDe(s.lat, s.lon, s.citycode, s.ville);
  const comps = useMemo(() => [...b.comps, ...saisies], [b.comps, saisies]);
  const marche = useMemo<LoyersMarche | null>(() => {
    const retenus = comps.filter((c) => !c.exclu && c.surface > 0 && c.loyer > 0);
    const ppm = retenus.map((c) => c.loyer / c.surface).sort((a, b2) => a - b2);
    if (ppm.length) {
      const q = (p: number) => {
        const pos = (ppm.length - 1) * p;
        const i = Math.floor(pos);
        return ppm[i + 1] !== undefined ? ppm[i] + (pos - i) * (ppm[i + 1] - ppm[i]) : ppm[i];
      };
      return { loyerM2: Math.round(q(0.5)), p25: Math.round(q(0.25)), p75: Math.round(q(0.75)), count: ppm.length };
    }
    const m = s.loyerM2Manuel;
    if (m && m > 0) return { loyerM2: Math.round(m), p25: Math.round(m * 0.92), p75: Math.round(m * 1.08), count: 0 };
    const q = quartier ? LOYERS_QUARTIER[quartier] : undefined;
    if (q) {
      const med = Math.round((q.min + q.max) / 2);
      return { loyerM2: med, p25: q.min, p75: q.max, count: 0 };
    }
    return null;
  }, [comps, s.loyerM2Manuel, quartier]);

  const res = useMemo<LoyerResult | null>(() => {
    if (!marche || s.surface <= 0) return null;
    const r = calculerLoyer(input(), marche);
    return { ...r, plafond: plafondEncadrement(s.surface) };
  }, [marche, s]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const loyerConseille = b.loyerTouche ? b.loyerConseille : res?.central;

  const etape1Ok = s.adresse.trim().length > 4 && s.surface > 0;
  const etape2Ok = !!marche;

  function input(): LoyerInput {
    return {
      propertyType: s.type === "maison" ? "Maison" : "Appartement",
      surface: s.surface,
      rooms: s.pieces ?? 0,
      floor: s.type === "appartement" ? s.etage ?? null : null,
      hasElevator: !!s.ascenseur,
      condition: s.etat,
      outdoor: !!s.exterieur,
      parking: s.parking,
      dpe: s.dpe,
      meuble: s.meuble,
    };
  }

  const supprimerComp = (id: string) => {
    setB((x) => ({ ...x, comps: x.comps.filter((c) => c.id !== id) }));
  };

  async function rediger() {
    if (!res || !marche) return;
    setIaLoading(true);
    setIaError("");
    try {
      const lignes = [
        `Bien : ${resumeBien({ type: s.type, surface: s.surface, pieces: s.pieces })}, ${s.adresse}${quartier ? ` (quartier ${quartier})` : ""}.`,
        s.type === "appartement" && s.etage != null ? `Étage : ${s.etage === 0 ? "rez-de-chaussée" : `${s.etage}${s.etage === 1 ? "er" : "e"} étage`}${s.ascenseur ? " avec ascenseur" : " sans ascenseur"}.` : "",
        `Extérieur : ${s.exterieur || "aucun"}. Stationnement : ${s.parking ? "oui" : "non"}. État : ${ETAT_LABEL[s.etat]}. DPE : ${s.dpe ?? "non communiqué"}. Location ${s.meuble ? "meublée" : "vide"}.`,
        marche.count
          ? `Références du terrain : ${marche.count} loyer${marche.count > 1 ? "s" : ""} comparable${marche.count > 1 ? "s" : ""}, loyer médian ${marche.loyerM2} €/m², la moitié entre ${marche.p25} et ${marche.p75} €/m².`
          : s.loyerM2Manuel
          ? `Référence de marché : ${marche.loyerM2} €/m² (constatée par le conseiller sur le secteur).`
          : `Référence indicative du quartier${quartier ? ` ${quartier}` : ""} : ${marche.p25} à ${marche.p75} €/m² (ordres de grandeur de l'agence, à confirmer avec les loyers réels du secteur).`,
        `Ajustements appliqués : ${res.ajustements.length ? res.ajustements.map((a) => `${a.label} ${a.pct > 0 ? "+" : ""}${Math.round(a.pct * 100)} %`).join(", ") : "aucun"}.`,
        `Fourchette : ${res.low} € / ${res.central} € / ${res.high} € par mois (${res.sqm} €/m² ajusté). Fiabilité : ${res.confidence}.`,
        loyerConseille ? `Loyer de présentation conseillé : ${loyerConseille} € par mois.` : "",
      ].filter(Boolean);
      const r = await ask({
        system:
          "Tu es l'assistant de l'agence PATRIM à Toulouse. Tu rédiges des avis locatifs express destinés au propriétaire (vouvoiement) : clair, chiffré, prudent. Réponds uniquement par le texte du commentaire, sans markdown.",
        prompt: `Rédige le commentaire de l'avis locatif express pour le propriétaire : 2 à 3 courts paragraphes, 90 à 140 mots. 1) Les loyers observés sur le secteur. 2) Les atouts et points de vigilance du bien (uniquement d'après les informations ci-dessus). 3) Le loyer conseillé et la stratégie (un loyer juste dès le départ trouve vite son locataire). Pas de promesse de délai, aucun superlatif, n'invente aucune caractéristique.${lignes.join("\n")}`,
        effort: "low",
        maxTokens: 900,
      });
      set({ commentaire: r.text.trim() });
    } catch (e) {
      setIaError((e as Error).message);
    } finally {
      setIaLoading(false);
    }
  }

  const recommencer = () => {
    setB(VIDE);
    setRepris(false);
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  };

  const imprimer = () => {
    const p = new URLSearchParams();
    p.set("adresse", s.adresse);
    p.set("type", s.type);
    if (s.surface) p.set("surface", String(s.surface));
    if (s.pieces) p.set("pieces", String(s.pieces));
    if (s.ville) p.set("ville", s.ville);
    if (quartier) p.set("quartier", quartier);
    if (s.meuble) p.set("meuble", "1");
    if (marche && res) {
      p.set("bas", String(res.low));
      p.set("central", String(res.central));
      p.set("haut", String(res.high));
      p.set("loyerM2", String(res.sqm));
      p.set("confiance", res.confidence);
    }
    if (loyerConseille) p.set("conseille", String(loyerConseille));
    if (b.commentaire) p.set("commentaire", b.commentaire);
    if (s.exterieur) p.set("exterieur", s.exterieur);
    if (s.parking) p.set("parking", "1");
    if (s.type === "appartement" && s.etage != null) {
      p.set("etage", String(s.etage));
      if (s.ascenseur) p.set("ascenseur", "1");
    }
    if (s.dpe) p.set("dpe", s.dpe);
    if (s.etat) p.set("etat", s.etat);
    if (b.proprietaireId) p.set("proprio", b.proprietaireId);
    const retenus = comps.filter((c) => !c.exclu).slice(0, 6);
    if (retenus.length) p.set("comps", retenus.map((c) => [c.adresse, "", `${c.surface} m²${c.pieces ? ` · ${c.pieces} pièces` : ""}`, c.loyer, Math.round((c.loyer / c.surface) * 10) / 10].join("|")).join("§"));
    const q = quartier ? LOYERS_QUARTIER[quartier] : undefined;
    if (q) p.set("refQuartier", `${q.min}|${q.max}`);
    if (res) {
      const avantages = [
        s.exterieur ? `Extérieur : ${s.exterieur.toLowerCase()}` : "",
        s.parking ? "Stationnement" : "",
        s.meuble ? "Location meublée (loyer majoré)" : "",
        ...res.ajustements.filter((a) => a.pct > 0).map((a) => a.label),
      ].filter(Boolean);
      const vigilances = res.ajustements.filter((a) => a.pct < 0).map((a) => a.label);
      if (avantages.length) p.set("avantages", [...new Set(avantages)].join("§"));
      if (vigilances.length) p.set("vigilances", [...new Set(vigilances)].join("§"));
    }
    window.open(`/imprimer/locative?${p.toString()}`, "_blank");
  };

  if (!ready) return <div className="skeleton h-64" />;

  const STEPS = ["Le bien", "Loyers du secteur", "Avis locatif"];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Estimation locative express" subtitle="Un avis de loyer en 2 minutes, avec les loyers réels du terrain et les références du quartier." />
      <div className="mb-5 animate-fade-up">
        <ol className="grid grid-cols-3 gap-2">
          {STEPS.map((label, i) => {
            const reachable = i === 0 || (i === 1 && etape1Ok) || (i === 2 && etape1Ok && etape2Ok);
            const on = i === b.step;
            const done = i < b.step;
            return (
              <li key={label}>
                <button type="button" disabled={!reachable} onClick={() => allerStep(i)} className="group w-full text-left disabled:opacity-50">
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
          <span className="flex-1">Estimation locative en cours reprise là où vous l'aviez laissée.</span>
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
                  onPick={(x: Suggestion) => setS({ adresse: x.label, codePostal: x.codePostal, ville: x.ville, citycode: x.citycode, lat: x.lat, lon: x.lon })}
                />
                {quartier && (
                  <div className="mt-2 text-[11px] text-muted">
                    Quartier : <span className="font-medium text-fg">{quartier}</span>
                  </div>
                )}
              </div>
              <div>
                <span className="label">Type de bien</span>
                <Choix
                  size="lg"
                  value={s.type}
                  onChange={(v) => v && setS({ type: v })}
                  options={[
                    { value: "appartement", label: <><Building size={17} /> Appartement</> },
                    { value: "maison", label: <><House size={17} /> Maison</> },
                  ]}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Surface habitable">
                  <Nombre value={s.surface || undefined} onChange={(v) => setS({ surface: v ?? 0 })} unit="m²" decimal placeholder="65" />
                </Field>
                <Field label="Pièces">
                  <Choix value={s.pieces} onChange={(v) => setS({ pieces: v })} allowEmpty options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: n === 7 ? "7 +" : `${n}` }))} />
                </Field>
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
            </div>
          </Card>
          <Card title="Atouts, état et location">
            <div className="space-y-5">
              <div>
                <span className="label flex items-center gap-1.5">
                  <Trees size={13} /> Extérieur
                </span>
                <Choix value={s.exterieur ?? ""} onChange={(v) => setS({ exterieur: v || undefined })} options={[{ value: "", label: "Aucun" }, ...EXTERIEURS.map((e) => ({ value: e as string, label: e }))]} />
              </div>
              <div>
                <span className="label">Type de location</span>
                <Choix
                  size="lg"
                  value={s.meuble ? "meuble" : "vide"}
                  onChange={(v) => setS({ meuble: v === "meuble" })}
                  options={[
                    { value: "vide", label: <><House size={17} /> Vide</> },
                    { value: "meuble", label: <><KeyRound size={17} /> Meublée</> },
                  ]}
                />
              </div>
              <Interrupteur
                checked={s.parking}
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
                      className={cx("grid size-11 place-items-center rounded-xl border transition", s.dpe === d ? "border-accent ring-2 ring-accent/25 bg-surface-2" : "border-line bg-surface hover:bg-surface-2")}
                      aria-pressed={s.dpe === d}
                    >
                      <DpeBadge value={d} />
                    </button>
                  ))}
                  <button type="button" onClick={() => setS({ dpe: undefined })} className={cx("h-11 rounded-xl border px-3 text-xs font-medium", !s.dpe ? "border-accent bg-surface-2" : "border-line bg-surface text-muted")}>
                    Inconnu
                  </button>
                </div>
              </div>
            </div>
          </Card>
          <div className="flex justify-end">
            <button type="button" className="btn-primary !h-12 w-full sm:w-auto sm:px-6" disabled={!etape1Ok} onClick={() => allerStep(1)}>
              Chercher les loyers du secteur <ArrowRight size={17} />
            </button>
          </div>
          {!etape1Ok && <p className="text-center text-[11px] text-muted sm:text-right">Adresse et surface suffisent pour démarrer.</p>}
        </div>
      )}

      {/* ===================== ÉTAPE 2 : LOYERS ===================== */}
      {b.step === 1 && (
        <div key="e2" className="space-y-4 animate-fade-up">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-muted">
                  Loyer au m² des références retenues{!marche?.count && marche ? " (saisie manuelle)" : ""}
                </div>
                {pret ? (
                  <div className="font-serif text-3xl font-semibold tracking-tight tabular-nums">{marche ? `${marche.loyerM2.toLocaleString("fr-FR")} €/m²` : "—"}</div>
                ) : (
                  <div className="skeleton mt-2 h-9 w-40" />
                )}
                <div className="mt-1 text-xs text-muted">
                  {marche?.count
                    ? `${marche.count} loyer${marche.count > 1 ? "s" : ""} comparable${marche.count > 1 ? "s" : ""} · moitié entre ${marche.p25.toLocaleString("fr-FR")} et ${marche.p75.toLocaleString("fr-FR")} €/m²`
                    : "Aucune référence pour le moment"}
                </div>
              </div>
              {quartier && LOYERS_QUARTIER[quartier] && (
                <Badge tone="info">{quartier}</Badge>
              )}
            </div>
            {quartier && LOYERS_QUARTIER[quartier] && (
              <p className="mt-3 text-[11px] text-muted">
                Quartier {quartier} : loyers de marché habituellement autour de{" "}
                {LOYERS_QUARTIER[quartier].min} à {LOYERS_QUARTIER[quartier].max} €/m². Ajustez si votre terrain dit autre chose.
              </p>
            )}
            {disponible && (
              <p className="mt-2 text-[11px] text-muted">
                {disponible.terrains} mise{disponible.terrains > 1 ? "s" : ""} en gestion tirée{disponible.terrains > 1 ? "s" : ""} de « Mes revenus »
                {disponible.quartiers.size > 0 && ` · quartiers : ${[...disponible.quartiers].join(", ")}`}
              </p>
            )}
          </Card>

          {comps.length > 0 && (
            <Card title="Loyers comparables" action={<span className="text-[11px] text-muted">{comps.filter((c) => !c.exclu).length} retenu{comps.filter((c) => !c.exclu).length > 1 ? "s" : ""}</span>}>
              <ul className="divide-y divide-line text-sm">
                {comps.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setB((x) => ({ ...x, comps: x.comps.map((v) => (v.id === c.id ? { ...v, exclu: !v.exclu } : v)) }))
                      }
                      className={cx("grid size-5 shrink-0 place-items-center rounded-md border", c.exclu ? "border-line bg-surface-2 text-muted" : "border-accent bg-accent text-white")}
                      aria-label={c.exclu ? "Retenir" : "Écarter"}
                    >
                      {!c.exclu && <Check size={12} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={cx("truncate font-medium", c.exclu && "text-muted line-through")}>{c.adresse}</div>
                      <div className="text-[11px] text-muted">
                        {c.source === "terrain" ? "Terrain · " : ""}
                        {c.pieces ? `${c.pieces} pièces · ` : ""}
                        {c.surface} m²{c.date ? ` · ${dateCourte(c.date)}` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cx("font-semibold tabular-nums", c.exclu && "text-muted")}>{eur(c.loyer)}</div>
                      <div className="text-[11px] text-muted tabular-nums">{Math.round((c.loyer / c.surface) * 10) / 10} €/m²</div>
                    </div>
                    {c.source === "manuel" && (
                      <button type="button" onClick={() => supprimerComp(c.id)} className="btn-ghost btn-sm !px-2 text-muted" aria-label="Supprimer">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div>
            {!ajout ? (
              <button type="button" onClick={() => setAjout(true)} className="btn-ghost btn-sm text-muted">
                <Plus size={14} /> Ajouter un loyer connu (votre gestion, un confrère…)
              </button>
            ) : (
              <AjoutLoyer
                onCancel={() => setAjout(false)}
                onAdd={(v) => {
                  setB((x) => ({ ...x, comps: [v, ...x.comps] }));
                  setAjout(false);
                }}
              />
            )}
          </div>

          {(!marche || !quartier || !LOYERS_QUARTIER[quartier ?? ""]) && (
            <Card title={!marche ? "Ou partez d'une référence au m²" : "Affinez la référence au m²"}>
              <Field
                label="Loyer au m² constaté sur le secteur"
                hint="Vos locations gérées, les annonces du quartier… Basez l'avis sur ce que vous savez."
              >
                <Nombre value={s.loyerM2Manuel} onChange={(v) => setS({ loyerM2Manuel: v })} unit="€/m²" placeholder="14" decimal />
              </Field>
              {marche && marche.count === 0 && quartier && LOYERS_QUARTIER[quartier] && (
                <p className="mt-2 text-[11px] text-muted">
                  Actuellement basé sur la référence quartier ({LOYERS_QUARTIER[quartier].min}–{LOYERS_QUARTIER[quartier].max} €/m²). Votre saisie la remplacera.
                </p>
              )}
            </Card>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" className="btn-secondary !h-12" onClick={() => allerStep(0)}>
              <ArrowLeft size={17} />
              <span className="hidden sm:inline">Le bien</span>
            </button>
            <button type="button" className="btn-primary !h-12 flex-1 sm:flex-none sm:ml-auto sm:px-6" disabled={!etape2Ok} onClick={() => allerStep(2)}>
              Voir l'avis locatif <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* ===================== ÉTAPE 3 : RÉSULTAT ===================== */}
      {b.step === 2 && res && marche && (
        <div key="e3" className="space-y-4 animate-fade-up">
          <section className="card overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-brand via-brand to-coral" />
            <div className="card-pad">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">Loyer de marché estimé</div>
                  <div className="font-serif text-[34px] leading-tight font-semibold tracking-tight tabular-nums">{eur(res.central)}<span className="text-base font-normal text-muted"> / mois</span></div>
                  <div className="text-xs text-muted">
                    soit {res.sqm.toLocaleString("fr-FR")} €/m² · {resumeBien({ type: s.type, surface: s.surface, pieces: s.pieces })}
                  </div>
                </div>
                <Badge tone={marche.count ? CONFIANCE_TONE[res.confidence] : "warn"}>
                  Fiabilité {marche.count ? res.confidence : "à confirmer"}
                </Badge>
              </div>
              <FourchetteLoyer bas={res.low} median={res.central} haut={res.high} conseille={loyerConseille} />
            </div>
          </section>

          {res.plafond != null && res.central > res.plafond && (
            <div className="card card-pad border-warn/30">
              <div className="flex gap-3 text-sm">
                <Info size={18} className="mt-0.5 shrink-0 text-warn" />
                <div>
                  <p className="font-medium">Encadrement des loyers à Toulouse</p>
                  <p className="mt-1 text-muted">
                    Le loyer de marché estimé dépasse le plafond réglementaire probable ({eur(res.plafond)}). Une dérogation « petit logement » ne s'applique qu'aux logements très énergivores avec travaux. Faites le point avant de fixer le loyer.
                  </p>
                </div>
              </div>
            </div>
          )}

          <Card title="Comment on arrive à ce loyer">
            <ul className="divide-y divide-line text-sm">
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  {marche.count ? `Loyer médian de ${marche.count} référence${marche.count > 1 ? "s" : ""}` : "Loyer au m² saisi"}
                  <span className="block text-[11px] text-muted">
                    {marche.count ? "loyers réels du terrain" : "à ajuster avec vos références"}
                    {quartier ? ` · quartier ${quartier}` : ""}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{marche.loyerM2.toLocaleString("fr-FR")} €/m²</span>
              </li>
              {res.ajustements.map((a) => (
                <li key={a.label} className="flex items-center justify-between gap-3 py-2.5">
                  <span>{a.label}</span>
                  <span className={cx("font-semibold tabular-nums", a.pct > 0 ? "text-ok" : "text-warn")}>{pct(a.pct)}</span>
                </li>
              ))}
              {!res.ajustements.length && <li className="py-2.5 text-muted">Aucun ajustement : bien dans la moyenne du secteur.</li>}
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="font-medium">Loyer au m² retenu</span>
                <span className="font-semibold tabular-nums text-accent">{res.sqm.toLocaleString("fr-FR")} €/m²</span>
              </li>
            </ul>
          </Card>

          <Card title="Loyer de présentation conseillé">
            <div className="space-y-3">
              <Nombre value={loyerConseille} onChange={(v) => set({ loyerConseille: v, loyerTouche: true })} unit="€ / mois" decimal className="[&_input]:!h-12 [&_input]:text-lg [&_input]:font-semibold" />
              <div className="flex flex-wrap gap-1.5">
                {[
                  { l: "Bas", v: res.low },
                  { l: "Médian", v: res.central },
                  { l: "Haut", v: res.high },
                ].map((o) => (
                  <button type="button" key={o.l} onClick={() => set({ loyerConseille: o.v, loyerTouche: true })} className={cx("chip !h-8 !px-3", loyerConseille === o.v && "!border-accent !text-accent")}>
                    {o.l} · {eur(o.v)}
                  </button>
                ))}
              </div>
              {loyerConseille ? (
                <p className="text-[11px] text-muted">
                  {(loyerConseille / s.surface).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} €/m²
                  {Math.abs(loyerConseille - res.central) / res.central >= 0.005 && ` · ${pct((loyerConseille - res.central) / res.central)} par rapport à la médiane`}
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
                className="input min-h-[140px] text-[13px]"
                rows={6}
                value={b.commentaire}
                onChange={(e) => set({ commentaire: e.target.value })}
                placeholder="L'assistant rédige un argumentaire prudent et chiffré à partir des loyers. Vous pouvez aussi l'écrire vous-même."
              />
            )}
          </Card>

          <Card title="Propriétaire">
            <ContactPicker value={b.proprietaireId} onChange={(id) => set({ proprietaireId: id })} />
            <p className="mt-2 text-[11px] text-muted">
              Sélectionné ici, le propriétaire reçoit l'avis par mail (un brouillon s'ouvre, rien n'est envoyé automatiquement) et son nom apparaît sur le document.
            </p>
          </Card>

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className="btn-secondary !h-12" onClick={() => allerStep(1)}>
              <ArrowLeft size={17} />
              <span className="hidden sm:inline">Loyers</span>
            </button>
            <button type="button" className="btn-primary !h-12 flex-1 sm:flex-none sm:ml-auto sm:px-6" onClick={imprimer}>
              <FileDown size={17} /> Imprimer l'avis locatif
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Fourchette (version locative, loyers en bas d'échelle) ---------- */
function FourchetteLoyer({ bas, median, haut, conseille }: { bas: number; median: number; haut: number; conseille?: number }) {
  const min = Math.min(bas, conseille ?? bas);
  const max = Math.max(haut, conseille ?? haut);
  const span = max - min || 1;
  const pad = span * 0.08;
  const lo = min - pad;
  const hi = max + pad;
  const rel = (v: number) => (v - lo) / (hi - lo);
  const pos = (v: number) => `${rel(v) * 100}%`;
  return (
    <div className="w-full pt-8">
      <div className="relative h-3 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-accent/35 via-accent to-accent/35" style={{ left: pos(bas), right: `calc(100% - ${pos(haut)})` }} />
        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 size-4 rounded-full border-[3px] border-surface bg-accent shadow" style={{ left: pos(median) }} />
        {conseille != null && conseille > 0 && (
          <div className="absolute bottom-full mb-1.5 h-[26px]" style={{ left: pos(conseille) }}>
            <span className="absolute bottom-0 left-0 h-2 w-px bg-coral" />
            <span className={cx("absolute bottom-2 rounded-md bg-coral px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-sm", rel(conseille) < 0.2 ? "left-0 -translate-x-1" : rel(conseille) > 0.8 ? "right-0 translate-x-1" : "left-0 -translate-x-1/2")}>
              conseillé
            </span>
          </div>
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-muted tabular-nums">
        <span className="absolute left-0">{eur(bas)}</span>
        <span className="absolute left-1/2 -translate-x-1/2">{eur(median)}</span>
        <span className="absolute right-0">{eur(haut)}</span>
      </div>
    </div>
  );
}

/* ---------- Ajout d'un loyer connu ---------- */
function AjoutLoyer({ onAdd, onCancel }: { onAdd: (v: LoyerComp) => void; onCancel: () => void }) {
  const [adresse, setAdresse] = useState("");
  const [loyer, setLoyer] = useState<number>();
  const [surface, setSurface] = useState<number>();
  const [pieces, setPieces] = useState<number>();
  const ok = adresse.trim() && loyer && surface;
  return (
    <div className="card card-pad space-y-3 animate-fade-up">
      <div className="h-section">Loyer connu</div>
      <Field label="Adresse">
        <input className="input" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Rue, ville" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loyer mensuel hors charges">
          <Nombre value={loyer} onChange={setLoyer} unit="€" decimal />
        </Field>
        <Field label="Surface">
          <Nombre value={surface} onChange={setSurface} unit="m²" decimal />
        </Field>
        <Field label="Pièces">
          <Nombre value={pieces} onChange={setPieces} />
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
            loyer &&
            surface &&
            onAdd({
              id: "l-" + Date.now().toString(36),
              adresse: adresse.trim(),
              loyer,
              surface,
              pieces,
              source: "manuel",
              date: new Date().toISOString().slice(0, 10),
            })
          }
        >
          <Plus size={16} /> Ajouter
        </button>
      </div>
    </div>
  );
}

/* ---------- Lecture des loyers réels « Mes revenus » (mises en gestion) ---------- */
function useLoyersTerrain() {
  const { ventes, pret } = useRevenus();
  const { items: biens } = useBiens("biens");
  const saisies = useMemo<LoyerComp[]>(() => {
    const parBien = new Map(biens.map((b2) => [b2.id, b2]));
    return ventes
      .filter((v) => v.type === "gestion" && v.honoraires != null && v.honoraires > 0)
      .map((v): LoyerComp | undefined => {
        const bien = v.bienId ? parBien.get(v.bienId) : undefined;
        const surface = bien?.surface;
        if (!surface) return undefined;
        const quartier = bien?.quartier || quartierDe(bien?.lat, bien?.lon, undefined, bien?.ville);
        return {
          id: v.id,
          adresse: bien?.adresse || v.adresse || v.libelle || "Gestion",
          ville: bien?.ville,
          quartier,
          loyer: v.honoraires ?? 0,
          surface,
          pieces: bien?.pieces,
          source: "terrain",
          date: v.dateActe,
        };
      })
      .filter((c): c is LoyerComp => !!c);
  }, [ventes, biens]);

const disponible = useMemo(() => {
    const quartiers = new Set(saisies.map((c) => c.quartier).filter(Boolean) as string[]);
    return { terrains: saisies.length, quartiers };
  }, [saisies]);
  return { saisies, pret, disponible };
}
