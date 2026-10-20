"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, FileSignature, PenLine, RotateCcw, TriangleAlert } from "lucide-react";
import { Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip, Toggle } from "@/components/contacts/bits";
import { EtapeBtn, Etat, PartieForm } from "@/components/documents/Parties";
import { enregistrerParties, manquants, partieDepuisContact, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import { CHAMPS_GESTION, NATURES, TARIFS, USAGES, alertesGestion, ecrireGestion, effacerGestion, gestionInitiale, lireGestion, mailDemandeGestion, ttc, type Gestion } from "@/components/gestion/gestion";
import { locationDe } from "@/components/location/bienLocation";
import { enregistrerActe, type BienActes } from "@/components/documents/archive";
import { useCollection, useDoc } from "@/lib/store";
import { nomComplet, today } from "@/lib/format";

/* ============================================================
   Rédiger un mandat de gestion locative : 1. les propriétaires (ce qui
   manque, mail de demande), 2. la rédaction, puis le PDF PATRIM
   prêt à déposer sur ICSIGN.
   ============================================================ */

const prix = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export default function GestionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc: b } = useDoc("biens", id);
  const { items: contactsRaw } = useCollection("contacts");
  const { items: tousBiens } = useCollection("biens");
  const contacts = contactsRaw as ContactEtatCivil[];
  const [g, setG] = useState<Gestion | null>(null);
  const [etape, setEtape] = useState<"parties" | "redaction">("parties");
  const [demande, setDemande] = useState<Partie | null>(null);
  const [waited, setWaited] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const proprietaires = () => (b?.vendeurIds ?? []).map((v) => contacts.find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];
  const depart = () => {
    const x = gestionInitiale(b!, proprietaires());
    const loc = locationDe(b!);
    if (loc) Object.assign(x, { vacant: loc.statut === "a_louer", meuble: loc.meuble, loyerSouhaite: loc.loyer, chargesSouhaitees: loc.charges });
    return x;
  };

  useEffect(() => {
    if (!b || init.current) return;
    init.current = true;
    const existant = lireGestion(b.id);
    if (existant) {
      setG(existant);
      if (existant.mandants.length) setEtape("redaction");
    } else setG(depart());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, contacts]);

  useEffect(() => {
    if (g) ecrireGestion(g);
  }, [g]);

  const set = (patch: Partial<Gestion>) => setG((x) => (x ? { ...x, ...patch } : x));
  const choisir = (ids: string[]) => {
    if (!g) return;
    set({ mandants: ids.map((cid) => g.mandants.find((p) => p.contactId === cid) ?? partieDepuisContact(contacts.find((c) => c.id === cid)!)) });
  };
  const setPartie = (i: number, patch: Partial<Partie>) => g && set({ mandants: g.mandants.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const totalManquants = useMemo(() => (g ? g.mandants.reduce((n, p) => n + manquants(p, CHAMPS_GESTION).length, 0) : 0), [g]);

  if (!b || !g) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const alertes = alertesGestion(g);
  // Registre de gestion, distinct de celui de la vente : numéro suivant d'après les mandats de gestion déjà rédigés dans le Hub.
  const numeros = (tousBiens as BienActes[]).flatMap((x) => (x.actes ?? []).filter((a) => a.kind === "gestion" && a.id !== g.acteId).map((a) => parseInt(String((a.data as Gestion).numero ?? ""), 10))).filter((n) => !isNaN(n));
  const prochain = numeros.length ? Math.max(...numeros) + 1 : undefined;
  const voirPdf = () => {
    enregistrerParties(g.mandants, contacts);
    const acteId = enregistrerActe(b.id, "gestion", g);
    ecrireGestion({ ...g, acteId });
    router.push(`/imprimer/gestion/${b.id}?acte=${acteId}`);
  };

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Mandat de gestion" subtitle={b.titre} />

      <div className="grid grid-cols-2 gap-2 animate-fade-up">
        <EtapeBtn n={1} actif={etape === "parties"} fait={etape === "redaction"} onClick={() => setEtape("parties")}>
          Les propriétaires
        </EtapeBtn>
        <EtapeBtn n={2} actif={etape === "redaction"} onClick={() => setEtape("redaction")} disabled={!g.mandants.length}>
          Rédaction
        </EtapeBtn>
      </div>

      {etape === "parties" ? (
        <>
          <Card title="Propriétaire(s) – le mandant">
            <ContactPicker value={g.mandants.map((p) => p.contactId!).filter(Boolean)} onChange={choisir} role="vendeur" max={4} placeholder="Rechercher le propriétaire…" />
            <Etat parties={g.mandants} champs={CHAMPS_GESTION} onDemande={setDemande} />
          </Card>
          <div className="card card-pad space-y-3 animate-fade-up">
            {totalManquants > 0 ? (
              <p className="text-sm">
                <span className="font-semibold">Il manque {totalManquants} information{totalManquants > 1 ? "s" : ""}.</span>{" "}
                <span className="text-muted">Préparez le mail de demande (bouton « Demander »), ou complétez vous-même à l&apos;étape suivante.</span>
              </p>
            ) : g.mandants.length ? (
              <p className="text-sm text-ok font-medium inline-flex items-center gap-1.5">
                <Check size={16} /> Tout est là pour rédiger le mandat.
              </p>
            ) : (
              <p className="text-sm text-muted">Choisissez au moins un propriétaire pour commencer.</p>
            )}
            <button className="btn-primary w-full !h-12" disabled={!g.mandants.length} onClick={() => setEtape("redaction")}>
              <PenLine size={16} /> Rédiger le mandat maintenant <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <>
          {g.mandants.map((p, i) => (
            <PartieForm key={p.contactId ?? i} titre={g.mandants.length > 1 ? `Propriétaire ${i + 1}` : "Propriétaire"} p={p} champs={CHAMPS_GESTION} onChange={(x) => setPartie(i, x)} />
          ))}
          <Card title="Qualité des propriétaires">
            <input className="input" value={g.qualite} onChange={(e) => set({ qualite: e.target.value })} />
            <p className="mt-1.5 text-xs text-muted">Ex. « Propriétaires du bien ci-dessous désigné », « Usufruitier ».</p>
          </Card>

          <Card title="Le mandat">
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="N° de mandat" hint={prochain ? `Suivant au registre de gestion : ${prochain}` : "Registre des mandats de gestion"}>
                <div className="flex gap-2">
                  <input className="input" inputMode="numeric" value={g.numero ?? ""} onChange={(e) => set({ numero: e.target.value })} placeholder={prochain ? String(prochain) : "Ex. 245"} />
                  {prochain && !g.numero && (
                    <button type="button" className="btn-secondary shrink-0" onClick={() => set({ numero: String(prochain) })}>
                      {prochain}
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Date du mandat">
                <input type="date" className="input" value={g.date} onChange={(e) => set({ date: e.target.value || today() })} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">Un an, renouvelable chaque année. Résiliable trois mois avant la date anniversaire.</p>
          </Card>

          <Card title="Le bien">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {NATURES.map((n) => (
                  <PickChip key={n} active={g.nature === n} onClick={() => set({ nature: n })}>
                    {n}
                  </PickChip>
                ))}
              </div>
              {g.nature === "Autre" && <input className="input" placeholder="Nature du bien" value={g.natureAutre ?? ""} onChange={(e) => set({ natureAutre: e.target.value })} />}
              <Field label="Adresse du bien">
                <input className="input" value={g.adresseBien} onChange={(e) => set({ adresseBien: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Garage n°">
                  <input className="input" value={g.garage ?? ""} onChange={(e) => set({ garage: e.target.value })} />
                </Field>
                <Field label="Cave n°">
                  <input className="input" value={g.cave ?? ""} onChange={(e) => set({ cave: e.target.value })} />
                </Field>
                <Field label="N° de lot(s)">
                  <input className="input" value={g.lots ?? ""} onChange={(e) => set({ lots: e.target.value })} />
                </Field>
                <Field label="Identifiant fiscal">
                  <input className="input" value={g.identifiantFiscal ?? ""} onChange={(e) => set({ identifiantFiscal: e.target.value })} placeholder="12 chiffres" />
                </Field>
              </div>
              <div>
                <span className="label">Usage</span>
                <div className="flex flex-wrap gap-2">
                  {USAGES.map((u) => (
                    <PickChip key={u.v} active={g.usage === u.v} onClick={() => set({ usage: u.v })}>
                      {u.label}
                    </PickChip>
                  ))}
                </div>
              </div>
              <Toggle checked={g.tic} onChange={(v) => set({ tic: v })} label="Équipé pour internet et la télévision (fibre, câble, antenne)" />
            </div>
          </Card>

          <Card title="Situation locative">
            <div className="space-y-3">
              <div className="flex gap-2">
                <PickChip active={g.vacant} onClick={() => set({ vacant: true })}>
                  Vacant, à louer
                </PickChip>
                <PickChip active={!g.vacant} onClick={() => set({ vacant: false })}>
                  Déjà loué
                </PickChip>
              </div>
              {g.vacant && (
                <>
                  <div className="flex gap-2">
                    <PickChip active={!g.meuble} onClick={() => set({ meuble: false })}>
                      Location vide
                    </PickChip>
                    <PickChip active={!!g.meuble} onClick={() => set({ meuble: true })}>
                      Location meublée
                    </PickChip>
                  </div>
                  <div className="grid grid-cols-2 items-end gap-3">
                    <Field label="Loyer souhaité (hors charges)">
                      <NumInput value={g.loyerSouhaite} onChange={(v) => set({ loyerSouhaite: v })} suffix="€" />
                    </Field>
                    <Field label="Charges par mois">
                      <NumInput value={g.chargesSouhaitees} onChange={(v) => set({ chargesSouhaitees: v })} suffix="€" />
                    </Field>
                    <Field label="Disponible le">
                      <input type="date" className="input" value={g.disponible ?? ""} onChange={(e) => set({ disponible: e.target.value || undefined })} />
                    </Field>
                  </div>
                  <p className="text-xs text-muted">Reporté en annexe du mandat (conditions de location).</p>
                </>
              )}
            </div>
          </Card>

          <Card title="Rémunération de l'agence">
            <div className="space-y-3">
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Gestion courante (HT)" hint={`Soit ${prix(ttc(g.tauxHt)).replace(" €", " %")} TTC`}>
                  <NumInput value={g.tauxHt} onChange={(v) => set({ tauxHt: v ?? 0 })} suffix="%" />
                </Field>
                <Field label="Fixe par mois (HT)" hint={`Soit ${prix(ttc(g.fixeHt))} TTC`}>
                  <NumInput value={g.fixeHt} onChange={(v) => set({ fixeHt: v ?? 0 })} suffix="€" />
                </Field>
              </div>
              <span className="label !mb-0">Location ou relocation, par partie (état des lieux compris)</span>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Vide, TTC par m²">
                  <NumInput value={g.tarifNu} onChange={(v) => set({ tarifNu: v ?? 0 })} suffix="€" />
                </Field>
                <Field label="Limite (% d'un mois CC)">
                  <NumInput value={g.limiteNu} onChange={(v) => set({ limiteNu: v })} suffix="%" placeholder="—" />
                </Field>
                <Field label="Meublé, TTC par m²">
                  <NumInput value={g.tarifMeuble} onChange={(v) => set({ tarifMeuble: v ?? 0 })} suffix="€" />
                </Field>
                <Field label="Limite (% d'un mois CC)">
                  <NumInput value={g.limiteMeuble} onChange={(v) => set({ limiteMeuble: v })} suffix="%" placeholder="—" />
                </Field>
              </div>
              <Toggle checked={g.premiereOfferte} onChange={(v) => set({ premiereOfferte: v })} label="Honoraires de première mise en location offerts au propriétaire" />
              <Field label="Petites réparations sans accord préalable, jusqu'à">
                <NumInput value={g.reparationsMax} onChange={(v) => set({ reparationsMax: v ?? 0 })} suffix="€" />
              </Field>
            </div>
          </Card>

          <Card title="Assurances par l'agence">
            <div className="space-y-1">
              <Toggle checked={g.gli} onChange={(v) => set({ gli: v })} label="Garantie loyers impayés" hint={`${prix(TARIFS.gli).replace(" €", " %")} TTC des sommes encaissées. Plus de caution possible, sauf étudiant ou apprenti.`} />
              <Toggle checked={g.pj} onChange={(v) => set({ pj: v })} label="Protection juridique" hint={`${TARIFS.pj.habitation} € TTC par an et par lot (meublé ${TARIFS.pj.meuble} €, commercial ${TARIFS.pj.commercial} €)`} />
              <Toggle checked={g.pno} onChange={(v) => set({ pno: v })} label="Propriétaire non occupant" hint={`${TARIFS.pno.appartement} € TTC par an (commercial ou mixte ${TARIFS.pno.commercial} €)`} />
            </div>
            <p className="mt-2 text-xs text-muted">Les bulletins d&apos;adhésion se remplissent à part, avec l&apos;assureur.</p>
          </Card>

          <Card title="Conditions">
            <div className="space-y-3">
              <Field label="Conditions particulières (facultatif)">
                <textarea className="input min-h-[70px] text-sm" value={g.conditionsParticulieres ?? ""} onChange={(e) => set({ conditionsParticulieres: e.target.value })} />
              </Field>
              <Toggle checked={!!g.executionImmediate} onChange={(v) => set({ executionImmediate: v })} label="Commencer la gestion sans attendre les 14 jours de rétractation" hint="À sa demande expresse, par exemple si le bien est déjà loué. Il garde son droit de se rétracter." />
              <Toggle checked={g.prospection} onChange={(v) => set({ prospection: v })} label="Le propriétaire accepte la prospection commerciale par e-mail" hint="Case RGPD du mandat, cochée seulement avec son accord." />
            </div>
          </Card>

          <Card title="Signataire pour PATRIM">
            <div className="grid grid-cols-2 items-end gap-3">
              <Field label="Nom">
                <input className="input" value={g.signataire.nom} onChange={(e) => set({ signataire: { ...g.signataire, nom: e.target.value } })} />
              </Field>
              <Field label="Qualité">
                <input className="input" value={g.signataire.qualite} onChange={(e) => set({ signataire: { ...g.signataire, qualite: e.target.value } })} />
              </Field>
              <Field label="E-mail (signature)">
                <input className="input" inputMode="email" value={g.signataire.email ?? ""} onChange={(e) => set({ signataire: { ...g.signataire, email: e.target.value } })} />
              </Field>
              <Field label="Portable (signature)">
                <input className="input" inputMode="tel" value={g.signataire.tel ?? ""} onChange={(e) => set({ signataire: { ...g.signataire, tel: e.target.value } })} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">Gardé sur ce téléphone pour les prochains actes.</p>
          </Card>

          {alertes.length > 0 && (
            <div className="space-y-2">
              {alertes.map((a) => (
                <p key={a.texte} className={cx("flex items-start gap-2 rounded-2xl px-4 py-3 text-sm", a.niveau === "danger" ? "bg-danger/10 text-danger" : "bg-warn/10 text-warn")}>
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" /> {a.texte}
                </p>
              ))}
            </div>
          )}

          <div className="card card-pad space-y-2">
            <button className="btn-primary w-full !h-12" onClick={voirPdf}>
              <FileSignature size={17} /> Voir le mandat et créer le PDF
            </button>
            {totalManquants > 0 && <p className="text-center text-xs text-warn">{totalManquants} information{totalManquants > 1 ? "s" : ""} manquante{totalManquants > 1 ? "s" : ""} : elles apparaîtront en [À compléter].</p>}
            <button
              className="btn-ghost btn-sm w-full text-muted"
              onClick={() => {
                effacerGestion(b.id);
                setEtape("parties");
                setG(depart());
              }}
            >
              <RotateCcw size={13} /> Recommencer un mandat vierge
            </button>
          </div>
        </>
      )}

      {demande && <BrouillonMail open onClose={() => setDemande(null)} titre={`Demander à ${nomComplet(demande)}`} to={demande.email} tel={demande.tel} {...mailDemandeGestion(demande)} />}
    </div>
  );
}
