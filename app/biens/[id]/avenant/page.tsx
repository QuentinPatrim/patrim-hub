"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, FilePen, RotateCcw } from "lucide-react";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip } from "@/components/contacts/bits";
import { PartieForm } from "@/components/documents/Parties";
import { enLettres } from "@/components/documents/charte";
import { enregistrerActe, type BienActes } from "@/components/documents/archive";
import { enregistrerParties, partieDepuisContact, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import { TYPES_MANDAT } from "@/components/mandat/mandat";
import { CHAMPS_AVENANT, avenantInitial, ecrireAvenant, effacerAvenant, lireAvenant, manquantsAvenant, prixPresentation, type Avenant, type ConditionsPrix } from "@/components/avenant/avenant";
import { useCollection, useDoc } from "@/lib/store";
import { eur, today } from "@/lib/format";

/* ============================================================
   Rédiger un avenant au mandat de vente (nouveau prix, nouveaux
   honoraires), puis le PDF PATRIM prêt à déposer sur ICSIGN.
   ============================================================ */

export default function AvenantPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc } = useDoc("biens", id);
  const b = doc as BienActes | undefined;
  const { items: contactsRaw } = useCollection("contacts");
  const contacts = contactsRaw as ContactEtatCivil[];
  const [a, setA] = useState<Avenant | null>(null);
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
    const actes = b.actes ?? [];
    // « Modifier » depuis la carte Documents : l'avenant demandé ; sinon le brouillon en cours, tant qu'il n'est pas parti à la signature.
    const acteId = new URLSearchParams(window.location.search).get("acte");
    const depuisActe = actes.find((x) => x.id === acteId && x.kind === "avenant")?.data as Avenant | undefined;
    const brouillon = lireAvenant(b.id);
    const statutBrouillon = brouillon?.acteId ? actes.find((x) => x.id === brouillon.acteId)?.statut : "brouillon";
    setA(depuisActe ?? (brouillon && statutBrouillon === "brouillon" ? brouillon : avenantInitial(b, vendeursDuBien(), actes)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, contacts]);

  useEffect(() => {
    if (a) ecrireAvenant(a);
  }, [a]);

  if (!b || !a) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const set = (patch: Partial<Avenant>) => setA((x) => (x ? { ...x, ...patch } : x));
  const setAncien = (patch: Partial<ConditionsPrix>) => set({ ancien: { ...a.ancien, ...patch } });
  const setNouveau = (patch: Partial<Avenant["nouveau"]>) => set({ nouveau: { ...a.nouveau, ...patch } });
  const choisir = (ids: string[]) => set({ mandants: ids.map((cid) => a.mandants.find((p) => p.contactId === cid) ?? partieDepuisContact(contacts.find((c) => c.id === cid)!)) });
  const setPartie = (i: number, patch: Partial<Partie>) => set({ mandants: a.mandants.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  const avant = prixPresentation(a.ancien);
  const apres = prixPresentation(a.nouveau);
  const manque = manquantsAvenant(a);

  const voirPdf = () => {
    enregistrerParties(a.mandants, contacts);
    const acteId = enregistrerActe(b.id, "avenant", a);
    ecrireAvenant({ ...a, acteId });
    router.push(`/imprimer/avenant/${b.id}?acte=${acteId}`);
  };

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Avenant au mandat" subtitle={b.titre} />

      <Card title="Le mandat modifié">
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="N° du mandat">
            <input className="input" inputMode="numeric" value={a.mandatNumero ?? ""} onChange={(e) => set({ mandatNumero: e.target.value || undefined })} />
          </Field>
          <Field label="Date du mandat">
            <input type="date" className="input" value={a.mandatDate ?? ""} onChange={(e) => set({ mandatDate: e.target.value || undefined })} />
          </Field>
          <Field label="N° de l'avenant">
            <input className="input" inputMode="numeric" value={a.numero ?? ""} onChange={(e) => set({ numero: e.target.value || undefined })} />
          </Field>
          <Field label="Date de l'avenant">
            <input type="date" className="input" value={a.date} onChange={(e) => set({ date: e.target.value || today() })} />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TYPES_MANDAT.map((t) => (
            <PickChip key={t.v} active={a.mandatType === t.v} onClick={() => set({ mandatType: t.v })}>
              {t.label}
            </PickChip>
          ))}
        </div>
        {!a.mandatNumero && <p className="mt-2 text-xs text-warn">Numéro du mandat inconnu : à reprendre du registre de l&apos;agence.</p>}
      </Card>

      <Card title="Vendeur(s) – le mandant">
        <ContactPicker value={a.mandants.map((p) => p.contactId!).filter(Boolean)} onChange={choisir} role="vendeur" max={4} placeholder="Rechercher le vendeur…" />
        <p className="mt-2 text-xs text-muted">Tous les signataires du mandat signent l&apos;avenant.</p>
      </Card>
      {a.mandants.map((p, i) => (
        <PartieForm key={p.contactId ?? i} titre={a.mandants.length > 1 ? `Vendeur ${i + 1}` : "Vendeur"} p={p} champs={CHAMPS_AVENANT} onChange={(x) => setPartie(i, x)} />
      ))}

      <Card title="Prix au mandat (avant)">
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Net vendeur">
            <NumInput value={a.ancien.netVendeur} onChange={(v) => setAncien({ netVendeur: v })} suffix="€" />
          </Field>
          <Field label="Honoraires TTC">
            <NumInput value={a.ancien.honoraires} onChange={(v) => setAncien({ honoraires: v })} suffix="€" />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">
          {a.ancienSource === "dossier"
            ? "Repris du dossier du bien : à vérifier sur le mandat signé."
            : a.ancienSource === "acte"
              ? "Repris du dernier mandat ou avenant signé gardé sur la fiche."
              : "Facultatif : s'il est connu, l'avenant rappelle l'ancien prix."}
        </p>
      </Card>

      <Card title="Nouveau prix">
        <div className="space-y-3">
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Net vendeur">
              <NumInput value={a.nouveau.netVendeur} onChange={(v) => setNouveau({ netVendeur: v })} suffix="€" />
            </Field>
            <Field label="Honoraires TTC">
              <NumInput value={a.nouveau.honoraires} onChange={(v) => setNouveau({ honoraires: v })} suffix="€" />
            </Field>
          </div>
          <div>
            <span className="label">Honoraires à la charge</span>
            <div className="flex gap-2">
              <PickChip active={a.nouveau.charge === "acquereur"} onClick={() => setNouveau({ charge: "acquereur" })}>
                de l&apos;acquéreur
              </PickChip>
              <PickChip active={a.nouveau.charge === "vendeur"} onClick={() => setNouveau({ charge: "vendeur" })}>
                du vendeur
              </PickChip>
            </div>
          </div>
          <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="text-muted">Prix de présentation</span>
              <span className="ml-auto whitespace-nowrap text-right font-semibold">
                {avant != null && avant !== apres && <span className="mr-1.5 font-normal text-muted line-through">{eur(avant)}</span>}
                {apres != null ? eur(apres) : "—"}
              </span>
            </div>
            {a.nouveau.netVendeur ? <div className="mt-1 text-xs text-muted first-letter:uppercase">{enLettres(a.nouveau.netVendeur)} euros net vendeur</div> : null}
            {b.prix != null && apres != null && b.prix !== apres && <div className="mt-1 text-xs text-warn">L&apos;annonce affiche {eur(b.prix)} : la fiche sera mise à jour quand l&apos;avenant sera marqué signé.</div>}
          </div>
        </div>
      </Card>

      <Card title="Autre modification (facultatif)">
        <textarea
          className="input min-h-[80px] text-sm"
          value={a.autres ?? ""}
          onChange={(e) => set({ autres: e.target.value || undefined })}
          placeholder="Ex. ajout d'un co-mandant, nouvelle adresse du mandant…"
        />
        <p className="mt-1.5 text-xs text-muted">Pour prolonger un mandat arrivé à son terme, il faut un nouveau mandat, pas un avenant.</p>
      </Card>

      <Card title="Signataire pour PATRIM">
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="Nom">
            <input className="input" value={a.signataire.nom} onChange={(e) => set({ signataire: { ...a.signataire, nom: e.target.value } })} />
          </Field>
          <Field label="Qualité">
            <input className="input" value={a.signataire.qualite} onChange={(e) => set({ signataire: { ...a.signataire, qualite: e.target.value } })} />
          </Field>
          <Field label="E-mail (signature)">
            <input className="input" inputMode="email" value={a.signataire.email ?? ""} onChange={(e) => set({ signataire: { ...a.signataire, email: e.target.value } })} />
          </Field>
          <Field label="Portable (signature)">
            <input className="input" inputMode="tel" value={a.signataire.tel ?? ""} onChange={(e) => set({ signataire: { ...a.signataire, tel: e.target.value } })} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">Le même que pour les mandats, gardé sur ce téléphone.</p>
      </Card>

      <div className="card card-pad space-y-2">
        <button className="btn-primary w-full !h-12" onClick={voirPdf} disabled={!a.mandants.length}>
          <FilePen size={17} /> Voir l&apos;avenant et créer le PDF <ArrowRight size={16} />
        </button>
        {!a.mandants.length ? (
          <p className="text-center text-xs text-muted">Choisissez au moins un vendeur.</p>
        ) : (
          manque > 0 && <p className="text-center text-xs text-warn">{manque} information{manque > 1 ? "s" : ""} manquante{manque > 1 ? "s" : ""} : elles apparaîtront en [À compléter].</p>
        )}
        <button
          className="btn-ghost btn-sm w-full text-muted"
          onClick={() => {
            effacerAvenant(b.id);
            setA(avenantInitial(b, vendeursDuBien(), b.actes ?? []));
          }}
        >
          <RotateCcw size={13} /> Recommencer un avenant vierge
        </button>
      </div>
    </div>
  );
}
