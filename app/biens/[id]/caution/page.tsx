"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileSignature, Mail, Plus, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Card, Empty, Field, PageHeader, cx } from "@/components/ui";
import { BrouillonMail } from "@/components/matching/BrouillonMail";
import { NumInput } from "@/components/contacts/CriteresEditor";
import { PickChip, Toggle } from "@/components/contacts/bits";
import { enregistrerActe, type Acte, type BienActes } from "@/components/documents/archive";
import { titreBail, lireBail, type Bail } from "@/components/bail/bail";
import {
  SITUATIONS,
  alertesCaution,
  cautionInitiale,
  dureeMaxAns,
  ecrireCaution,
  effacerCaution,
  lireCaution,
  mailDemandeCaution,
  manquantsCaution,
  montantMax,
  nomCaution,
  revenusTotal,
  type Caution,
} from "@/components/caution/caution";
import type { Partie } from "@/components/offre/offre";
import { eurosCts } from "@/components/location/loi";
import { useDoc } from "@/lib/store";
import { dateCourte } from "@/lib/format";
import { titrePublic } from "@/lib/titrePublic";

/* ============================================================
   Acte de cautionnement : choisir le bail garanti, saisir la
   caution (ou le couple marié), puis le PDF PATRIM pour ICSIGN.
   Un acte par caution : « Nouvelle caution » repart d'une fiche
   vierge sur le même bail.
   ============================================================ */

type BailDispo = { id?: string; label: string; bail: Bail };

export default function CautionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { doc: b } = useDoc("biens", id);
  const [c, setC] = useState<Caution | null>(null);
  const [waited, setWaited] = useState(false);
  const [demande, setDemande] = useState(false);
  const init = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 1200);
    return () => clearTimeout(t);
  }, []);

  /** Baux du bien (le plus récent d'abord), puis le brouillon de cet appareil. */
  const baux = useMemo<BailDispo[]>(() => {
    if (!b) return [];
    const actes = ((b as BienActes).actes ?? []).filter((a): a is Extract<Acte, { kind: "bail" }> => a.kind === "bail" && a.statut !== "refuse");
    const out: BailDispo[] = actes.map((a) => ({ id: a.id, label: `${titreBail(a.data)}${a.data.debut ? ` du ${dateCourte(a.data.debut)}` : ""}`, bail: a.data }));
    const brouillon = lireBail(b.id);
    if (brouillon && !actes.some((a) => a.id === brouillon.acteId)) out.push({ label: `${titreBail(brouillon)} (brouillon)`, bail: brouillon });
    return out;
  }, [b]);

  useEffect(() => {
    if (!b || init.current) return;
    init.current = true;
    const q = new URLSearchParams(window.location.search);
    const voulu = q.get("bail");
    const existant = lireCaution(b.id);
    if (existant && !q.get("nouvelle") && (!voulu || existant.bailActeId === voulu)) return setC(existant);
    // « Nouvelle caution » ne s'applique qu'une fois : recharger la page garde la saisie.
    if (q.get("nouvelle")) window.history.replaceState(null, "", `${window.location.pathname}${voulu ? `?bail=${voulu}` : ""}`);
    const choix = baux.find((x) => x.id === voulu) ?? baux[0];
    if (choix) setC(cautionInitiale(choix.bail, choix.id));
  }, [b, baux]);

  useEffect(() => {
    if (c) ecrireCaution(c);
  }, [c]);

  const set = (patch: Partial<Caution>) => setC((v) => (v ? { ...v, ...patch } : v));
  const setPersonne = (i: number, patch: Partial<Partie>) => c && set({ personnes: c.personnes.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const manque = useMemo(() => (c ? manquantsCaution(c) : []), [c]);
  const alertes = useMemo(() => (c ? alertesCaution(c) : []), [c]);

  if (!b) {
    if (!waited) return <div className="skeleton h-40 rounded-3xl" />;
    return (
      <div className="card">
        <Empty title="Bien introuvable" action={<Link href="/biens" className="btn-primary">Retour aux biens</Link>} />
      </div>
    );
  }
  if (!c)
    return (
      <div className="space-y-5 pb-6">
        <PageHeader back={`/biens/${b.id}`} title="Acte de cautionnement" subtitle={b.titre} />
        <div className="card">
          <Empty
            title="Aucun bail pour ce bien"
            text="L'acte de cautionnement reprend le loyer, les charges et la durée du bail : rédigez d'abord le bail."
            action={
              <Link href={`/biens/${b.id}/bail`} className="btn-primary">
                Rédiger le bail
              </Link>
            }
          />
        </div>
      </div>
    );

  const bail = c.bail;
  const coloc = bail.locataires.length > 1;
  const couple = c.personnes.length > 1;
  const voirPdf = () => {
    const acteId = enregistrerActe(b.id, "caution", c);
    ecrireCaution({ ...c, acteId });
    router.push(`/imprimer/caution/${b.id}?acte=${acteId}`);
  };
  const nouvelle = () => {
    effacerCaution(b.id);
    setC(cautionInitiale(bail, c.bailActeId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="space-y-5 pb-6">
      <PageHeader back={`/biens/${b.id}`} title="Acte de cautionnement" subtitle={b.titre} />

      <Card title="Bail garanti">
        {baux.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {baux.map((x, i) => (
              <PickChip key={x.id ?? `brouillon-${i}`} active={c.bailActeId === x.id} onClick={() => set({ bail: x.bail, bailActeId: x.id })}>
                {x.label}
              </PickChip>
            ))}
          </div>
        )}
        <div className="rounded-xl bg-surface-2 px-4 py-3 text-sm space-y-1">
          <Ligne k={coloc ? "Colocataires" : "Locataire"} v={bail.locataires.map(nomCaution).join(", ") || "—"} />
          <Ligne k="Loyer + charges" v={bail.loyer ? `${eurosCts(bail.loyer)} + ${eurosCts(bail.charges ?? 0)}` : "—"} />
          <Ligne k="Montant maximum garanti" v={bail.loyer ? eurosCts(montantMax(bail), ".") : "—"} fort />
          <Ligne k="Durée maximum" v={`${dureeMaxAns(bail)} ans`} fort />
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm mt-2 text-muted"
          onClick={() => {
            const frais = baux.find((x) => x.id === c.bailActeId) ?? baux[0];
            if (frais) set({ bail: frais.bail, bailActeId: frais.id });
          }}
        >
          <RefreshCw size={13} /> Reprendre les derniers chiffres du bail
        </button>
      </Card>

      <Card
        title={couple ? "Les cautions (couple marié)" : "La caution"}
        action={
          <button type="button" className="btn-ghost btn-sm" onClick={() => setDemande(true)}>
            <Mail size={14} /> Demander les pièces
          </button>
        }
      >
        <div className="space-y-4">
          {c.personnes.map((p, i) => (
            <div key={i} className={cx("space-y-3", i > 0 && "border-t border-line pt-4")}>
              {couple && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Personne {i + 1}</span>
                  {i > 0 && (
                    <button type="button" className="btn-ghost btn-sm text-muted" onClick={() => set({ personnes: c.personnes.slice(0, 1) })}>
                      <X size={13} /> Retirer
                    </button>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                {(["Mme", "M."] as const).map((civ) => (
                  <PickChip key={civ} active={p.civilite === civ} onClick={() => setPersonne(i, { civilite: civ })}>
                    {civ === "Mme" ? "Madame" : "Monsieur"}
                  </PickChip>
                ))}
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <Field label="Prénom">
                  <input className="input" value={p.prenom ?? ""} onChange={(e) => setPersonne(i, { prenom: e.target.value })} autoComplete="off" />
                </Field>
                <Field label="Nom">
                  <input className="input" value={p.nom ?? ""} onChange={(e) => setPersonne(i, { nom: e.target.value })} autoComplete="off" />
                </Field>
                <Field label="Date de naissance">
                  <input type="date" className="input" value={p.dateNaissance ?? ""} onChange={(e) => setPersonne(i, { dateNaissance: e.target.value })} />
                </Field>
                <Field label="Lieu de naissance">
                  <input className="input" value={p.lieuNaissance ?? ""} onChange={(e) => setPersonne(i, { lieuNaissance: e.target.value })} placeholder="Ville (dépt)" />
                </Field>
                <Field label="E-mail (signature)">
                  <input className="input" inputMode="email" value={p.email ?? ""} onChange={(e) => setPersonne(i, { email: e.target.value })} />
                </Field>
                <Field label="Portable (signature)">
                  <input className="input" inputMode="tel" value={p.tel ?? ""} onChange={(e) => setPersonne(i, { tel: e.target.value })} />
                </Field>
              </div>
              {i === 0 && (
                <Field label="Domicile">
                  <input className="input" value={p.adresse ?? ""} onChange={(e) => setPersonne(0, { adresse: e.target.value })} placeholder="N°, rue, code postal, ville" />
                </Field>
              )}
            </div>
          ))}
          {!couple && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => set({ personnes: [...c.personnes, { civilite: "" }], situation: "marie" })}>
              <Plus size={14} /> Couple marié : ajouter le conjoint
            </button>
          )}
          <p className="text-xs text-muted">Un acte par caution. Seul un couple marié se porte caution dans un même acte ; chaque personne doit avoir son propre e-mail et son propre portable.</p>
        </div>
      </Card>

      <Card title="Situation">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {SITUATIONS.map((s) => (
              <PickChip key={s.v} active={c.situation === s.v} onClick={() => set({ situation: s.v })}>
                {s.label}
              </PickChip>
            ))}
          </div>
          <Field label="Profession">
            <input className="input" value={c.profession ?? ""} onChange={(e) => set({ profession: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["cdi", "CDI"],
                ["cdd", "CDD"],
                ["autre", "Autre (indépendant, retraité…)"],
              ] as const
            ).map(([v, l]) => (
              <PickChip key={v} active={c.contrat === v} onClick={() => set({ contrat: v })}>
                {l}
              </PickChip>
            ))}
          </div>
          {c.contrat === "cdd" && (
            <Field label="Fin du contrat">
              <input type="date" className="input" value={c.finCdd ?? ""} onChange={(e) => set({ finCdd: e.target.value || undefined })} />
            </Field>
          )}
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label={couple ? "Revenus nets (personne 1)" : "Rémunération nette"}>
              <NumInput value={c.remuneration} onChange={(v) => set({ remuneration: v })} suffix="€/mois" />
            </Field>
            <Field label={couple ? "Revenus nets (personne 2)" : "Autres revenus"}>
              <NumInput value={c.autresRevenus} onChange={(v) => set({ autresRevenus: v })} suffix="€/mois" />
            </Field>
          </div>
          <p className="text-xs text-muted">Total : {eurosCts(revenusTotal(c), ".")} par mois.</p>
        </div>
      </Card>

      {coloc && (
        <Card title="Colocataire accompagné">
          <p className="mb-2 text-xs text-muted">La caution garantit toute la colocation, mais son engagement prend fin avec le départ de ce colocataire (article 8-1 de la loi).</p>
          <div className="flex flex-wrap gap-2">
            {bail.locataires.map((p, i) => {
              const n = nomCaution(p);
              return (
                <PickChip key={p.contactId ?? i} active={c.colocataireLie === n} onClick={() => set({ colocataireLie: n })}>
                  {n || `Colocataire ${i + 1}`}
                </PickChip>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Assurance loyers impayés">
        <Toggle checked={c.gli} onChange={(v) => set({ gli: v })} label="Le bailleur a souscrit une assurance loyers impayés" hint="Dans ce cas, une caution ne peut être demandée que pour un étudiant ou un apprenti." />
        {c.gli && <Toggle checked={c.etudiantApprenti} onChange={(v) => set({ etudiantApprenti: v })} label="Le locataire est étudiant ou apprenti" />}
      </Card>

      {(alertes.length > 0 || manque.length > 0) && (
        <div className="card card-pad space-y-2">
          <h2 className="h-section">À vérifier</h2>
          {alertes.map((a) => (
            <p key={a.texte} className={cx("flex items-start gap-2 text-sm", a.niveau === "danger" ? "text-danger" : "text-warn")}>
              <TriangleAlert size={15} className="mt-0.5 shrink-0" /> {a.texte}
            </p>
          ))}
          {manque.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {manque.map((m) => (
                <span key={m} className="chip !h-6 !border-warn/30 !text-warn !bg-warn/5">
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card card-pad space-y-2">
        <button className="btn-primary w-full !h-12" onClick={voirPdf}>
          <FileSignature size={17} /> Voir l&apos;acte et créer le PDF
        </button>
        {manque.length === 0 && alertes.every((a) => a.niveau !== "danger") && (
          <p className="text-center text-xs text-ok inline-flex w-full items-center justify-center gap-1">
            <Check size={13} /> Tout est complet.
          </p>
        )}
        <button className="btn-ghost btn-sm w-full text-muted" onClick={nouvelle}>
          <Plus size={13} /> Nouvelle caution sur ce bail
        </button>
      </div>

      {demande && (
        <BrouillonMail
          open
          onClose={() => setDemande(false)}
          titre="Demander les pièces à la caution"
          to={c.personnes[0]?.email}
          tel={c.personnes[0]?.tel}
          {...mailDemandeCaution(c, `${titreBail(bail)} ${titrePublic(b)}`)}
        />
      )}
    </div>
  );
}

function Ligne({ k, v, fort }: { k: string; v: string; fort?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={cx("text-right", fort && "font-semibold")}>{v}</span>
    </div>
  );
}
