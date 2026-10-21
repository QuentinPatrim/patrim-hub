"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Landmark, Plus, RotateCcw } from "lucide-react";
import { Card, Empty, Field, PageHeader } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip, Toggle } from "@/components/contacts/bits";
import { PartieForm } from "@/components/documents/Parties";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import type { BienActes } from "@/components/documents/archive";
import { clePoint, dossierDe, reglesDe } from "@/components/biens/dossier";
import { enregistrerParties, partieDepuisContact, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import {
  CHAMPS_VENDEUR,
  PIECES,
  aCompleter,
  depuisOffre,
  ecrireTransmission,
  emailsDe,
  effacerTransmission,
  lireTransmission,
  offresDuBien,
  texteTransmission,
  transmissionInitiale,
  type Transmission,
} from "@/components/notaire/transmission";
import { getAll, useCollection, useDoc } from "@/lib/store";
import { dateCourte, eur } from "@/lib/format";

/* ============================================================
   Transmettre le dossier au notaire une fois l'offre acceptée :
   tout est pré-rempli depuis l'offre et le dossier du bien, puis
   le mail s'ouvre dans la messagerie pour relecture (jamais
   d'envoi automatique).
   ============================================================ */

export default function NotairePage() {
  const { id } = useParams<{ id: string }>();
  const { doc } = useDoc("biens", id);
  const b = doc as BienActes | undefined;
  const { items: contactsRaw } = useCollection("contacts");
  const contacts = contactsRaw as ContactEtatCivil[];
  const [t, setT] = useState<Transmission | null>(null);
  const [mail, setMail] = useState(false);
  const [waited, setWaited] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    const tm = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(tm);
  }, []);

  const vendeursDuBien = () => (b?.vendeurIds ?? []).map((v) => contacts.find((c) => c.id === v)).filter(Boolean) as ContactEtatCivil[];
  // Les vendeurs viennent des fiches contact : on attend qu'elles soient chargées (ou un court délai).
  const pret = !!b && (!b.vendeurIds?.length || contacts.some((c) => b.vendeurIds!.includes(c.id)) || waited);

  useEffect(() => {
    if (!b || !pret || init.current) return;
    init.current = true;
    // « Notaire » depuis une offre de la carte Documents : cette offre ; sinon le brouillon en cours.
    const offre = new URLSearchParams(window.location.search).get("offre");
    const brouillon = lireTransmission(b.id);
    setT(brouillon && (!offre || brouillon.offreActeId === offre) ? brouillon : transmissionInitiale(b, vendeursDuBien(), b.actes ?? [], offre));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b, pret]);

  useEffect(() => {
    if (t) ecrireTransmission(t);
  }, [t]);

  if (!b || !t) {
    if (!waited || (b && !t)) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }

  const set = (patch: Partial<Transmission>) => setT((x) => (x ? { ...x, ...patch } : x));
  const choisir = (role: "acquereurs" | "vendeurs", ids: string[]) =>
    set({ [role]: ids.map((cid) => t[role].find((p) => p.contactId === cid) ?? partieDepuisContact(getAll("contacts").find((c) => c.id === cid)!)) });
  const setPartie = (role: "acquereurs" | "vendeurs", i: number, patch: Partial<Partie>) => set({ [role]: t[role].map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const basculerPiece = (cle: Transmission["pieces"][number]) => set({ pieces: t.pieces.includes(cle) ? t.pieces.filter((x) => x !== cle) : [...t.pieces, cle] });

  const offres = offresDuBien(b.actes ?? []);
  const d = dossierDe(b);
  const regles = reglesDe(b);
  const points = (d?.aVerifier ?? []).filter((p) => !regles[clePoint(p)] && !t.attention.includes(p));
  const net = t.prix != null && t.honoraires != null ? t.prix - t.honoraires : undefined;
  const m = texteTransmission(t, b);
  const manque = aCompleter(m);

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Transmission au notaire" subtitle={b.titre} />

      <Card title="Notaire">
        <div className="space-y-2">
          <Field label="E-mail du ou des notaires" hint={d?.notaire ? `Dossier : ${d.notaire}` : "Plusieurs adresses : séparez-les par une virgule."}>
            <input className="input" inputMode="email" autoCapitalize="off" value={t.destinataires} onChange={(e) => set({ destinataires: e.target.value })} placeholder="office@notaires.fr" />
          </Field>
          <Toggle checked={t.confrere} onChange={(v) => set({ confrere: v })} label="Demander s'il intervient pour les deux parties" hint="Utile quand vous ne connaissez que le notaire de l'un des deux." />
        </div>
      </Card>

      <Card title="L'offre acceptée">
        {offres.length ? (
          <div className="flex flex-wrap gap-2">
            {offres.map((a) => (
              <PickChip key={a.id} active={t.offreActeId === a.id} onClick={() => set(depuisOffre(b, vendeursDuBien(), a))} className="!h-auto min-h-9 whitespace-normal py-1.5 text-left">
                Offre du {dateCourte(a.data.date)}
                {a.data.prix ? ` · ${eur(a.data.prix)}` : ""}
                {a.statut === "signe" ? " · signée" : ""}
              </PickChip>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Aucune offre rédigée dans l&apos;appli pour ce bien : choisissez l&apos;acquéreur ci-dessous, ou{" "}
            <Link href={`/biens/${b.id}/offre`} className="font-medium text-accent">
              rédigez l&apos;offre
            </Link>
            .
          </p>
        )}
        <div className="mt-3 grid grid-cols-2 items-end gap-3">
          <Field label="Offre du">
            <input type="date" className="input" value={t.offreDate ?? ""} onChange={(e) => set({ offreDate: e.target.value || undefined })} />
          </Field>
          <Field label="Acceptée le">
            <input type="date" className="input" value={t.acceptation ?? ""} onChange={(e) => set({ acceptation: e.target.value || undefined })} />
          </Field>
        </div>
        {t.acceptation && offres.find((a) => a.id === t.offreActeId)?.statut === "signe" && (
          <p className="mt-2 text-xs text-muted">Date où l&apos;offre a été marquée signée dans l&apos;appli : à vérifier.</p>
        )}
      </Card>

      <Card title="Acquéreur">
        <ContactPicker value={t.acquereurs.map((p) => p.contactId!).filter(Boolean)} onChange={(ids) => choisir("acquereurs", ids)} role="acquereur" max={2} placeholder="Rechercher l'acquéreur…" />
      </Card>
      {t.acquereurs.map((p, i) => (
        <PartieForm key={p.contactId ?? i} titre={t.acquereurs.length > 1 ? `Acquéreur ${i + 1}` : "Acquéreur"} p={p} onChange={(x) => setPartie("acquereurs", i, x)} />
      ))}

      <Card title="Vendeur">
        <ContactPicker value={t.vendeurs.map((p) => p.contactId!).filter(Boolean)} onChange={(ids) => choisir("vendeurs", ids)} role="vendeur" max={4} placeholder="Rechercher le vendeur…" />
      </Card>
      {t.vendeurs.map((p, i) => (
        <PartieForm key={p.contactId ?? i} titre={t.vendeurs.length > 1 ? `Vendeur ${i + 1}` : "Vendeur"} p={p} champs={CHAMPS_VENDEUR} onChange={(x) => setPartie("vendeurs", i, x)} />
      ))}

      <Card title="Prix et financement">
        <div className="space-y-3">
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Prix frais d'agence inclus">
              <NumInput value={t.prix} onChange={(v) => set({ prix: v })} suffix="€" />
            </Field>
            <Field label="Honoraires TTC">
              <NumInput value={t.honoraires} onChange={(v) => set({ honoraires: v })} suffix="€" />
            </Field>
          </div>
          <div>
            <span className="label">Honoraires à la charge</span>
            <div className="flex gap-2">
              <PickChip active={t.charge === "acquereur"} onClick={() => set({ charge: "acquereur" })}>
                de l&apos;acquéreur
              </PickChip>
              <PickChip active={t.charge === "vendeur"} onClick={() => set({ charge: "vendeur" })}>
                du vendeur
              </PickChip>
            </div>
          </div>
          <p className="text-sm text-muted">
            Net vendeur : <span className="font-semibold text-fg">{net != null ? eur(net) : "—"}</span>
          </p>
          <div className="flex gap-2">
            <PickChip active={t.financement === "pret"} onClick={() => set({ financement: "pret", conditionSuspensive: true })}>
              Prêt
            </PickChip>
            <PickChip active={t.financement === "comptant"} onClick={() => set({ financement: "comptant", conditionSuspensive: false, montantPret: undefined })}>
              Comptant
            </PickChip>
          </div>
          {t.financement === "pret" && (
            <>
              <Field label="Montant du prêt (facultatif)">
                <NumInput value={t.montantPret} onChange={(v) => set({ montantPret: v })} suffix="€" />
              </Field>
              <Toggle checked={t.conditionSuspensive} onChange={(v) => set({ conditionSuspensive: v })} label="Sous condition suspensive d'obtention de prêt" />
            </>
          )}
        </div>
      </Card>

      <Card title="Le dossier">
        <div className="space-y-3">
          <Field label="Le bien" hint="Désignation, copropriété et lots, repris de l'offre et du dossier : relisez avant l'envoi.">
            <textarea className="input min-h-[130px] text-sm" value={t.bien} onChange={(e) => set({ bien: e.target.value })} />
          </Field>
          <Field label="Syndic et charges">
            <textarea className="input min-h-[80px] text-sm" value={t.copropriete} onChange={(e) => set({ copropriete: e.target.value })} />
          </Field>
          <Field label="Occupation">
            <textarea className="input min-h-[80px] text-sm" value={t.occupation} onChange={(e) => set({ occupation: e.target.value })} placeholder="Libre, ou loué (bail, loyer, dépôt de garantie)" />
          </Field>
          <Field label="Diagnostics">
            <textarea className="input min-h-[80px] text-sm" value={t.diagnostics} onChange={(e) => set({ diagnostics: e.target.value })} />
          </Field>
          <Field label="Point d'attention (facultatif)" hint="Écart de lots, bien loué, mobilier, succession… Ce que le notaire doit savoir d'emblée.">
            <textarea className="input min-h-[80px] text-sm" value={t.attention} onChange={(e) => set({ attention: e.target.value })} />
          </Field>
          {points.length > 0 && (
            <div>
              <span className="text-xs text-muted">Reprendre un point à vérifier du dossier :</span>
              <ul className="mt-1.5 space-y-1.5">
                {points.map((p) => (
                  <li key={p}>
                    <button
                      type="button"
                      onClick={() => set({ attention: [t.attention.trim(), p].filter(Boolean).join("\n") })}
                      className="flex w-full items-start gap-2 rounded-xl border border-line px-3 py-2 text-left text-xs text-fg/80 hover:border-accent/40"
                    >
                      <Plus size={14} className="mt-0.5 shrink-0 text-accent" />
                      <span className="line-clamp-2">{p}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Card title="Pièces jointes">
        <div className="flex flex-wrap gap-2">
          {PIECES.map((p) => (
            <PickChip key={p.cle} active={t.pieces.includes(p.cle)} onClick={() => basculerPiece(p.cle)}>
              {p.chip}
            </PickChip>
          ))}
        </div>
        <Field label="Lien de transfert (facultatif)" className="mt-3">
          <input className="input" inputMode="url" autoCapitalize="off" value={t.lien ?? ""} onChange={(e) => set({ lien: e.target.value || undefined })} placeholder="https://we.tl/…" />
        </Field>
        <p className="mt-2 text-xs text-muted">Le mail cite les pièces cochées : joignez-les dans votre messagerie.</p>
      </Card>

      <div className="card card-pad space-y-2">
        <button
          className="btn-primary w-full !h-12"
          onClick={() => {
            enregistrerParties([...t.acquereurs, ...t.vendeurs], contacts);
            setMail(true);
          }}
        >
          <Landmark size={17} /> Préparer le mail au notaire
        </button>
        {manque > 0 && (
          <p className="text-center text-xs text-warn">
            {manque} élément{manque > 1 ? "s" : ""} à compléter : {manque > 1 ? "ils apparaissent" : "il apparaît"} en [À compléter] dans le mail.
          </p>
        )}
        {!emailsDe(t.destinataires).length && <p className="text-center text-xs text-muted">Sans e-mail du notaire, vous le saisirez dans le brouillon.</p>}
        <button
          className="btn-ghost btn-sm w-full text-muted"
          onClick={() => {
            effacerTransmission(b.id);
            setT(transmissionInitiale(b, vendeursDuBien(), b.actes ?? [], t.offreActeId));
          }}
        >
          <RotateCcw size={13} /> Repartir de l&apos;offre et du dossier
        </button>
      </div>

      <BrouillonMail open={mail} onClose={() => setMail(false)} titre="Mail au notaire" to={emailsDe(t.destinataires).join(",") || undefined} sujet={m.sujet} corps={m.corps} />
    </div>
  );
}
