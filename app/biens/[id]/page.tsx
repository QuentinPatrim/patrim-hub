"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  Eye,
  EyeOff,
  FileSignature,
  FileText,
  FolderOpen,
  Landmark,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Send,
  Star,
  Tag,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Badge, Card, DpeBadge, Empty, PageHeader, Sheet, cx } from "@/components/ui";
import { Gallery } from "@/components/biens/Gallery";
import { AjoutPhotos } from "@/components/biens/AjoutPhotos";
import { BienForm, finaliserBien, type BienExt } from "@/components/biens/BienForm";
import { AcquereursCompatibles } from "@/components/biens/AcquereursCompatibles";
import { RapportVendeur } from "@/components/biens/RapportVendeur";
import { DossierBlock } from "@/components/biens/DossierBlock";
import { STATUTS_ACTIFS, dateMandat } from "@/components/mandats/registre";
import { LienAvenant } from "@/components/avenant/LienAvenant";
import { pointAvenant } from "@/components/avenant/avenant";
import { basculerPoint, dossierDe, reglesDe } from "@/components/biens/dossier";
import { EnvoyerFiche } from "@/components/fiche/EnvoyerFiche";
import { DocumentsBien } from "@/components/documents/DocumentsBien";
import type { BienActes } from "@/components/documents/archive";
import { STATUTS, acquereursCompatibles, adresseComplete, champsACompleter, joursDepuis, mailHref, mapsHref, prixM2, telHref } from "@/components/biens/utils";
import { RdvForm, type RdvInitial } from "@/components/agenda/RdvForm";
import { CompteRenduSheet } from "@/components/agenda/CompteRenduSheet";
import { SUITE, crAFaire, type RdvExt } from "@/components/agenda/utils";
import { remove, useCollection, useDoc } from "@/lib/store";
import { STATUT_BIEN, TYPE_BIEN, dateCourte, dateLongue, eur, heure, m2, nomComplet, today } from "@/lib/format";
import type { Bien, BienStatut, Contact } from "@/lib/types";

/** Champ manquant → section du formulaire. */
const SECTION_DE: Record<string, string> = {
  prix: "prix",
  netVendeur: "prix",
  mandat: "prix",
  surface: "bien",
  pieces: "bien",
  etage: "bien",
  ascenseur: "bien",
  dpe: "diag",
  ges: "diag",
  anneeConstruction: "diag",
  chauffage: "diag",
  chargesAnnuelles: "copro",
  lotsCopro: "copro",
  taxeFonciere: "copro",
  quartier: "adresse",
  codePostal: "adresse",
  vendeurIds: "vendeur",
  photos: "photos",
  description: "texte",
};
const MANDAT_LABEL = { exclusif: "Exclusif", semi_exclusif: "Semi-exclusif", simple: "Simple" } as const;

export default function BienPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc, update } = useDoc("biens", id);
  const b = doc as BienExt | undefined;
  const { items: contacts } = useCollection("contacts");
  const { items: rdvsRaw } = useCollection("rdvs");
  const [editing, setEditing] = useState<false | string>(false);
  const [statutOpen, setStatutOpen] = useState(false);
  const [rapport, setRapport] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [rdvForm, setRdvForm] = useState<RdvInitial | null>(null);
  const [crId, setCrId] = useState<string>();
  const [delConfirm, setDelConfirm] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (typeof editing === "string") {
      requestAnimationFrame(() => document.getElementById(`sec-${editing}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [editing]);

  const rdvs = rdvsRaw as RdvExt[];
  const visites = useMemo(() => rdvs.filter((r) => r.bienId === id).sort((a, c) => c.debut.localeCompare(a.debut)), [rdvs, id]);
  const matches = useMemo(() => (b ? acquereursCompatibles(b, contacts) : []), [b, contacts]);
  const contactMap = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);
  const vendeurs = (b?.vendeurIds ?? []).map((v) => contactMap.get(v)).filter(Boolean) as Contact[];
  const nbProposes = contacts.filter((c) => c.biensProposes?.includes(id)).length;

  if (!b) {
    if (!waited)
      return (
        <div className="space-y-4">
          <div className="skeleton aspect-[4/3] sm:aspect-[21/9] rounded-3xl" />
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-5 w-1/3" />
        </div>
      );
    return (
      <div className="card">
        <Empty
          title="Bien introuvable"
          text="Il a peut-être été supprimé."
          action={
            <Link href="/biens" className="btn-primary">
              Retour aux biens
            </Link>
          }
        />
      </div>
    );
  }

  if (editing !== false)
    return (
      <div>
        <PageHeader title="Modifier le bien" subtitle={b.titre} />
        <BienForm
          initial={b}
          onCancel={() => setEditing(false)}
          onSubmit={(d) => {
            update(finaliserBien(d));
            setEditing(false);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </div>
    );

  const st = STATUT_BIEN[b.statut];
  const pm2 = prixM2(b);
  const jours = joursDepuis(b.dateMiseEnVente);
  const manquants = champsACompleter(b);
  const nbVisitesFaites = visites.filter((v) => v.statut !== "annule" && new Date(v.debut).getTime() < Date.now()).length;
  const honoraires = b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined);
  const habitable = b.type !== "terrain" && b.type !== "parking";
  const finMandatDans = b.mandat?.fin ? Math.ceil((new Date(b.mandat.fin + "T12:00:00").getTime() - Date.now()) / 86400000) : undefined;

  const setStatut = (s: BienStatut) => {
    update({ statut: s, ...(s === "en_vente" && !b.dateMiseEnVente ? { dateMiseEnVente: today() } : {}) });
    setStatutOpen(false);
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-center justify-between gap-2 animate-fade-up">
        <Link href="/biens" className="btn-ghost btn-sm -ml-2 text-muted">
          <ArrowLeft size={15} /> Biens
        </Link>
        <div className="flex items-center gap-2 text-xs text-muted">
          {b.ref && <span className="font-mono">{b.ref}</span>}
          <span>Mis à jour {dateCourte(b.updatedAt)}</span>
        </div>
      </div>

      <div className="animate-fade-up">
        <Gallery
          photos={b.photos ?? []}
          type={b.type}
          alt={b.titre}
          overlay={
            <div className="absolute left-3 top-3 flex gap-1.5">
              <span className="rounded-full bg-surface/95 shadow-sm">
                <Badge tone={st.tone}>{st.label}</Badge>
              </span>
              {b.mandat?.type === "exclusif" && <span className="rounded-full bg-ink/80 px-2 h-[22px] inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-white">Exclusif</span>}
            </div>
          }
          ajout={<AjoutPhotos photos={b.photos ?? []} onAdd={(p) => update({ photos: p })} />}
        />
      </div>

      {/* Titre, adresse, prix */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 animate-fade-up">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{TYPE_BIEN[b.type]}{b.quartier ? ` · ${b.quartier}` : ""}</div>
          <h1 className="h-title mt-1 leading-tight">{b.titre}</h1>
          {b.adresse && (
            <a href={mapsHref(adresseComplete(b))} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-start gap-1.5 text-sm text-muted hover:text-accent">
              <MapPin size={15} className="mt-0.5 shrink-0" /> {adresseComplete(b)}
            </a>
          )}
        </div>
        <div className="sm:text-right shrink-0">
          <div className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight">{b.prix ? eur(b.prix) : "Prix à définir"}</div>
          <div className="text-sm text-muted">
            {pm2 ? `${eur(pm2)} / m²` : ""}
            {b.prix && b.honorairesCharge ? ` · honoraires à la charge ${b.honorairesCharge === "acquereur" ? "de l'acquéreur" : "du vendeur"}` : ""}
          </div>
        </div>
      </header>

      {/* Actions */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 animate-fade-up [&>*]:min-w-0">
        <button className="btn-primary shrink-0 col-span-2" onClick={() => setRdvForm({ bienId: b.id, type: "visite", jour: today() })}>
          <CalendarPlus size={16} /> Planifier une visite
        </button>
        <button className="btn-secondary shrink-0" onClick={() => setEnvoi(true)}>
          <Send size={16} /> Envoyer la fiche
        </button>
        <Link href={`/biens/${b.id}/offre`} className="btn-secondary shrink-0">
          <FileSignature size={16} /> <span className="sm:hidden">Offre d&apos;achat</span>
          <span className="hidden sm:inline">Rédiger une offre d&apos;achat</span>
        </Link>
        {(b.statut === "sous_offre" || b.statut === "compromis" || (b as BienActes).actes?.some((a) => a.kind === "offre" && a.statut === "signe")) && (
          <Link href={`/biens/${b.id}/notaire`} className="btn-secondary shrink-0">
            <Landmark size={16} /> <span className="sm:hidden">Notaire</span>
            <span className="hidden sm:inline">Transmettre au notaire</span>
          </Link>
        )}
        <Link href={`/biens/${b.id}/mandat`} className="btn-secondary shrink-0">
          <FileText size={16} /> <span className="sm:hidden">Mandat</span>
          <span className="hidden sm:inline">Rédiger le mandat de vente</span>
        </Link>
        <button className="btn-secondary shrink-0" onClick={() => setStatutOpen(true)}>
          <Tag size={16} /> Statut <ChevronDown size={14} className="-ml-1 text-muted" />
        </button>
        <button className="btn-secondary shrink-0" onClick={() => setRapport(true)}>
          <FileText size={16} /> Rapport vendeur
        </button>
        <button className="btn-secondary shrink-0" onClick={() => setEditing("")}>
          <Pencil size={16} /> Modifier
        </button>
      </div>

      {/* Chiffres clés */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 animate-fade-up">
        <KeyFig label="Surface" value={b.surface ? m2(b.surface) : "—"} hint={b.surfaceTerrain ? `Terrain ${m2(b.surfaceTerrain)}` : b.type === "appartement" ? "Carrez" : undefined} />
        <KeyFig label="Pièces" value={b.pieces != null ? String(b.pieces) : "—"} hint={b.chambres ? `dont ${b.chambres} chambre${b.chambres > 1 ? "s" : ""}` : undefined} />
        <KeyFig label="En vente depuis" value={jours != null ? `${jours} j` : "—"} hint={b.dateMiseEnVente ? `le ${dateCourte(b.dateMiseEnVente)}` : undefined} />
        <KeyFig label="Visites" value={String(nbVisitesFaites)} hint={visites.length > nbVisitesFaites ? `${visites.filter((v) => v.statut === "prevu" && new Date(v.debut).getTime() >= Date.now()).length} à venir` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-5 min-w-0">
          {manquants.length > 0 && (
            <section className="rounded-2xl border border-warn/25 bg-warn/[0.06] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="h-section inline-flex items-center gap-2">
                  <TriangleAlert size={16} className="text-warn" /> À compléter
                  <span className="text-xs font-normal text-muted">{manquants.length} élément{manquants.length > 1 ? "s" : ""}</span>
                </h2>
                <button className="btn-ghost btn-sm" onClick={() => setEditing(SECTION_DE[manquants[0].key] ?? "")}>
                  Compléter
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {manquants.map((m) => (
                  <button key={m.key} onClick={() => setEditing(SECTION_DE[m.key] ?? "")} className="chip !h-7 hover:!border-warn/40 hover:!text-warn transition">
                    {m.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <AcquereursCompatibles bien={b} matches={matches} />

          <DocumentsBien bien={b as BienActes} />

          <Card
            title={`Visites${visites.length ? ` (${visites.length})` : ""}`}
            action={
              <button className="btn-ghost btn-sm" onClick={() => setRdvForm({ bienId: b.id, type: "visite", jour: today() })}>
                <CalendarPlus size={14} /> Planifier
              </button>
            }
            pad={false}
          >
            {!visites.length ? (
              <Empty title="Aucune visite pour l'instant" text="Planifiez la première visite : elle apparaîtra ici avec son compte rendu." />
            ) : (
              <ul className="divide-y divide-line">
                {visites.map((v) => (
                  <VisiteRow key={v.id} v={v} contacts={(v.contactIds ?? []).map((x) => contactMap.get(x)).filter(Boolean) as Contact[]} onCr={() => setCrId(v.id)} onEdit={() => setRdvForm(v)} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Caractéristiques">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Info label="Type" value={TYPE_BIEN[b.type]} />
              <Info label={b.type === "appartement" ? "Surface Carrez" : "Surface"} value={b.surface ? m2(b.surface) : undefined} />
              <Info label="Terrain" value={b.surfaceTerrain ? m2(b.surfaceTerrain) : undefined} />
              {habitable && <Info label="Pièces" value={b.pieces} />}
              {habitable && <Info label="Chambres" value={b.chambres} />}
              <Info label="Étage" value={b.etage != null ? `${b.etage === 0 ? "Rez-de-chaussée" : `${b.etage}e`}${b.nbEtages ? ` sur ${b.nbEtages}` : ""}` : undefined} />
              <Info label="Ascenseur" value={b.ascenseur == null ? undefined : b.ascenseur ? "Oui" : "Non"} />
              <Info label="Extérieur" value={b.exterieur} />
              <Info label="Stationnement" value={b.parking} />
              <Info label="Cave" value={b.cave == null ? undefined : b.cave ? "Oui" : "Non"} />
              <Info label="Année de construction" value={b.anneeConstruction} />
              <Info label="Chauffage" value={b.chauffage} />
              <Info
                label="DPE · GES"
                value={
                  b.dpe || b.ges ? (
                    <span className="inline-flex items-center gap-1.5">
                      <DpeBadge value={b.dpe} />
                      {b.dpe && b.ges && <span className="text-muted">·</span>}
                      <DpeBadge value={b.ges} />
                    </span>
                  ) : undefined
                }
              />
              <Info label="Lots de copropriété" value={b.lotsCopro} />
              <Info label="Charges de copropriété" value={b.chargesAnnuelles ? `${eur(b.chargesAnnuelles)} / an (${eur(b.chargesAnnuelles / 12)} / mois)` : undefined} />
              <Info label="Taxe foncière" value={b.taxeFonciere ? `${eur(b.taxeFonciere)} / an` : undefined} />
            </dl>
          </Card>

          {(b.description || b.pointsForts?.length) && (
            <Card title="Description">
              {b.pointsForts && b.pointsForts.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {b.pointsForts.map((p) => (
                    <span key={p} className="chip !h-7 !bg-accent/10 !text-accent !border-accent/20">
                      {p}
                    </span>
                  ))}
                </div>
              )}
              {b.description && <p className="text-sm leading-relaxed whitespace-pre-line">{b.description}</p>}
            </Card>
          )}
        </div>

        {/* Colonne latérale */}
        <aside className="space-y-5">
          <Card title="Prix & mandat" action={b.mandat?.numero || b.mandat?.debut ? <LienAvenant bienId={b.id} court /> : undefined}>
            <dl>
              <Info label="Prix affiché" value={b.prix ? eur(b.prix) : undefined} />
              <Info label="Net vendeur" value={b.netVendeur ? eur(b.netVendeur) : undefined} />
              <Info label="Honoraires" value={honoraires != null ? `${eur(honoraires)}${b.netVendeur ? ` (${((honoraires / b.netVendeur) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %)` : ""}` : undefined} />
              <Info label="Honoraires à la charge" value={b.honorairesCharge ? (b.honorairesCharge === "acquereur" ? "de l'acquéreur" : "du vendeur") : undefined} />
              <Info label="Mandat" value={[b.mandat?.type ? MANDAT_LABEL[b.mandat.type] : "", b.mandat?.numero ? `n° ${b.mandat.numero}` : ""].filter(Boolean).join(" · ") || undefined} />
              <Info label="Signé le" value={b.mandat?.debut ? dateMandat(b.mandat.debut) : undefined} />
              <Info
                label="Fin du mandat"
                value={
                  b.mandat?.fin ? (
                    <span className={cx(finMandatDans != null && finMandatDans <= 30 && "text-warn font-semibold")}>
                      {dateMandat(b.mandat.fin)}
                      {finMandatDans != null && finMandatDans >= 0 && finMandatDans <= 30 ? ` (dans ${finMandatDans} j)` : finMandatDans != null && finMandatDans < 0 ? " (échu)" : ""}
                    </span>
                  ) : undefined
                }
              />
            </dl>
          </Card>

          <VendeurBlock vendeurs={vendeurs} onAdd={() => setEditing("vendeur")} />

          <DossierBlock
            dossier={dossierDe(b)}
            regles={reglesDe(b)}
            onBasculer={(texte) => update({ pointsRegles: basculerPoint(reglesDe(b), texte) } as Partial<Bien>)}
            actionPoint={(texte) => (pointAvenant(texte) && STATUTS_ACTIFS.includes(b.statut) ? <LienAvenant bienId={b.id} /> : null)}
          />

          {(b.driveUrl || b.annonceUrl) && (
            <Card title="Liens">
              <div className="space-y-2">
                {b.driveUrl && (
                  <a href={b.driveUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full !justify-start">
                    <FolderOpen size={16} /> Dossier Drive <ExternalLink size={13} className="ml-auto text-muted" />
                  </a>
                )}
                {b.annonceUrl && (
                  <a href={b.annonceUrl} target="_blank" rel="noreferrer" className="btn-secondary w-full !justify-start">
                    <ExternalLink size={16} /> Voir l&apos;annonce <ExternalLink size={13} className="ml-auto text-muted" />
                  </a>
                )}
              </div>
            </Card>
          )}

          {b.notes && (
            <Card title="Notes internes">
              <p className="text-sm text-muted whitespace-pre-line">{b.notes}</p>
            </Card>
          )}

          <div className="text-center">
            <button
              className={cx("btn-ghost btn-sm", delConfirm ? "text-danger" : "text-muted")}
              onClick={() => {
                if (!delConfirm) {
                  setDelConfirm(true);
                  setTimeout(() => setDelConfirm(false), 4000);
                  return;
                }
                remove("biens", b.id);
                router.replace("/biens");
              }}
            >
              <Trash2 size={14} /> {delConfirm ? "Confirmer la suppression" : "Supprimer ce bien"}
            </button>
          </div>
        </aside>
      </div>

      {/* Feuilles */}
      <Sheet open={statutOpen} onClose={() => setStatutOpen(false)} title="Changer le statut">
        <div className="space-y-1.5">
          {STATUTS.map((s) => (
            <button key={s} onClick={() => setStatut(s)} className={cx("flex w-full items-center justify-between rounded-xl border px-4 h-12 text-sm transition", b.statut === s ? "border-accent bg-accent/5" : "border-line hover:bg-surface-2")}>
              <Badge tone={STATUT_BIEN[s].tone}>{STATUT_BIEN[s].label}</Badge>
              {b.statut === s && <span className="text-xs text-accent font-medium">Actuel</span>}
            </button>
          ))}
        </div>
      </Sheet>
      <RdvForm open={!!rdvForm} onClose={() => setRdvForm(null)} initial={rdvForm ?? undefined} />
      <CompteRenduSheet rdv={visites.find((v) => v.id === crId)} onClose={() => setCrId(undefined)} />
      <EnvoyerFiche open={envoi} onClose={() => setEnvoi(false)} bien={b} vendeurs={vendeurs} />
      <RapportVendeur open={rapport} onClose={() => setRapport(false)} bien={b} visites={visites} vendeurs={vendeurs} nbCompatibles={matches.length} nbProposes={nbProposes} />
    </div>
  );
}

function KeyFig({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card px-3.5 py-3 sm:px-4">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 font-serif text-xl sm:text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="text-[11px] text-muted truncate">{hint}</div>}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-line/70 last:border-0 text-sm">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function VisiteRow({ v, contacts, onCr, onEdit }: { v: RdvExt; contacts: Contact[]; onCr: () => void; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const aFaire = crAFaire(v);
  const futur = new Date(v.debut).getTime() > Date.now();
  const suite = v.crDetail?.suite;
  return (
    <li className={cx("px-4 sm:px-5 py-3.5", v.statut === "annule" && "opacity-55")}>
      <div className="flex items-start gap-3">
        <div className="w-12 shrink-0 text-center rounded-xl bg-surface-2 py-1.5">
          <div className="text-[10px] uppercase text-muted">{new Date(v.debut).toLocaleDateString("fr-FR", { month: "short", timeZone: "Europe/Paris" })}</div>
          <div className="font-serif text-lg font-semibold leading-none">{new Date(v.debut).toLocaleDateString("fr-FR", { day: "numeric", timeZone: "Europe/Paris" })}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{contacts.map((c) => nomComplet(c)).join(", ") || "Visiteur non renseigné"}</span>
            {futur && v.statut !== "annule" && <Badge tone="info">À venir</Badge>}
            {v.statut === "annule" && <Badge>Annulée</Badge>}
            {aFaire && <Badge tone="warn">Compte rendu à faire</Badge>}
          </div>
          <div className="text-xs text-muted">
            {dateLongue(v.debut)} · {heure(v.debut)}
          </div>
          {(v.avisClient || suite || v.suite) && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              {v.avisClient && (
                <span className="inline-flex">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} size={13} className={n <= v.avisClient! ? "fill-gold text-gold" : "text-line"} />
                  ))}
                </span>
              )}
              {suite ? <Badge tone={SUITE[suite].tone}>{SUITE[suite].label}</Badge> : v.suite ? <Badge>{v.suite}</Badge> : null}
            </div>
          )}
          {v.compteRendu && (
            <button onClick={() => setOpen(!open)} className="mt-1.5 block text-left">
              <p className={cx("text-xs text-muted whitespace-pre-line", !open && "line-clamp-2")}>{v.compteRendu}</p>
            </button>
          )}
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {!futur && v.statut !== "annule" && (
              <button onClick={onCr} className={cx("btn-sm btn", aFaire ? "btn-primary" : "btn-ghost !px-2")}>
                <ClipboardCheck size={14} /> {aFaire ? "Faire le compte rendu" : "Compte rendu"}
              </button>
            )}
            <button onClick={onEdit} className="btn-ghost btn-sm !px-2 text-muted">
              <Pencil size={13} /> Modifier
            </button>
            {contacts[0]?.tel && (
              <a href={telHref(contacts[0].tel)} className="btn-ghost btn-sm !px-2 text-muted">
                <Phone size={13} /> Appeler
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/** Bloc vendeur : discret et masqué par défaut (l'écran peut être vu pendant une visite). */
function VendeurBlock({ vendeurs, onAdd }: { vendeurs: Contact[]; onAdd: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <section className="rounded-2xl border border-dashed border-line bg-surface-2/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide">
          <Lock size={13} /> Vendeur · confidentiel
        </div>
        {vendeurs.length > 0 && (
          <button onClick={() => setShow(!show)} className="btn-ghost btn-sm !px-2 text-muted" aria-label={show ? "Masquer" : "Afficher"}>
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {!vendeurs.length ? (
        <button onClick={onAdd} className="mt-2 text-sm text-accent hover:underline">
          Renseigner le vendeur
        </button>
      ) : show ? (
        <ul className="mt-3 space-y-2.5 animate-fade-up">
          {vendeurs.map((v) => (
            <li key={v.id} className="flex items-center gap-2">
              <Link href={`/contacts/${v.id}`} className="min-w-0 flex-1 text-sm font-medium truncate hover:text-accent">
                {nomComplet(v)}
              </Link>
              {v.tel && (
                <a href={telHref(v.tel)} className="grid place-items-center size-9 rounded-lg text-muted hover:bg-surface hover:text-accent" aria-label="Appeler">
                  <Phone size={15} />
                </a>
              )}
              {v.email && (
                <a href={mailHref(v.email)} className="grid place-items-center size-9 rounded-lg text-muted hover:bg-surface hover:text-accent" aria-label="Écrire">
                  <Mail size={15} />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <button onClick={() => setShow(true)} className="mt-2 text-sm text-muted">
          {vendeurs.length} contact{vendeurs.length > 1 ? "s" : ""} · toucher pour afficher
        </button>
      )}
    </section>
  );
}
