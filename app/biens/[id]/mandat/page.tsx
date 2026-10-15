"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, FileSignature, PenLine, RotateCcw } from "lucide-react";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip, Toggle } from "@/components/contacts/bits";
import { EtapeBtn, Etat, PartieForm } from "@/components/documents/Parties";
import { enLettres } from "@/components/documents/charte";
import { enregistrerParties, manquants, partieDepuisContact, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import { ACTIONS_EXCLU, CHAMPS_MANDAT, COMPTES_RENDUS_EXCLU, DIAGNOSTICS, NATURES, TYPES_MANDAT, avecExclusivite, typeMandat, ecrireMandat, effacerMandat, lireMandat, mailDemandeMandat, mandatInitial, type Mandat } from "@/components/mandat/mandat";
import { enregistrerActe } from "@/components/documents/archive";
import { useCollection, useDoc } from "@/lib/store";
import { eur, nomComplet, today } from "@/lib/format";

/* ============================================================
   Rédiger un mandat de vente (simple, semi-exclusif ou exclusif) : 1. les mandants (ce qui
   manque, mail de demande), 2. la rédaction, puis le PDF PATRIM
   prêt à déposer sur ICSIGN.
   ============================================================ */

export default function MandatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc: b } = useDoc("biens", id);
  const { items: contactsRaw } = useCollection("contacts");
  const contacts = contactsRaw as ContactEtatCivil[];
  const [m, setM] = useState<Mandat | null>(null);
  const [etape, setEtape] = useState<"parties" | "redaction">("parties");
  const [demande, setDemande] = useState<Partie | null>(null);
  const [waited, setWaited] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const vendeursDuBien = () => (b?.vendeurIds ?? []).map((v) => contacts.find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];

  useEffect(() => {
    if (!b || init.current) return;
    init.current = true;
    const existant = lireMandat(b.id);
    if (existant) {
      setM(existant);
      if (existant.mandants.length) setEtape("redaction");
    } else setM(mandatInitial(b, vendeursDuBien()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, contacts]);

  useEffect(() => {
    if (m) ecrireMandat(m);
  }, [m]);

  const set = (patch: Partial<Mandat>) => setM((x) => (x ? { ...x, ...patch } : x));
  const choisir = (ids: string[]) => {
    if (!m) return;
    set({ mandants: ids.map((cid) => m.mandants.find((p) => p.contactId === cid) ?? partieDepuisContact(contacts.find((c) => c.id === cid)!)) });
  };
  const setPartie = (i: number, patch: Partial<Partie>) => m && set({ mandants: m.mandants.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const totalManquants = useMemo(() => (m ? m.mandants.reduce((n, p) => n + manquants(p, CHAMPS_MANDAT).length, 0) : 0), [m]);

  if (!b || !m) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const prixHai = m.netVendeur != null && m.honoraires != null ? m.netVendeur + m.honoraires : undefined;
  const voirPdf = () => {
    enregistrerParties(m.mandants, contacts);
    const acteId = enregistrerActe(b.id, "mandat", m);
    ecrireMandat({ ...m, acteId });
    router.push(`/imprimer/mandat/${b.id}?acte=${acteId}`);
  };

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Mandat de vente" subtitle={b.titre} />

      <div className="grid grid-cols-2 gap-2 animate-fade-up">
        <EtapeBtn n={1} actif={etape === "parties"} fait={etape === "redaction"} onClick={() => setEtape("parties")}>
          Les vendeurs
        </EtapeBtn>
        <EtapeBtn n={2} actif={etape === "redaction"} onClick={() => setEtape("redaction")} disabled={!m.mandants.length}>
          Rédaction
        </EtapeBtn>
      </div>

      {etape === "parties" ? (
        <>
          <Card title="Vendeur(s) – le mandant">
            <ContactPicker value={m.mandants.map((p) => p.contactId!).filter(Boolean)} onChange={choisir} role="vendeur" max={4} placeholder="Rechercher le vendeur…" />
            <Etat parties={m.mandants} champs={CHAMPS_MANDAT} onDemande={setDemande} />
          </Card>
          <div className="card card-pad space-y-3 animate-fade-up">
            {totalManquants > 0 ? (
              <p className="text-sm">
                <span className="font-semibold">Il manque {totalManquants} information{totalManquants > 1 ? "s" : ""}.</span>{" "}
                <span className="text-muted">Préparez le mail de demande (bouton « Demander »), ou complétez vous-même à l&apos;étape suivante.</span>
              </p>
            ) : m.mandants.length ? (
              <p className="text-sm text-ok font-medium inline-flex items-center gap-1.5">
                <Check size={16} /> Tout est là pour rédiger le mandat.
              </p>
            ) : (
              <p className="text-sm text-muted">Choisissez au moins un vendeur pour commencer.</p>
            )}
            <button className="btn-primary w-full !h-12" disabled={!m.mandants.length} onClick={() => setEtape("redaction")}>
              <PenLine size={16} /> Rédiger le mandat maintenant <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          {m.mandants.map((p, i) => (
            <PartieForm key={p.contactId ?? i} titre={m.mandants.length > 1 ? `Vendeur ${i + 1}` : "Vendeur"} p={p} champs={CHAMPS_MANDAT} onChange={(x) => setPartie(i, x)} />
          ))}
          <Card title="Qualité des vendeurs">
            <input className="input" value={m.qualite} onChange={(e) => set({ qualite: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted">Ex. « en qualité de seuls propriétaires », « en qualité d&apos;héritiers ».</p>
          </Card>

          <Card title="Le mandat">
            <div className="mb-3 flex flex-wrap gap-2">
              {TYPES_MANDAT.map((t) => (
                <PickChip
                  key={t.v}
                  active={typeMandat(m) === t.v}
                  onClick={() =>
                    set({
                      type: t.v,
                      ...(t.v !== "simple" ? { actions: m.actions?.trim() ? m.actions : ACTIONS_EXCLU, comptesRendus: m.comptesRendus?.trim() ? m.comptesRendus : COMPTES_RENDUS_EXCLU } : {}),
                    })
                  }
                >
                  {t.label}
                </PickChip>
              ))}
            </div>
            <p className="mb-3 text-xs text-muted">
              {typeMandat(m) === "exclusif"
                ? "Le vendeur ne peut ni vendre lui-même ni passer par une autre agence pendant le mandat. Trois premiers mois irrévocables."
                : typeMandat(m) === "semi_exclusif"
                  ? "Le vendeur peut vendre lui-même à un acquéreur qu'il a trouvé, mais pas par une autre agence. Trois premiers mois irrévocables."
                  : "Le vendeur reste libre de vendre lui-même ou par d'autres agences. Premier mois irrévocable."}
            </p>
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="N° de mandat">
                <input className="input" inputMode="numeric" value={m.numero ?? ""} onChange={(e) => set({ numero: e.target.value })} />
              </Field>
              <Field label="Durée">
                <NumInput value={m.dureeMois} onChange={(v) => set({ dureeMois: v ?? 12 })} suffix="mois" />
              </Field>
              <Field label="Date du mandat">
                <input type="date" className="input" value={m.date} onChange={(e) => set({ date: e.target.value || today() })} />
              </Field>
            </div>
          </Card>

          <Card title="Le bien">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {NATURES.map((n) => (
                  <PickChip key={n} active={m.nature === n} onClick={() => set({ nature: n })}>
                    {n}
                  </PickChip>
                ))}
              </div>
              {m.nature === "Autre" && <input className="input" placeholder="Nature du bien" value={m.natureAutre ?? ""} onChange={(e) => set({ natureAutre: e.target.value })} />}
              <Field label="Adresse du bien">
                <input className="input" value={m.adresseBien} onChange={(e) => set({ adresseBien: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="N° de lot(s) (copropriété)">
                  <input className="input" value={m.lots ?? ""} onChange={(e) => set({ lots: e.target.value })} />
                </Field>
                <Field label="Surface loi Carrez">
                  <input className="input" value={m.carrez ?? ""} onChange={(e) => set({ carrez: e.target.value })} placeholder="Ex. 45,20 m²" />
                </Field>
              </div>
              <div>
                <span className="label">Le bien est vendu</span>
                <div className="flex gap-2">
                  <PickChip active={m.occupation === "libre"} onClick={() => set({ occupation: "libre" })}>
                    Libre
                  </PickChip>
                  <PickChip active={m.occupation === "loue"} onClick={() => set({ occupation: "loue" })}>
                    Loué (bail annexé)
                  </PickChip>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Prix et honoraires">
            <div className="space-y-3">
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Prix net vendeur">
                  <NumInput value={m.netVendeur} onChange={(v) => set({ netVendeur: v })} suffix="€" />
                </Field>
                <Field label="Honoraires TTC">
                  <NumInput value={m.honoraires} onChange={(v) => set({ honoraires: v })} suffix="€" />
                </Field>
              </div>
              <div>
                <span className="label">Honoraires à la charge</span>
                <div className="flex gap-2">
                  <PickChip active={m.charge === "acquereur"} onClick={() => set({ charge: "acquereur" })}>
                    de l&apos;acquéreur
                  </PickChip>
                  <PickChip active={m.charge === "vendeur"} onClick={() => set({ charge: "vendeur" })}>
                    du vendeur
                  </PickChip>
                </div>
              </div>
              <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Prix de présentation (honoraires inclus)</span>
                  <span className="font-semibold">{prixHai != null ? eur(prixHai) : "—"}</span>
                </div>
                {m.netVendeur ? <div className="mt-1 text-xs text-muted first-letter:uppercase">{enLettres(m.netVendeur)} euros net vendeur</div> : null}
              </div>
            </div>
          </Card>

          <Card title="Diagnostics déjà fournis">
            <div className="grid gap-1.5">
              {DIAGNOSTICS.map((d) => {
                const on = m.diagnostics.includes(d);
                return (
                  <label key={d} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-1 text-sm">
                    <input type="checkbox" className="size-5 accent-[#6c191e]" checked={on} onChange={() => set({ diagnostics: on ? m.diagnostics.filter((x) => x !== d) : [...m.diagnostics, d] })} />
                    {d}
                  </label>
                );
              })}
            </div>
          </Card>

          <Card title="Commercialisation et conditions">
            <div className="space-y-3">
              <Field label="Moyens de diffusion des annonces">
                <input className="input" value={m.diffusion} onChange={(e) => set({ diffusion: e.target.value })} />
              </Field>
              <Field label={avecExclusivite(m) ? "Actions de l'agence (obligatoire en exclusivité)" : "Actions particulières (facultatif)"}>
                <textarea className="input min-h-[70px] text-sm" value={m.actions ?? ""} onChange={(e) => set({ actions: e.target.value })} placeholder="Ex. visite virtuelle, reel Instagram, mise en avant sur les portails…" />
              </Field>
              <Field label={avecExclusivite(m) ? "Comptes rendus au vendeur (obligatoire en exclusivité)" : "Modalités de comptes rendus (facultatif)"}>
                <input className="input" value={m.comptesRendus ?? ""} onChange={(e) => set({ comptesRendus: e.target.value })} placeholder="Ex. point hebdomadaire par e-mail" />
              </Field>
              <Field label="Conditions particulières (facultatif)">
                <textarea className="input min-h-[70px] text-sm" value={m.conditionsParticulieres ?? ""} onChange={(e) => set({ conditionsParticulieres: e.target.value })} />
              </Field>
              <Toggle checked={m.prospection} onChange={(v) => set({ prospection: v })} label="Le vendeur accepte la prospection commerciale par e-mail" hint="Case RGPD du mandat, cochée seulement avec son accord." />
            </div>
          </Card>

          <Card title="Signataire pour PATRIM">
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="Nom">
                <input className="input" value={m.signataire.nom} onChange={(e) => set({ signataire: { ...m.signataire, nom: e.target.value } })} />
              </Field>
              <Field label="Qualité">
                <input className="input" value={m.signataire.qualite} onChange={(e) => set({ signataire: { ...m.signataire, qualite: e.target.value } })} />
              </Field>
              <Field label="E-mail (signature)">
                <input className="input" inputMode="email" value={m.signataire.email ?? ""} onChange={(e) => set({ signataire: { ...m.signataire, email: e.target.value } })} />
              </Field>
              <Field label="Portable (signature)">
                <input className="input" inputMode="tel" value={m.signataire.tel ?? ""} onChange={(e) => set({ signataire: { ...m.signataire, tel: e.target.value } })} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">Gardé sur ce téléphone pour les prochains mandats.</p>
          </Card>

          <div className="card card-pad space-y-2">
            <button className="btn-primary w-full !h-12" onClick={voirPdf}>
              <FileSignature size={17} /> Voir le mandat et créer le PDF
            </button>
            {totalManquants > 0 && <p className="text-center text-xs text-warn">{totalManquants} information{totalManquants > 1 ? "s" : ""} manquante{totalManquants > 1 ? "s" : ""} : elles apparaîtront en [À compléter].</p>}
            <button
              className="btn-ghost btn-sm w-full text-muted"
              onClick={() => {
                effacerMandat(b.id);
                setEtape("parties");
                setM(mandatInitial(b, vendeursDuBien()));
              }}
            >
              <RotateCcw size={13} /> Recommencer un mandat vierge
            </button>
          </div>
        </>
      )}

      {demande && <BrouillonMail open onClose={() => setDemande(null)} titre={`Demander à ${nomComplet(demande)}`} to={demande.email} tel={demande.tel} {...mailDemandeMandat(demande)} />}
    </div>
  );
}
