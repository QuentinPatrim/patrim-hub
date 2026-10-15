"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, FileText, Mail, Phone, RotateCcw } from "lucide-react";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { enregistrerActe } from "@/components/documents/archive";
import { telActe } from "@/components/documents/charte";
import { SignaturePad, TraceSvg } from "@/components/bon/SignaturePad";
import { MENTION_DONNEES, annulerSignature, bonDepuis, bonDuRdv, descriptionBien, engagement, nomVisiteur, prixTexte, quand, signerBon, type Trace, type Visiteur } from "@/components/bon/bon";
import { update, useCollection, useDoc } from "@/lib/store";
import { titrePublic } from "@/lib/titrePublic";

/* ============================================================
   Bon de visite d'une visite de l'agenda : le visiteur le lit et
   le signe au doigt sur le téléphone du conseiller. Il est ensuite
   gardé dans les documents du bien, avec son PDF.
   Écran montré au visiteur : rien sur le vendeur.
   ============================================================ */

const cle = (v: Visiteur, i: number) => v.contactId ?? String(i);
const EN_COURS = ["en_vente", "mandat_signe", "sous_offre", "compromis"];

export default function BonDeVisitePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc: rdv } = useDoc("rdvs", id);
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const [traces, setTraces] = useState<Record<string, Trace | undefined>>({});
  const [editer, setEditer] = useState(false);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const bien = biens.find((b) => b.id === rdv?.bienId);
  const acte = bonDuRdv(bien, id);
  const signe = acte?.statut === "signe";
  // Signé : le bon tel qu'il a été signé ; sinon, celui de l'agenda et des fiches, à jour.
  const bon = useMemo(() => (acte && signe ? acte.data : rdv && bien ? { ...bonDepuis(rdv, bien, contacts), acteId: acte?.id } : undefined), [acte, signe, rdv, bien, contacts]);
  const candidats = useMemo(() => biens.filter((b) => EN_COURS.includes(b.statut)).sort((a, b) => titrePublic(a).localeCompare(titrePublic(b))), [biens]);

  if (!rdv) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Visite introuvable" action={<Link href="/agenda" className="btn-primary">Retour à l&apos;agenda</Link>} />
      </div>
    );
  }

  const visiteurs = bon?.visiteurs ?? [];
  const pret = visiteurs.length > 0 && visiteurs.every((v, i) => traces[cle(v, i)]);
  const texte = bon ? engagement(bon) : [];

  const valider = () => {
    if (!bon || !pret) return;
    signerBon(bon, visiteurs.map((v, i) => traces[cle(v, i)]!));
    setTraces({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const pdf = () => {
    if (!bon) return;
    const acteId = acte && signe ? acte.id : enregistrerActe(bon.bienId, "bon", bon);
    router.push(`/imprimer/bon/${bon.bienId}?acte=${acteId}`);
  };
  const refaire = () => {
    if (acte && confirm("Effacer les signatures de ce bon de visite pour le faire signer à nouveau ?")) annulerSignature(acte.data);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-6">
      <PageHeader back="/agenda" title="Bon de visite" subtitle={`Visite du ${quand(rdv.debut)}`} />

      {signe && acte && (
        <div className="rounded-2xl border border-ok/30 bg-ok/10 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-ok">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            {acte.data.signeLe ? `Signé sur place, le ${quand(acte.data.signeLe)}.` : "Marqué comme signé dans les documents du bien."}
          </p>
          <p className="mt-1 text-sm text-muted">Il est rangé dans les documents du bien.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={pdf} className="btn-primary btn-sm">
              <Eye size={14} /> Voir le PDF
            </button>
            <button type="button" onClick={refaire} className="btn-ghost btn-sm">
              <RotateCcw size={14} /> Refaire signer
            </button>
          </div>
        </div>
      )}

      <Card title="Le bien visité">
        {bon ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{descriptionBien(bon.bien)}</p>
            <p className="text-muted">{bon.bien.adresse}</p>
            {prixTexte(bon.bien) && <p>Prix : {prixTexte(bon.bien)}</p>}
            {bon.bien.mandat && <p className="text-muted">Mandat n° {bon.bien.mandat}</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted">Cette visite n&apos;est rattachée à aucun bien. Choisissez le bien visité :</p>
            <select className="input" value="" onChange={(e) => e.target.value && update("rdvs", id, { bienId: e.target.value })} aria-label="Bien visité">
              <option value="">Choisir le bien…</option>
              {candidats.map((b) => (
                <option key={b.id} value={b.id}>
                  {titrePublic(b)}
                  {b.adresse ? ` – ${b.adresse}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {/* La recherche de contacts n'est ouverte qu'à la demande : le téléphone passe ensuite au visiteur. */}
      <Card
        title={visiteurs.length > 1 ? "Les visiteurs" : "Le visiteur"}
        action={
          !signe && visiteurs.length > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setEditer(!editer)}>
              {editer ? "Terminé" : "Modifier"}
            </button>
          )
        }
      >
        {signe || (visiteurs.length > 0 && !editer) ? (
          <ListeVisiteurs visiteurs={visiteurs} />
        ) : (
          <ContactPicker value={rdv.contactIds ?? []} onChange={(ids) => update("rdvs", id, { contactIds: ids })} role="acquereur" placeholder="Rechercher ou ajouter le visiteur…" />
        )}
      </Card>

      {bon && visiteurs.length > 0 && (
        <>
          <Card title="Engagement">
            <div className="space-y-3 text-[15px] leading-relaxed">
              {texte.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">{MENTION_DONNEES}</p>
          </Card>

          <Card title={visiteurs.length > 1 ? "Signatures" : "Signature"}>
            {signe ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {visiteurs.map((v, i) => (
                  <div key={cle(v, i)}>
                    <p className="label">{nomVisiteur(v)}</p>
                    {v.signature ? (
                      <TraceSvg t={v.signature} className="w-full rounded-xl border border-line bg-surface text-fg" />
                    ) : (
                      <p className="text-sm text-muted">Signé hors de l&apos;appli (ICSIGN ou papier).</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {visiteurs.map((v, i) => (
                  <SignaturePad
                    key={cle(v, i)}
                    label={`Signature de ${nomVisiteur(v)}`}
                    onChange={(t) => setTraces((x) => ({ ...x, [cle(v, i)]: t }))}
                  />
                ))}
                <button type="button" onClick={valider} disabled={!pret} className="btn-primary h-12 w-full text-base">
                  <CheckCircle2 size={18} /> Valider {visiteurs.length > 1 ? "les signatures" : "la signature"}
                </button>
                <button type="button" onClick={pdf} className="btn-ghost btn-sm w-full">
                  <FileText size={14} /> Plutôt en PDF (ICSIGN ou papier)
                </button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ListeVisiteurs({ visiteurs }: { visiteurs: Visiteur[] }) {
  return (
    <ul className="space-y-2">
      {visiteurs.map((v, i) => (
        <li key={cle(v, i)} className="rounded-xl bg-surface-2 px-3 py-2.5 text-sm">
          <p className="font-medium">{nomVisiteur(v)}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-muted">
            {v.tel && (
              <span className="inline-flex items-center gap-1">
                <Phone size={12} /> {telActe(v.tel)}
              </span>
            )}
            {v.email && (
              <span className="inline-flex min-w-0 items-center gap-1 break-all">
                <Mail size={12} className="shrink-0" /> {v.email}
              </span>
            )}
            {!v.tel && !v.email && <span>Ni téléphone ni e-mail sur la fiche</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}
