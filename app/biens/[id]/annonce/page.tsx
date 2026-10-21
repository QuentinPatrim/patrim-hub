"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, ExternalLink, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { Badge, Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { annonceDe, champsIcs, controles, corpsDe, corpsParDefaut, enCopro, texteAnnonce, trous, type InfosAnnonce } from "@/components/annonce/annonce";
import { locationDe, locationSeule } from "@/components/location/bienLocation";
import { ask } from "@/lib/ai";
import { useDoc } from "@/lib/store";
import { dateCourte, today } from "@/lib/format";
import type { Bien } from "@/lib/types";

/* ============================================================
   Annonce d'un bien, prête pour ICS (qui la diffuse sur les
   portails) : texte au format PATRIM, mentions obligatoires
   contrôlées, champs à recopier et photos. Rien n'est publié
   d'ici : la saisie dans ICS reste faite par le conseiller.
   ============================================================ */

const CONSIGNES = `Tu rédiges le corps d'une annonce immobilière au format de l'agence PATRIM (Toulouse).
Format : un seul paragraphe dense, qui commence par l'accroche « QUARTIER EN MAJUSCULES / rue : », puis l'immeuble et l'étage (« Au 3ème étage avec ascenseur d'un bel immeuble… »), la typologie (« appartement de Type 3 … d'env 65 m² comprenant : »), l'énumération des pièces séparées par des virgules, puis les annexes (« Le bien dispose de … »), et la situation locative si le bien est loué.
Exemple : « GRAND-ROND / rue de Tivoli : Au 6ème étage avec ascenseur d'un bel immeuble, grand appartement traversant de Type 4 entièrement repeint d'env 100 m² comprenant : un hall d'entrée, un grand séjour lumineux, une cuisine séparée équipée ouvert sur un balcon, trois chambres avec rangements dont une avec salle d'eau, une salle de bain, un WC séparé. Nombreux rangements. Le bien dispose de deux places de parking en sous-sol et d'une cave. »
Règles : n'invente rien ; une information absente devient « [À compléter : …] ». Adjectifs mesurés (lumineux, traversant, rénové, équipé), pas de superlatif gratuit, pas d'émoji. Virgule décimale française.
N'écris PAS les coordonnées de l'agence, le prix, les honoraires, le DPE ni les mentions légales : ils sont ajoutés automatiquement après. Réponds uniquement par le paragraphe.`;

export default function AnnoncePage() {
  const { id } = useParams<{ id: string }>();
  const { doc, update } = useDoc("biens", id);
  const b = doc as Bien | undefined;
  const [waited, setWaited] = useState(false);
  const [ia, setIa] = useState<"" | "en_cours" | string>("");
  const [copie, setCopie] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!b) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const a = annonceDe(b);
  const loc = locationSeule(b);
  const maj = (p: Partial<InfosAnnonce>) => update({ annonce: { ...a, ...p } } as Partial<Bien>);
  const texte = texteAnnonce(b, a);
  const manque = trous(texte);
  const ctrl = controles(b, a);
  const champs = champsIcs(b, a);

  const copier = async (cle: string, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopie(cle);
      setTimeout(() => setCopie((c) => (c === cle ? "" : c)), 1800);
    } catch {
      window.prompt("Copiez :", t);
    }
  };

  const rediger = async () => {
    setIa("en_cours");
    const l = locationDe(b);
    const fiche = {
      transaction: loc ? `location ${l?.meuble ? "meublée" : "vide"}` : "vente",
      type: b.type,
      quartier: b.quartier,
      ville: b.ville,
      rue: a.rue,
      surface: b.surface,
      pieces: b.pieces,
      chambres: b.chambres,
      etage: b.etage,
      etagesImmeuble: b.nbEtages,
      ascenseur: b.ascenseur,
      exterieur: b.exterieur,
      parking: b.parking,
      cave: b.cave,
      anneeConstruction: b.anneeConstruction,
      chauffage: b.chauffage,
      pointsForts: b.pointsForts,
      descriptionActuelle: corpsDe(b, a),
    };
    try {
      const r = await ask({ system: CONSIGNES, prompt: `Fiche du bien (JSON) :\n${JSON.stringify(fiche, null, 1)}`, effort: "low", maxTokens: 1200 });
      const t = r.text.trim().replace(/^«\s*|\s*»$/g, "");
      if (t) maj({ corps: t });
      setIa("");
    } catch (e) {
      setIa((e as Error).message || "L'assistant n'a pas répondu.");
    }
  };

  const Bouton = ({ cle, t, label }: { cle: string; t: string; label?: string }) => (
    <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => copier(cle, t)}>
      {copie === cle ? <Check size={14} className="text-ok" /> : <Copy size={14} />} {label ?? (copie === cle ? "Copié" : "Copier")}
    </button>
  );

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Annonce" subtitle={b.titre} />

      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {a.ics ? <Badge tone="ok">Saisie dans ICS le {dateCourte(a.ics)}</Badge> : <Badge>Pas encore saisie dans ICS</Badge>}
        {manque.length ? <Badge tone="warn">{manque.length} point{manque.length > 1 ? "s" : ""} à compléter</Badge> : <Badge tone="ok">Texte complet</Badge>}
        {b.annonceUrl && (
          <a href={b.annonceUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-accent">
            <ExternalLink size={13} /> Voir sur patrim.fr
          </a>
        )}
      </div>

      <Card title="Mentions obligatoires">
        <ul className="space-y-1.5 text-sm">
          {ctrl.map((c) => (
            <li key={c.texte} className="flex items-start gap-2">
              {c.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" /> : <TriangleAlert size={17} className="mt-0.5 shrink-0 text-warn" />}
              <span className={cx(!c.ok && "font-medium")}>{c.texte}</span>
            </li>
          ))}
        </ul>
        {ctrl.some((c) => !c.ok) && (
          <p className="mt-3 text-xs text-muted">
            Prix, honoraires, surface, copropriété et loyer se corrigent dans la fiche du bien (« Modifier »). Le reste se saisit ci-dessous.
          </p>
        )}
      </Card>

      <Card title="Diagnostic de performance énergétique">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Consommation (kWh/m²/an)">
            <NumInput value={a.dpeKwh} onChange={(v) => maj({ dpeKwh: v })} />
          </Field>
          <Field label="Émissions (kg CO₂/m²/an)">
            <NumInput value={a.gesKg} onChange={(v) => maj({ gesKg: v })} />
          </Field>
          <Field label="Énergie, coût mini (€/an)">
            <NumInput value={a.energieMin} onChange={(v) => maj({ energieMin: v })} />
          </Field>
          <Field label="Coût maxi (€/an)">
            <NumInput value={a.energieMax} onChange={(v) => maj({ energieMax: v })} />
          </Field>
          <Field label="Prix de l'énergie indexés en">
            <NumInput value={a.energieAnnee} onChange={(v) => maj({ energieAnnee: v })} placeholder="2024" />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">Ces chiffres figurent en première page du DPE.</p>
      </Card>

      <Card title={loc ? "Location" : "Copropriété"}>
        <div className="grid gap-3">
          <Field label="Rue ou repère pour l'accroche" hint="« QUARTIER / rue … : » en tête d'annonce">
            <input className="input" value={a.rue ?? ""} placeholder="rue de Tivoli" onChange={(e) => maj({ rue: e.target.value || undefined })} />
          </Field>
          {loc ? (
            <>
              <Field label="Disponible le">
                <input type="date" className="input" value={a.dispo ?? ""} onChange={(e) => maj({ dispo: e.target.value || undefined })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-[#6c191e]" checked={!!a.forfait} onChange={(e) => maj({ forfait: e.target.checked || undefined })} />
                Charges au forfait (sinon provision avec régularisation annuelle)
              </label>
            </>
          ) : (
            enCopro(b) && (
              <Field label="Procédure en cours dans la copropriété" hint="Laisser vide s'il n'y en a aucune.">
                <input className="input" value={a.procedure ?? ""} onChange={(e) => maj({ procedure: e.target.value || undefined })} />
              </Field>
            )
          )}
        </div>
      </Card>

      <Card
        title="Description"
        action={
          <button type="button" className="btn-ghost btn-sm" disabled={ia === "en_cours"} onClick={rediger}>
            <Sparkles size={14} /> {ia === "en_cours" ? "Rédaction…" : "Rédiger au format PATRIM"}
          </button>
        }
      >
        <textarea className="input min-h-[180px] py-3 text-sm leading-relaxed" value={corpsDe(b, a)} onChange={(e) => maj({ corps: e.target.value })} />
        {ia && ia !== "en_cours" && <p className="mt-2 text-xs text-danger">{ia}</p>}
        <div className="mt-2 flex flex-wrap gap-1">
          {a.corps && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => maj({ corps: undefined })}>
              <RotateCcw size={14} /> {b.description ? "Revenir à la description de la fiche" : "Revenir au premier jet"}
            </button>
          )}
          {!a.corps && !b.description && <span className="text-xs text-muted">Premier jet fait à partir de la fiche : {corpsParDefaut(b).length} caractères.</span>}
        </div>
        <p className="mt-2 text-xs text-muted">Coordonnées de l&apos;agence, prix, honoraires, DPE et mentions légales sont ajoutés automatiquement.</p>
      </Card>

      <Card title="Annonce complète" action={<Bouton cle="texte" t={texte} label={copie === "texte" ? "Copié" : "Copier le texte"} />}>
        <div className="whitespace-pre-wrap rounded-xl bg-surface-2 px-4 py-3 text-sm leading-relaxed">
          {texte.split(/(\[À compléter : [^\]]+\])/g).map((s, i) =>
            s.startsWith("[À compléter") ? (
              <mark key={i} className="rounded bg-warn/20 px-0.5 text-inherit">
                {s}
              </mark>
            ) : (
              s
            ),
          )}
        </div>
        <p className="mt-2 text-xs text-muted">{texte.length.toLocaleString("fr-FR")} caractères.</p>
      </Card>

      <Card title="Champs à recopier dans ICS">
        <div className="divide-y divide-line/70">
          {champs.map(([k, v]) => (
            <div key={k} className="flex min-h-11 items-center gap-2 py-1">
              <span className="w-40 shrink-0 text-sm text-muted">{k}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">{v}</span>
              <Bouton cle={k} t={v} label={copie === k ? "Copié" : ""} />
            </div>
          ))}
        </div>
      </Card>

      {!!b.photos?.length && (
        <Card title={`Photos (${b.photos.length})`}>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {b.photos.map((p, i) => (
              <a key={p + i} href={p} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p} alt="" className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute left-1 top-1 rounded-md bg-black/55 px-1.5 text-[11px] font-semibold text-white">{i + 1}</span>
              </a>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Dans l&apos;ordre de la fiche. Touchez une photo pour l&apos;ouvrir en grand et l&apos;enregistrer.</p>
        </Card>
      )}

      <div className="grid gap-2">
        <Link href="/annonces" className="btn-secondary !h-12">
          <ExternalLink size={17} /> Export portails (fichier de test)
        </Link>
        {a.ics ? (
          <button type="button" className="btn-secondary !h-12" onClick={() => maj({ ics: undefined })}>
            Annuler « saisie dans ICS »
          </button>
        ) : (
          <button type="button" className="btn-primary !h-12" onClick={() => maj({ ics: today() })}>
            <Check size={17} /> J&apos;ai saisi l&apos;annonce dans ICS
          </button>
        )}
      </div>
    </div>
  );
}
