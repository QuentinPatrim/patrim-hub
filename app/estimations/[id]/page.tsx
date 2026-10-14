"use client";

import { Calculator, ExternalLink, FileText, Handshake, Home, MapPin, Pencil, Sparkles, Trash2, Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, DpeBadge, Empty, Field, Sheet, Spinner, cx } from "@/components/ui";
import { ContactCarte, ContactPicker, Fourchette, VenteItem } from "@/components/estimations/blocks";
import { Choix, Nombre } from "@/components/estimations/controls";
import {
  CONFIANCE_TONE,
  ETAT_LABEL,
  STATUT_ESTIM,
  STATUTS,
  SYSTEM_COMMENTAIRE,
  arrondi,
  asPlus,
  atypiques,
  etageLabel,
  mapsUrl,
  promptCommentaire,
  resumeBien,
  typeLabel,
  ventesDe,
} from "@/components/estimations/shared";
import { ask } from "@/lib/ai";
import { dateLongue, eur, eurK, today } from "@/lib/format";
import { create, getAll, update, useCollection, useDoc } from "@/lib/store";
import type { MandatType } from "@/lib/types";

export default function EstimationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc: e, update: maj, remove } = useDoc("estimations", id);
  const { items: contacts } = useCollection("contacts");
  const { items: biens } = useCollection("biens");
  const [chargement, setChargement] = useState(true);
  const [prix, setPrix] = useState<number>();
  const [commentaire, setCommentaire] = useState("");
  const [notes, setNotes] = useState("");
  const [ia, setIa] = useState<{ loading: boolean; error?: string }>({ loading: false });
  const [mandatOpen, setMandatOpen] = useState(false);
  const [toutesVentes, setToutesVentes] = useState(false);
  const [changerProprio, setChangerProprio] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setChargement(false), 1500);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!e) return;
    setPrix(e.prixConseille);
    setCommentaire(e.resultat?.commentaire ?? "");
    setNotes(e.notes ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e?.id]);

  const ventes = useMemo(() => ventesDe(e), [e]);
  const atyp = useMemo(() => atypiques(ventes), [ventes]);

  if (!e) {
    return chargement ? (
      <div className="space-y-3">
        <div className="skeleton h-10 w-2/3" />
        <div className="skeleton h-48" />
      </div>
    ) : (
      <div className="card">
        <Empty
          icon={<FileText size={20} />}
          title="Estimation introuvable"
          text="Elle a peut-être été supprimée."
          action={
            <Link href="/estimations" className="btn-primary">
              Retour aux estimations
            </Link>
          }
        />
      </div>
    );
  }

  const p = asPlus(e);
  const proprio = contacts.find((c) => c.id === e.proprietaireId);
  const bien = e.bienId ? biens.find((x) => x.id === e.bienId) : undefined;
  const r = e.resultat;
  const retenues = ventes.filter((v) => !v.exclu);
  const ecartees = ventes.filter((v) => v.exclu);
  const montrees = toutesVentes ? retenues : retenues.slice(0, 8);
  const rue = e.adresse.replace(/\s*\d{5}\s+.*$/, "").trim() || e.adresse;

  const caracteristiques: [string, React.ReactNode][] = [
    ["Type", typeLabel(e.type)],
    ["Surface", `${e.surface.toLocaleString("fr-FR")} m²`],
    ["Pièces", e.pieces ?? "—"],
    ...(p.surfaceTerrain ? ([["Terrain", `${p.surfaceTerrain.toLocaleString("fr-FR")} m²`]] as [string, React.ReactNode][]) : []),
    ...(e.type === "appartement" ? ([["Étage", etageLabel(e.etage, e.ascenseur) ?? "—"]] as [string, React.ReactNode][]) : []),
    ["Extérieur", e.exterieur || "Aucun"],
    ["Stationnement", e.parking ? "Oui" : "Non"],
    ["État", e.etat ? ETAT_LABEL[e.etat] : "—"],
    ["DPE", e.dpe ? <DpeBadge key="dpe" value={e.dpe} /> : "Non communiqué"],
  ];

  async function reecrire() {
    if (!r || !p.marche) return;
    setIa({ loading: true });
    try {
      const res = await ask({
        system: SYSTEM_COMMENTAIRE,
        prompt: promptCommentaire({
          bien: { ...e!, quartier: p.quartier },
          res: { baseSqm: p.marche.medianSqm, adjustments: r.ajustements ?? [], totalPct: 0, sqm: r.prixM2, central: r.median, low: r.bas, high: r.haut, confidence: p.confiance ?? "moyenne" },
          marche: p.marche,
          rayon: p.rayon,
          periode: p.periode,
          prixConseille: e!.prixConseille,
          ventesManuelles: !p.rayon,
        }),
        effort: "low",
        maxTokens: 1200,
      });
      setCommentaire(res.text.trim());
      maj({ resultat: { ...r, commentaire: res.text.trim() } });
      setIa({ loading: false });
    } catch (err) {
      setIa({ loading: false, error: (err as Error).message });
    }
  }

  const supprimer = () => {
    if (!confirm("Supprimer définitivement cette estimation ?")) return;
    remove();
    router.push("/estimations");
  };

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="animate-fade-up">
        <Link href="/estimations" className="text-xs text-muted hover:text-fg">
          ← Estimations
        </Link>
        <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge tone={STATUT_ESTIM[e.statut].tone}>{STATUT_ESTIM[e.statut].label}</Badge>
              <span className="text-[11px] text-muted">Estimé le {dateLongue(e.createdAt)}</span>
            </div>
            <h1 className="h-title mt-1.5 truncate">{rue}</h1>
            <p className="mt-0.5 text-sm text-muted">{[resumeBien(e), p.quartier, [e.codePostal, e.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/estimations/nouvelle?id=${e.id}`} className="btn-secondary">
              <Pencil size={15} /> Modifier
            </Link>
            <Link href={`/imprimer/estimation/${e.id}`} className="btn-primary">
              <FileText size={16} /> Avis de valeur
            </Link>
          </div>
        </div>
      </div>

      {/* Statut */}
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
        {STATUTS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => maj({ statut: s })}
            className={cx("h-9 rounded-lg px-1 text-[11px] font-medium transition sm:text-xs", e.statut === s ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
          >
            {STATUT_ESTIM[s].label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4 min-w-0">
          {/* Résultat */}
          {r ? (
            <section className="card overflow-hidden animate-fade-up">
              <div className="h-1 bg-gradient-to-r from-brand via-brand to-coral" />
              <div className="card-pad">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted">Prix de présentation conseillé</div>
                    <div className="font-serif text-[34px] font-semibold leading-tight tracking-tight tabular-nums">{eur(e.prixConseille ?? r.median)}</div>
                    <div className="text-xs text-muted">
                      {Math.round((e.prixConseille ?? r.median) / e.surface).toLocaleString("fr-FR")} €/m² · valeur médiane {eurK(r.median)}
                    </div>
                  </div>
                  <Badge tone={p.rayon ? CONFIANCE_TONE[p.confiance ?? "moyenne"] : "warn"}>Fiabilité {p.rayon ? p.confiance ?? "moyenne" : "à confirmer"}</Badge>
                </div>
                <Fourchette bas={r.bas} median={r.median} haut={r.haut} conseille={e.prixConseille} />
                <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-line pt-4">
                  <Field label="Ajuster le prix conseillé" className="flex-1 min-w-[160px]">
                    <Nombre value={prix} onChange={setPrix} unit="€" />
                  </Field>
                  <button type="button" className="btn-secondary" disabled={!prix || prix === e.prixConseille} onClick={() => prix && maj({ prixConseille: arrondi(prix, 100) })}>
                    <Check size={15} /> Valider
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <Card>
              <Empty title="Estimation incomplète" text="Reprenez le parcours pour calculer la fourchette." action={<Link href={`/estimations/nouvelle?id=${e.id}`} className="btn-primary">Compléter</Link>} />
            </Card>
          )}

          {/* Actions */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {e.bienId ? (
              <Link href={`/biens/${e.bienId}`} className="btn-secondary !h-12">
                <Home size={16} /> {bien ? "Voir le bien en mandat" : "Voir le bien"}
              </Link>
            ) : (
              <button type="button" className="btn-primary !h-12" onClick={() => setMandatOpen(true)}>
                <Handshake size={17} /> Transformer en mandat
              </button>
            )}
            <Link href={`/imprimer/estimation/${e.id}`} className="btn-secondary !h-12">
              <FileText size={16} /> Avis de valeur PDF
            </Link>
            <Link href={`/simulateur?prix=${e.prixConseille ?? r?.median ?? ""}`} className="btn-secondary !h-12">
              <Calculator size={16} /> Financement acquéreur
            </Link>
          </div>

          {/* Méthode */}
          {r && (
            <Card title="Méthode">
              <ul className="divide-y divide-line text-sm">
                <li className="flex justify-between gap-3 py-2.5">
                  <span>
                    {p.rayon ? `Médiane de ${p.marche?.count ?? retenues.length} ventes réelles` : "Prix de référence saisi"}
                    {p.rayon && <span className="block text-[11px] text-muted">rayon {p.rayon} m{p.periode ? ` · ${p.periode}` : ""}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{p.marche ? `${p.marche.medianSqm.toLocaleString("fr-FR")} €/m²` : "—"}</span>
                </li>
                {(r.ajustements ?? []).map((a) => (
                  <li key={a.label} className="flex justify-between gap-3 py-2.5">
                    <span>{a.label}</span>
                    <span className={cx("font-semibold tabular-nums", a.pct > 0 ? "text-ok" : "text-warn")}>
                      {a.pct > 0 ? "+" : ""}
                      {Math.round(a.pct * 100)} %
                    </span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 py-2.5">
                  <span className="font-medium">Prix au m² retenu</span>
                  <span className="font-semibold tabular-nums text-accent">{r.prixM2.toLocaleString("fr-FR")} €/m²</span>
                </li>
              </ul>
            </Card>
          )}

          {/* Commentaire */}
          <Card
            title="Commentaire argumenté"
            action={
              r && p.marche ? (
                <button type="button" onClick={reecrire} disabled={ia.loading} className="btn-secondary btn-sm">
                  {ia.loading ? <Spinner /> : <Sparkles size={14} />} {commentaire ? "Réécrire" : "Rédiger"}
                </button>
              ) : undefined
            }
          >
            {ia.error && <p className="mb-2 text-xs text-danger">{ia.error}</p>}
            <textarea
              className="input min-h-[150px] text-[13px]"
              rows={7}
              value={commentaire}
              onChange={(ev) => setCommentaire(ev.target.value)}
              onBlur={() => r && commentaire !== (r.commentaire ?? "") && maj({ resultat: { ...r, commentaire: commentaire.trim() || undefined } })}
              placeholder="Texte repris dans l'avis de valeur."
            />
          </Card>

          {/* Comparables */}
          <Card title={`Ventes comparables (${retenues.length})`}>
            {retenues.length === 0 ? (
              <p className="text-sm text-muted">Aucune vente retenue{p.prixM2Manuel ? ` : prix de référence saisi à ${p.prixM2Manuel.toLocaleString("fr-FR")} €/m².` : "."}</p>
            ) : (
              <div className="space-y-2">
                {montrees.map((v) => (
                  <VenteItem key={v.id} v={v} atypique={atyp.has(v.id)} mediane={p.marche?.medianSqm} />
                ))}
                {retenues.length > montrees.length && (
                  <button type="button" onClick={() => setToutesVentes(true)} className="btn-ghost w-full">
                    <ChevronDown size={16} /> Voir les {retenues.length - montrees.length} autres
                  </button>
                )}
                {ecartees.length > 0 && <p className="pt-1 text-[11px] text-muted">{ecartees.length} vente{ecartees.length > 1 ? "s" : ""} écartée{ecartees.length > 1 ? "s" : ""} du calcul.</p>}
              </div>
            )}
          </Card>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-4 min-w-0">
          <Card
            title="Propriétaire"
            action={
              proprio && !changerProprio ? (
                <button type="button" className="btn-ghost btn-sm" onClick={() => setChangerProprio(true)}>
                  Changer
                </button>
              ) : undefined
            }
          >
            {proprio && !changerProprio ? (
              <ContactCarte c={proprio} link />
            ) : (
              <ContactPicker
                value={undefined}
                onChange={(cid) => {
                  maj({ proprietaireId: cid });
                  setChangerProprio(false);
                }}
              />
            )}
          </Card>

          <Card title="Le bien">
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              {caracteristiques.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <section className="card overflow-hidden">
            {e.lat != null && e.lon != null ? (
              <iframe
                title="Plan du secteur"
                className="block h-52 w-full border-0 grayscale-[30%]"
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${e.lon - 0.006},${e.lat - 0.0035},${e.lon + 0.006},${e.lat + 0.0035}&layer=mapnik&marker=${e.lat},${e.lon}`}
              />
            ) : (
              <div className="grid h-32 place-items-center bg-surface-2 text-muted">
                <MapPin size={22} />
              </div>
            )}
            <a href={mapsUrl(e)} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-surface-2 transition">
              <MapPin size={15} className="text-accent" />
              <span className="flex-1 truncate">{e.adresse}</span>
              <ExternalLink size={14} className="text-muted" />
            </a>
          </section>

          <Card title="Notes internes">
            <textarea
              className="input text-[13px]"
              rows={4}
              value={notes}
              onChange={(ev) => setNotes(ev.target.value)}
              onBlur={() => notes !== (e.notes ?? "") && maj({ notes: notes.trim() || undefined })}
              placeholder="Motivation du vendeur, délai, suite à donner… (jamais sur l'avis)"
            />
          </Card>

          <button type="button" onClick={supprimer} className="btn-ghost w-full text-danger">
            <Trash2 size={15} /> Supprimer l'estimation
          </button>
        </div>
      </div>

      <MandatSheet
        open={mandatOpen}
        onClose={() => setMandatOpen(false)}
        prixInitial={e.prixConseille ?? r?.median}
        onConfirm={({ type, numero, prix: prixMandat }) => {
          const quartier = p.quartier;
          const titre = `${typeLabel(e.type)}${e.pieces ? ` T${e.pieces}` : ""} de ${Math.round(e.surface)} m²${quartier ? ` – ${quartier}` : ""}`;
          const nouveau = create("biens", {
            titre,
            type: e.type,
            adresse: rue,
            codePostal: e.codePostal,
            ville: e.ville || "Toulouse",
            quartier,
            lat: e.lat,
            lon: e.lon,
            prix: prixMandat,
            surface: e.surface,
            surfaceTerrain: p.surfaceTerrain,
            pieces: e.pieces,
            etage: e.type === "appartement" ? e.etage : undefined,
            ascenseur: e.type === "appartement" ? e.ascenseur : undefined,
            exterieur: e.exterieur,
            parking: e.parking ? "Oui" : undefined,
            dpe: e.dpe,
            statut: "mandat_signe",
            mandat: { type, numero: numero || undefined, debut: today() },
            vendeurIds: e.proprietaireId ? [e.proprietaireId] : undefined,
            notes: `Créé depuis l'estimation du ${dateLongue(e.createdAt)} (fourchette ${r ? `${eurK(r.bas)} – ${eurK(r.haut)}` : "—"}).`,
          });
          maj({ statut: "mandat", bienId: nouveau.id, prixConseille: e.prixConseille ?? prixMandat });
          if (proprio && !proprio.roles.includes("vendeur")) {
            const c = getAll("contacts").find((x) => x.id === proprio.id);
            if (c) update("contacts", c.id, { roles: [...c.roles.filter((x) => x !== "prospect_vendeur"), "vendeur"], bienOrigineId: c.bienOrigineId ?? nouveau.id });
          }
          setMandatOpen(false);
        }}
      />
    </div>
  );
}

function MandatSheet({
  open,
  onClose,
  prixInitial,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  prixInitial?: number;
  onConfirm: (o: { type: MandatType; numero: string; prix?: number }) => void;
}) {
  const [type, setType] = useState<MandatType>("exclusif");
  const [numero, setNumero] = useState("");
  const [prix, setPrix] = useState<number | undefined>(prixInitial);
  useEffect(() => {
    if (open) setPrix(prixInitial);
  }, [open, prixInitial]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Transformer en mandat"
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-primary" onClick={() => onConfirm({ type, numero, prix })}>
            <Handshake size={16} /> Créer le bien
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">Le bien est créé dans vos mandats avec les informations de l'estimation, et le propriétaire devient vendeur.</p>
        <div>
          <span className="label">Type de mandat</span>
          <Choix
            value={type}
            onChange={(v) => v && setType(v)}
            options={[
              { value: "exclusif", label: "Exclusif" },
              { value: "semi_exclusif", label: "Semi-exclusif" },
              { value: "simple", label: "Simple" },
            ]}
          />
        </div>
        <Field label="Numéro de mandat (facultatif)">
          <input className="input" value={numero} onChange={(ev) => setNumero(ev.target.value)} />
        </Field>
        <Field label="Prix affiché" hint="Honoraires inclus. Modifiable ensuite dans la fiche du bien.">
          <Nombre value={prix} onChange={setPrix} unit="€" />
        </Field>
      </div>
    </Sheet>
  );
}
