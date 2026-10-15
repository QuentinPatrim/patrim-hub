"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronDown, FileSignature, Mail, PenLine, RotateCcw, Send, TriangleAlert, UserRound } from "lucide-react";
import { Badge, Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip } from "@/components/contacts/bits";
import { adresseComplete } from "@/components/biens/utils";
import { enLettres } from "@/components/documents/charte";
import {
  CHAMPS,
  designationDepuisBien,
  ecrireOffre,
  effacerOffre,
  enregistrerParties,
  lireOffre,
  mailDemande,
  manquants,
  partieDepuisContact,
  type ContactEtatCivil,
  type Motif,
  type Offre,
  type Partie,
} from "@/components/offre/offre";
import { useCollection, useDoc } from "@/lib/store";
import { eur, nomComplet, today } from "@/lib/format";
import type { Bien } from "@/lib/types";

/* ============================================================
   Rédiger une offre d'achat, en deux temps :
   1. Les parties : on voit ce qui manque (pièce d'identité,
      adresse, naissance, coordonnées de signature) et on peut
      préparer le mail de demande, ou passer directement à…
   2. La rédaction : quelques champs, puis le PDF brandé PATRIM
      prêt à déposer sur ICSIGN.
   ============================================================ */

function offreInitiale(b: Bien, vendeurs: Partie[]): Offre {
  const honoraires = b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined);
  return {
    bienId: b.id,
    acquereurs: [],
    vendeurs,
    designation: designationDepuisBien(b),
    adresseBien: adresseComplete(b),
    mandatNumero: b.mandat?.numero,
    prix: b.prix,
    honoraires,
    charge: b.honorairesCharge ?? "acquereur",
    financement: "pret",
    conditionSuspensive: true,
    motif: "pret",
    validiteJours: 7,
    date: today(),
    maj: new Date().toISOString(),
  };
}

export default function OffreAchatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc: b } = useDoc("biens", id);
  const { items: contactsRaw } = useCollection("contacts");
  const contacts = contactsRaw as ContactEtatCivil[];
  const [o, setO] = useState<Offre | null>(null);
  const [etape, setEtape] = useState<"parties" | "redaction">("parties");
  const [demande, setDemande] = useState<{ p: Partie; role: "acquereur" | "vendeur" } | null>(null);
  const [waited, setWaited] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Brouillon existant, sinon offre pré-remplie avec le bien et ses vendeurs.
  useEffect(() => {
    if (!b || init.current) return;
    init.current = true;
    const existant = lireOffre(b.id);
    if (existant) {
      setO(existant);
      if (existant.acquereurs.length) setEtape("redaction");
    } else {
      const vend = (b.vendeurIds ?? []).map((v) => contacts.find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];
      setO(offreInitiale(b, vend.map(partieDepuisContact)));
    }
  }, [b, contacts]);

  useEffect(() => {
    if (o) ecrireOffre(o);
  }, [o]);

  const set = (patch: Partial<Offre>) => setO((x) => (x ? { ...x, ...patch } : x));

  /** Choix des contacts : garde ce qui a déjà été saisi pour les parties conservées. */
  const choisir = (role: "acquereurs" | "vendeurs", ids: string[]) => {
    if (!o) return;
    const avant = o[role];
    set({ [role]: ids.map((cid) => avant.find((p) => p.contactId === cid) ?? partieDepuisContact(contacts.find((c) => c.id === cid)!)) });
  };
  const setPartie = (role: "acquereurs" | "vendeurs", i: number, patch: Partial<Partie>) => {
    if (!o) return;
    set({ [role]: o[role].map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  };

  const totalManquants = useMemo(() => (o ? [...o.acquereurs, ...o.vendeurs].reduce((n, p) => n + manquants(p).length, 0) : 0), [o]);

  if (!b || !o) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const net = o.prix != null && o.honoraires != null ? o.prix - o.honoraires : undefined;
  const voirPdf = () => {
    enregistrerParties([...o.acquereurs, ...o.vendeurs], contacts);
    ecrireOffre(o);
    router.push(`/imprimer/offre/${b.id}`);
  };

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Offre d'achat" subtitle={b.titre} />

      {/* Étapes */}
      <div className="grid grid-cols-2 gap-2 animate-fade-up">
        <EtapeBtn n={1} actif={etape === "parties"} fait={etape === "redaction"} onClick={() => setEtape("parties")}>
          Les parties
        </EtapeBtn>
        <EtapeBtn n={2} actif={etape === "redaction"} onClick={() => setEtape("redaction")} disabled={!o.acquereurs.length}>
          Rédaction
        </EtapeBtn>
      </div>

      {etape === "parties" ? (
        <>
          <Card title="Acquéreur">
            <ContactPicker value={o.acquereurs.map((p) => p.contactId!).filter(Boolean)} onChange={(ids) => choisir("acquereurs", ids)} role="acquereur" max={2} placeholder="Rechercher l'acquéreur…" />
            <p className="mt-2 text-xs text-muted">Deux acquéreurs au plus (couple, co-acquéreurs).</p>
            <Etat parties={o.acquereurs} onDemande={(p) => setDemande({ p, role: "acquereur" })} />
          </Card>

          <Card title="Vendeur">
            <ContactPicker value={o.vendeurs.map((p) => p.contactId!).filter(Boolean)} onChange={(ids) => choisir("vendeurs", ids)} role="vendeur" max={4} placeholder="Rechercher le vendeur…" />
            <Etat parties={o.vendeurs} onDemande={(p) => setDemande({ p, role: "vendeur" })} />
          </Card>

          <div className="card card-pad space-y-3 animate-fade-up">
            {totalManquants > 0 ? (
              <p className="text-sm">
                <span className="font-semibold">Il manque {totalManquants} information{totalManquants > 1 ? "s" : ""}.</span>{" "}
                <span className="text-muted">Préparez le mail de demande (bouton « Demander » sous chaque personne), ou complétez vous-même à l&apos;étape suivante.</span>
              </p>
            ) : o.acquereurs.length ? (
              <p className="text-sm text-ok font-medium inline-flex items-center gap-1.5">
                <Check size={16} /> Tout est là pour rédiger l&apos;offre.
              </p>
            ) : (
              <p className="text-sm text-muted">Choisissez au moins un acquéreur pour commencer.</p>
            )}
            <button className="btn-primary w-full !h-12" disabled={!o.acquereurs.length} onClick={() => setEtape("redaction")}>
              <PenLine size={16} /> Rédiger l&apos;offre maintenant <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          {o.acquereurs.map((p, i) => (
            <PartieForm key={p.contactId ?? i} titre={o.acquereurs.length > 1 ? `Acquéreur ${i + 1}` : "Acquéreur"} p={p} onChange={(x) => setPartie("acquereurs", i, x)} />
          ))}
          {o.vendeurs.map((p, i) => (
            <PartieForm key={p.contactId ?? i} titre={o.vendeurs.length > 1 ? `Vendeur ${i + 1}` : "Vendeur"} p={p} onChange={(x) => setPartie("vendeurs", i, x)} />
          ))}
          {!o.vendeurs.length && (
            <button className="card card-pad w-full text-left text-sm text-muted" onClick={() => setEtape("parties")}>
              Aucun vendeur choisi : <span className="text-accent font-medium">l&apos;ajouter</span>
            </button>
          )}

          <Card title="Le bien">
            <div className="space-y-3">
              <Field label="Désignation" hint="Remplacez les [À compléter] : composition, lots, bien loué, mobilier…">
                <textarea className="input min-h-[130px] text-sm" value={o.designation} onChange={(e) => set({ designation: e.target.value })} />
              </Field>
              <Field label="Adresse du bien">
                <input className="input" value={o.adresseBien} onChange={(e) => set({ adresseBien: e.target.value })} />
              </Field>
              <Field label="Mandat de vente n°">
                <input className="input" inputMode="numeric" value={o.mandatNumero ?? ""} onChange={(e) => set({ mandatNumero: e.target.value })} />
              </Field>
            </div>
          </Card>

          <Card title="Prix">
            <div className="space-y-3">
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Prix offert (honoraires inclus)">
                  <NumInput value={o.prix} onChange={(v) => set({ prix: v })} suffix="€" />
                </Field>
                <Field label="Honoraires">
                  <NumInput value={o.honoraires} onChange={(v) => set({ honoraires: v })} suffix="€" />
                </Field>
              </div>
              <div>
                <span className="label">Honoraires à la charge</span>
                <div className="flex gap-2">
                  <PickChip active={o.charge === "acquereur"} onClick={() => set({ charge: "acquereur" })}>
                    de l&apos;acquéreur
                  </PickChip>
                  <PickChip active={o.charge === "vendeur"} onClick={() => set({ charge: "vendeur" })}>
                    du vendeur
                  </PickChip>
                </div>
              </div>
              <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Net vendeur</span>
                  <span className="font-semibold">{net != null ? eur(net) : "—"}</span>
                </div>
                {o.prix ? <div className="mt-1 text-xs text-muted first-letter:uppercase">{enLettres(o.prix)} euros</div> : null}
              </div>
            </div>
          </Card>

          <Card title="Financement et condition suspensive">
            <div className="space-y-3">
              <div className="flex gap-2">
                <PickChip active={o.financement === "pret"} onClick={() => set({ financement: "pret", conditionSuspensive: true, motif: "pret" })}>
                  Avec un prêt
                </PickChip>
                <PickChip active={o.financement === "comptant"} onClick={() => set({ financement: "comptant", ...(o.motif === "pret" ? { conditionSuspensive: false } : {}) })}>
                  Sans prêt
                </PickChip>
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Apport personnel">
                  <NumInput value={o.apport} onChange={(v) => set({ apport: v })} suffix="€" placeholder="À compléter" />
                </Field>
                {o.financement === "pret" && (
                  <Field label="Montant du prêt">
                    <NumInput value={o.montantPret} onChange={(v) => set({ montantPret: v })} suffix="€" placeholder={o.prix && o.apport != null ? (o.prix - o.apport).toLocaleString("fr-FR") : "Le solde"} />
                  </Field>
                )}
                {o.financement === "pret" && (
                  <Field label="Durée (facultatif)">
                    <NumInput value={o.dureePret} onChange={(v) => set({ dureePret: v })} suffix="ans" />
                  </Field>
                )}
                {o.financement === "pret" && (
                  <Field label="Taux maximum (facultatif)">
                    <TauxInput value={o.tauxMax} onChange={(v) => set({ tauxMax: v })} />
                  </Field>
                )}
              </div>

              <div className="rounded-xl border border-line p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 size-5 accent-[#6c191e]" checked={o.conditionSuspensive} onChange={(e) => set({ conditionSuspensive: e.target.checked })} />
                  <span>
                    <span className="block text-sm font-medium">Offre sous condition suspensive</span>
                    <span className="block text-xs text-muted">L&apos;offre tombe si la condition ne se réalise pas.</span>
                  </span>
                </label>
                {o.conditionSuspensive && (
                  <div className="mt-3 space-y-3 animate-fade-up">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["pret", "Obtention du prêt"],
                          ["vente", "Vente d'un autre bien"],
                          ["autre", "Autre motif"],
                        ] as [Motif, string][]
                      ).map(([m, l]) => (
                        <PickChip key={m} active={o.motif === m} onClick={() => set({ motif: m })}>
                          {l}
                        </PickChip>
                      ))}
                    </div>
                    <Field label={o.motif === "pret" ? "Précision (facultatif)" : o.motif === "vente" ? "Bien à vendre" : "Motif de la condition"}>
                      <textarea
                        className="input min-h-[70px] text-sm"
                        value={o.motifTexte ?? ""}
                        onChange={(e) => set({ motifTexte: e.target.value })}
                        placeholder={o.motif === "pret" ? "Ex. accord de prêt à obtenir au plus tard le …" : o.motif === "vente" ? "Ex. appartement situé … à Toulouse" : "Ex. obtention d'un permis de construire…"}
                      />
                    </Field>
                  </div>
                )}
              </div>
              {o.financement === "pret" && !o.conditionSuspensive && (
                <p className="flex gap-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" /> Achat avec prêt sans condition suspensive : à vérifier avec l&apos;acquéreur avant de signer.
                </p>
              )}
            </div>
          </Card>

          <Card title="Durée et conditions">
            <div className="space-y-3">
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Validité de l'offre">
                  <NumInput value={o.validiteJours} onChange={(v) => set({ validiteJours: v ?? 7 })} suffix="jours" />
                </Field>
                <Field label="Date de l'offre">
                  <input type="date" className="input" value={o.date} onChange={(e) => set({ date: e.target.value || today() })} />
                </Field>
              </div>
              <Field label="Conditions particulières (facultatif)">
                <textarea
                  className="input min-h-[90px] text-sm"
                  value={o.conditionsParticulieres ?? ""}
                  onChange={(e) => set({ conditionsParticulieres: e.target.value })}
                  placeholder="Ex. bien vendu loué : l'acquéreur reprend le bail en cours (loyer de … € par mois charges comprises)."
                />
              </Field>
            </div>
          </Card>

          <div className="card card-pad space-y-2">
            <button className="btn-primary w-full !h-12" onClick={voirPdf}>
              <FileSignature size={17} /> Voir l&apos;offre et créer le PDF
            </button>
            {totalManquants > 0 && <p className="text-center text-xs text-warn">{totalManquants} information{totalManquants > 1 ? "s" : ""} manquante{totalManquants > 1 ? "s" : ""} : elles apparaîtront en [À compléter].</p>}
            <button
              className="btn-ghost btn-sm w-full text-muted"
              onClick={() => {
                effacerOffre(b.id);
                setEtape("parties");
                const vend = (b.vendeurIds ?? []).map((v) => contacts.find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];
                setO(offreInitiale(b, vend.map(partieDepuisContact)));
              }}
            >
              <RotateCcw size={13} /> Recommencer une offre vierge
            </button>
          </div>
        </>
      )}

      {demande && (
        <BrouillonMail
          open
          onClose={() => setDemande(null)}
          titre={`Demander à ${nomComplet(demande.p)}`}
          to={demande.p.email}
          tel={demande.p.tel}
          {...mailDemande(demande.p, b, demande.role, o.financement === "pret")}
        />
      )}
    </div>
  );
}

function EtapeBtn({ n, actif, fait, disabled, onClick, children }: { n: number; actif: boolean; fait?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx("flex h-12 items-center gap-2.5 rounded-2xl border px-3 text-sm font-medium transition disabled:opacity-50", actif ? "border-accent bg-accent/5 text-accent" : "border-line bg-surface text-muted")}
    >
      <span className={cx("grid size-6 place-items-center rounded-full text-xs font-semibold", actif ? "bg-brand text-white" : fait ? "bg-ok/15 text-ok" : "bg-surface-2")}>{fait ? <Check size={13} /> : n}</span>
      {children}
    </button>
  );
}

/** Ce qui manque pour chaque personne, avec le bouton « Demander ». */
function Etat({ parties, onDemande }: { parties: Partie[]; onDemande: (p: Partie) => void }) {
  if (!parties.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {parties.map((p) => {
        const m = manquants(p);
        return (
          <li key={p.contactId} className="rounded-xl bg-surface-2/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{nomComplet(p)}</span>
              {m.length ? (
                <button className="btn-secondary btn-sm !h-9 shrink-0" onClick={() => onDemande(p)}>
                  <Mail size={14} /> Demander
                </button>
              ) : (
                <Badge tone="ok">
                  <Check size={12} /> Complet
                </Badge>
              )}
            </div>
            {m.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {m.map((x) => (
                  <span key={x.key} className="chip !h-6 !border-warn/30 !text-warn !bg-warn/5">
                    {x.label}
                  </span>
                ))}
                <span className="chip !h-6">Pièce d&apos;identité</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** État civil et coordonnées de signature d'une partie. */
function PartieForm({ titre, p, onChange }: { titre: string; p: Partie; onChange: (x: Partial<Partie>) => void }) {
  const m = manquants(p);
  const [open, setOpen] = useState(m.length > 0);
  return (
    <section className="card">
      <button className="flex w-full items-center gap-3 px-4 sm:px-5 py-4 text-left" onClick={() => setOpen(!open)}>
        <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-muted">
          <UserRound size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{titre}</span>
          <span className="block font-medium truncate">{nomComplet(p)}</span>
        </span>
        {m.length ? <Badge tone="warn">{m.length} à compléter</Badge> : <Badge tone="ok">Complet</Badge>}
        <ChevronDown size={16} className={cx("text-muted transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 space-y-3 animate-fade-up">
          <div className="flex gap-2">
            {(["Mme", "M."] as const).map((c) => (
              <PickChip key={c} active={p.civilite === c} onClick={() => onChange({ civilite: c })}>
                {c === "Mme" ? "Madame" : "Monsieur"}
              </PickChip>
            ))}
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Prénom">
              <input className="input" value={p.prenom ?? ""} onChange={(e) => onChange({ prenom: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Nom">
              <input className="input" value={p.nom ?? ""} onChange={(e) => onChange({ nom: e.target.value })} autoComplete="off" />
            </Field>
            <Field label="Date de naissance">
              <input type="date" className="input" value={p.dateNaissance ?? ""} onChange={(e) => onChange({ dateNaissance: e.target.value })} />
            </Field>
            <Field label="Lieu de naissance">
              <input className="input" value={p.lieuNaissance ?? ""} onChange={(e) => onChange({ lieuNaissance: e.target.value })} placeholder="Ville (dépt)" />
            </Field>
          </div>
          <Field label="Adresse (lieu de résidence)">
            <input className="input" value={p.adresse ?? ""} onChange={(e) => onChange({ adresse: e.target.value })} placeholder="N°, rue, code postal, ville" />
          </Field>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="E-mail (signature)">
              <input className="input" inputMode="email" value={p.email ?? ""} onChange={(e) => onChange({ email: e.target.value })} />
            </Field>
            <Field label="Portable (signature)">
              <input className="input" inputMode="tel" value={p.tel ?? ""} onChange={(e) => onChange({ tel: e.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted inline-flex items-center gap-1.5">
            <Send size={11} /> Enregistré aussi dans la fiche contact. {CHAMPS.length - m.length}/{CHAMPS.length} renseignés.
          </p>
        </div>
      )}
    </section>
  );
}

function TauxInput({ value, onChange }: { value?: number; onChange: (v?: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        className="input pr-8"
        value={txt ?? (value != null ? value.toLocaleString("fr-FR") : "")}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseFloat(e.target.value.replace(",", ".").replace(/[^\d.]/g, ""));
          onChange(isNaN(n) ? undefined : n);
        }}
        onBlur={() => setTxt(null)}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
    </div>
  );
}
