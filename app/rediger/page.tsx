"use client";

/* ============================================================
   Rédiger : tout ce qui s'imprime et se signe, au même endroit.
   - Mandat de vente : sur un bien existant, ou le bien se crée
     automatiquement à partir du mandat (nouveau dossier terrain).
   - Offre d'achat : parmi les biens existants, ou un bien nouveau
     saisi à la volée.
   - Avenant (prix, durée), bon de visite : sur un bien existant.
   - Bail vide ou meublé : sur un bien existant, ou un logement
     saisi à la volée.
   Chaque document déjà rédigé est listé ici, trié par date.
   ============================================================ */

import { Building2, ClipboardList, FileSignature, FileText, Handshake, Home, KeyRound, PenLine, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge, Card, Empty, Field, PageHeader, Sheet, Spinner, cx } from "@/components/ui";
import { ContactPicker } from "@/components/estimations/blocks";
import { Choix, Interrupteur, Nombre } from "@/components/estimations/controls";
import { actesDuBien, lienActe, resumeActe, statutActe, titreActe, type Acte, type BienActes } from "@/components/documents/rediger";
import { supprimerActe } from "@/components/documents/archive";
import { create, getAll, useCollection } from "@/lib/store";
import { apercuNumero, reserverNumero } from "@/lib/numeroMandat";
import { today } from "@/lib/format";
import type { Bien } from "@/lib/types";
import { useEspace } from "@/components/espace/espace";
import { locationSeule } from "@/components/location/bienLocation";

const LOCATION: Vue[] = ["bail", "caution", "gestion", "candidat"];
const deLocation = (v: Vue) => LOCATION.includes(v);

type Vue = "tous" | "mandat" | "offre" | "avenant" | "bon" | "bail" | "caution" | "gestion" | "candidat";

const KINDS: { v: Vue; label: string; icon: typeof Home; desc: string }[] = [
  { v: "mandat", label: "Mandat de vente", icon: FileSignature, desc: "Simple, semi-exclusif ou exclusif. Le bien peut être créé automatiquement." },
  { v: "offre", label: "Offre d'achat", icon: Handshake, desc: "Sur un bien existant, ou un bien saisi à la volée." },
  { v: "avenant", label: "Avenant", icon: PenLine, desc: "Nouveau prix, durée, sur un bien déjà en mandat." },
  { v: "bon", label: "Bon de visite", icon: FileText, desc: "Fait signer les visiteurs d'un bien en vente." },
  { v: "bail", label: "Bail de location", icon: KeyRound, desc: "Logement vide ou meublé, avec ses annexes, prêt pour ICSIGN." },
  { v: "caution", label: "Acte de cautionnement", icon: ShieldCheck, desc: "Une caution par acte (couple marié : un seul), reprend le bail du bien." },
  { v: "gestion", label: "Mandat de gestion", icon: Building2, desc: "Gestion locative d'un bien, avec les tarifs de l'agence et la rétractation." },
  { v: "candidat", label: "Fiche de renseignements", icon: ClipboardList, desc: "À remettre aux candidats locataires et à leurs garants, avec la liste des pièces." },
];

export default function RedigerPage() {
  const router = useRouter();
  const { items: tous } = useCollection("biens");
  const loc = useEspace() === "location";
  // Chaque espace ne voit que ses biens et ses documents
  const biens = useMemo(() => tous.filter((b) => locationSeule(b) === loc), [tous, loc]);
  const kinds = KINDS.filter((k) => deLocation(k.v) === loc);
  const [vue, setVue] = useState<Vue>("tous");
  const [q, setQ] = useState("");
  const [sheet, setSheet] = useState<(typeof KINDS)[number] | null>(null);
  const [aSupprimer, setASupprimer] = useState<{ bien: BienActes; acte: Acte } | null>(null);

  const biensActes = biens as BienActes[];
  const documents = useMemo(() => {
    const out: { bien: BienActes; acte: Acte }[] = [];
    for (const b of biensActes) for (const a of actesDuBien(b)) out.push({ bien: b, acte: a });
    return out.sort((x, y) => y.acte.maj.localeCompare(x.acte.maj));
  }, [biensActes]);

  const filtres = useMemo(() => {
    const s = q.trim().toLowerCase();
    return documents
      .filter(({ acte }) => (vue === "tous" ? deLocation(acte.kind as Vue) === loc : acte.kind === vue))
      .filter(({ bien, acte }) => !s || [titreActe(acte), bien.adresse, bien.ville, bien.titre].filter(Boolean).join(" ").toLowerCase().includes(s));
  }, [documents, vue, q]);

  const compteur = (v: Vue) => documents.filter((d) => (v === "tous" ? deLocation(d.acte.kind as Vue) === loc : d.acte.kind === v)).length;

  return (
    <div>
      <PageHeader title="Rédiger" subtitle={loc ? "Location : fiches candidat, baux, cautions et mandats de gestion, prêts à signer." : "Transaction : mandats, offres, avenants et bons de visite, prêts à signer."} />

      {/* Créer */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 animate-fade-up">
        {kinds.map((k) => (
          <button
            key={k.v}
            type="button"
            onClick={() => setSheet(k)}
            className="card card-pad card-hover group text-left"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">
                <k.icon size={19} />
              </span>
              <div className="min-w-0">
                <p className="font-semibold leading-tight">{k.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{k.desc}</p>
              </div>
              <Plus size={16} className="ml-auto shrink-0 text-muted group-hover:text-accent" />
            </div>
          </button>
        ))}
      </div>

      {/* Liste */}
      <div className="mt-8 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-4 flex min-w-0 gap-1.5 overflow-x-auto no-scrollbar px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {(["tous", ...kinds.map((k) => k.v)] as Vue[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVue(v)}
              className={cx("chip !h-9 shrink-0 !px-3.5", vue === v && "!border-accent !text-accent")}
            >
              {v === "tous" ? "Tous" : KINDS.find((k) => k.v === v)?.label}
              <span className="ml-1.5 tabular-nums opacity-60">{compteur(v)}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Bien, adresse, acquéreur…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        {compteur("tous") === 0 ? (
          <div className="card">
            <Empty
              icon={<FileText size={22} />}
              title="Aucun document pour le moment"
              text={loc ? "Rédigez une fiche candidat, un bail, une caution ou un mandat de gestion : tout est gardé ici, avec son statut." : "Rédigez un mandat, une offre d'achat ou un bon de visite : tout est gardé ici, avec son statut."}
            />
          </div>
        ) : filtres.length === 0 ? (
          <div className="card">
            <Empty icon={<Search size={20} />} title="Aucun document ici" text="Changez de filtre ou de recherche." />
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {filtres.map(({ bien, acte }) => {
              const st = statutActe(acte);
              return (
                <li key={acte.id} className="min-w-0">
                  <Link href={lienActe(bien.id, acte)} className="card card-pad card-hover group flex min-w-0 gap-3 sm:gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2 text-brand">
                      {acte.kind === "mandat" ? <FileSignature size={18} /> : acte.kind === "offre" ? <Handshake size={18} /> : acte.kind === "bail" ? <KeyRound size={18} /> : acte.kind === "caution" ? <ShieldCheck size={18} /> : acte.kind === "gestion" ? <Building2 size={18} /> : <PenLine size={18} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words font-semibold leading-snug group-hover:text-accent">{titreActe(acte)}</p>
                      <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted">{resumeActe(acte)}</p>
                      <p className="mt-1 truncate text-[11px] text-muted">
                        <Home size={11} className="mr-1 inline" />
                        {bien.titre || bien.adresse || "Bien sans titre"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {acte.statut !== "signe" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setASupprimer({ bien, acte });
                          }}
                          className="btn-ghost btn-sm !px-2 text-muted hover:text-danger"
                          aria-label="Supprimer ce brouillon"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sheet && <FeuilleChoixBien kind={sheet.v} label={sheet.label} onClose={() => setSheet(null)} biens={biensActes} router={router} />}

      {aSupprimer && (
        <Sheet
          open
          onClose={() => setASupprimer(null)}
          title="Supprimer ce document ?"
          footer={
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1" onClick={() => setASupprimer(null)}>
                Annuler
              </button>
              <button
                type="button"
                className="btn-primary flex-1 !bg-danger !border-danger"
                onClick={() => {
                  supprimerActe(aSupprimer.bien.id, aSupprimer.acte.id);
                  setASupprimer(null);
                }}
              >
                <Trash2 size={16} /> Supprimer
              </button>
            </div>
          }
        >
          <p className="text-sm">
            <span className="font-semibold">{titreActe(aSupprimer.acte)}</span>
            <br />
            <span className="text-muted">
              {resumeActe(aSupprimer.acte)} · {aSupprimer.bien.titre || aSupprimer.bien.adresse}
            </span>
          </p>
          <p className="mt-3 text-xs text-muted">
            Le document est retiré du bien. Le brouillon local de rédaction reste sur cet appareil et pourra être repris si vous rouvrez la rédaction. Un document signé ne peut pas être supprimé.
          </p>
        </Sheet>
      )}
    </div>
  );
}

/* ---------- Choix du bien : existant, ou création directe ---------- */

function FeuilleChoixBien({ kind, label, biens, router, onClose }: { kind: Vue; label: string; biens: BienActes[]; router: ReturnType<typeof useRouter>; onClose: () => void }) {
  // Un bail peut se faire sur n'importe quel bien, même vendu ou retiré de la vente.
  // Location : tous les biens à louer. Vente : les biens encore en cours.
  const enVente = deLocation(kind) ? biens : biens.filter((b) => b.statut !== "retire" && b.statut !== "vendu");
  const [mode, setMode] = useState<"existant" | "nouveau">(kind === "offre" ? "existant" : "existant");
  const [choisi, setChoisi] = useState<string>("");
  const [q, setQ] = useState("");

  // Nouveau bien (mandat terrain / offre sur un bien pas encore créé)
  const [adresse, setAdresse] = useState("");
  const [ville, setVille] = useState("");
  const [type, setType] = useState<"appartement" | "maison">("appartement");
  const [surface, setSurface] = useState<number>();
  const [pieces, setPieces] = useState<number>();
  const [prix, setPrix] = useState<number>();
  const [proprietaireId, setProprietaireId] = useState<string>();
  const [erreur, setErreur] = useState("");
  const [numeroAgence, setNumeroAgence] = useState<number | null>(null);
  const [numeroCharge, setNumeroCharge] = useState(false);

  const liste = useMemo(() => {
    const s = q.trim().toLowerCase();
    return enVente.filter((b) => !s || [b.titre, b.adresse, b.ville].filter(Boolean).join(" ").toLowerCase().includes(s)).slice(0, 8);
  }, [enVente, q]);

  // Aperçu du prochain numéro de mandat de l'agence (rien n'est consommé)
  useMemo(() => {
    if (kind === "mandat") void apercuNumero().then((a) => a && setNumeroAgence(a.numero));
  }, [kind]);

  const creerEtAller = async () => {
    setErreur("");
    setNumeroCharge(true);
    // Mandat : le numéro de l'agence est réservé tout de suite, personne ne peut le prendre entre-temps
    let numeroMandat: string | undefined;
    if (kind === "mandat") {
      const n = await reserverNumero();
      if (n) numeroMandat = String(n);
    }
    const nouveau: Partial<Bien> = {
      titre: [type === "appartement" ? "Appartement" : "Maison", pieces ? `${pieces} pièce${pieces > 1 ? "s" : ""}` : null, surface ? `${surface} m²` : null].filter(Boolean).join(" "),
      type,
      adresse: adresse.trim() || "[À compléter]",
      ville: ville.trim() || undefined,
      surface,
      pieces,
      prix,
      statut: "estimation",
      dateMiseEnVente: today(),
    };
    if (proprietaireId) nouveau.vendeurIds = [proprietaireId];
    if (deLocation(kind)) Object.assign(nouveau, { transaction: "location", statut: "retire", dateMiseEnVente: undefined, prix: undefined, location: { statut: "a_louer" } });
    if (numeroMandat) nouveau.mandat = { numero: numeroMandat };
    const b = create("biens", nouveau as Omit<Bien, "id" | "createdAt" | "updatedAt">);
    onClose();
    router.push(`/biens/${b.id}/${kind === "tous" ? "mandat" : kind}`);
  };

  const peutCreer = mode === "nouveau" && (adresse.trim().length > 3 || (surface ?? 0) > 0);

  return (
    <Sheet open onClose={onClose} title={`Rédiger : ${label}`}>
      <div className="space-y-4">
        <Choix
          size="lg"
          value={mode}
          onChange={(v) => v && setMode(v)}
          options={[
            { value: "existant", label: <><Home size={16} /> Bien existant</> },
            { value: "nouveau", label: <><Plus size={16} /> Créer le bien</> },
          ]}
        />

        {mode === "existant" ? (
          <div className="space-y-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Rechercher un bien…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {liste.length === 0 ? (
              <Empty icon={<Search size={18} />} title="Aucun bien trouvé" text={kind === "offre" ? "Créez le bien à la volée avec l'onglet « Créer le bien »." : undefined} />
            ) : (
              <ul className="space-y-1.5">
                {liste.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        router.push(`/biens/${b.id}/${kind === "tous" ? "mandat" : kind}`);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left transition hover:bg-surface-2"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-brand">
                        <Home size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{b.titre || b.adresse}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {[b.adresse, b.ville].filter(Boolean).join(", ")}
                          {b.mandat?.numero ? ` · mandat n°${b.mandat.numero}` : ""}
                        </p>
                      </div>
                      <PenLine size={15} className="shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              {kind === "mandat"
                ? "Le bien sera créé automatiquement avec le mandat, prêt à compléter ensuite."
                : kind === "bail"
                ? "Le logement sera créé maintenant, puis le bail se rédige dessus."
                : "Le bien sera créé maintenant, puis l'offre se rédige dessus."}
            </p>
            <Field label="Adresse du bien">
              <input className="input" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="12 rue des Amidonniers, 31000 Toulouse" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ville">
                <input className="input" value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Toulouse" />
              </Field>
              <Field label="Type">
                <Choix value={type} onChange={(v) => v && setType(v)} options={[{ value: "appartement", label: "Appartement" }, { value: "maison", label: "Maison" }]} />
              </Field>
              <Field label="Surface">
                <Nombre value={surface} onChange={setSurface} unit="m²" decimal placeholder="65" />
              </Field>
              <Field label="Pièces">
                <Nombre value={pieces} onChange={setPieces} placeholder="3" />
              </Field>
            </div>
            {kind === "offre" && (
              <Field label="Prix affiché (honoraires inclus)">
                <Nombre value={prix} onChange={setPrix} unit="€" placeholder="295 000" />
              </Field>
            )}
            {(kind === "mandat" || kind === "bail" || kind === "gestion") && (
              <div>
                <span className="label">Propriétaire (facultatif)</span>
                <ContactPicker value={proprietaireId} onChange={setProprietaireId} />
              </div>
            )}
            {erreur && <p className="text-xs text-danger">{erreur}</p>}
            {kind === "mandat" && numeroAgence && (
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
                Le mandat prendra le <span className="font-semibold text-fg">n° {numeroAgence}</span> de l'agence, réservé automatiquement à la création.
              </p>
            )}
            <button type="button" className="btn-primary !h-12 w-full" disabled={!peutCreer || numeroCharge} onClick={() => void creerEtAller()}>
              {numeroCharge ? <Spinner /> : <Plus size={16} />} Créer le bien et rédiger {label.toLowerCase()}
            </button>
            {!peutCreer && <p className="text-center text-[11px] text-muted">L'adresse ou la surface suffit pour créer.</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
