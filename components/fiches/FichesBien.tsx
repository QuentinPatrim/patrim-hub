"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, FileSignature, FileText, Handshake, Link2, Lock, RefreshCw, ShieldAlert, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Badge, Card, cx, Empty, Field, Sheet, Spinner } from "@/components/ui";
import { PartageLien } from "@/components/renseignements/Partage";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { useCollection } from "@/lib/store";
import { dateCourte, eur, ilya, today } from "@/lib/format";
import { nomConseiller } from "@/lib/equipe";
import type { Bien } from "@/lib/types";
import {
  autreOffreEnCours,
  conjointAConsentir,
  contactsDepuisFiche,
  controlerFiche,
  contextePublic,
  creerFiche,
  fermerFiche,
  lienFiche,
  listerFiches,
  messageFiche,
  nouveauLienFiche,
  objetFiche,
  reponsesInitiales,
  type Destinataire,
  preparerMandat,
  preparerOffre,
  supprimerFiche,
} from "./client";
import { controleFait, groupesReponses, manquantsReponses, PIECES, RISQUES, TITRE_FICHE, type Controle, type Fiche, type KindFiche, type Reponses, type Risque } from "./fiche";

/* ============================================================
   Côté conseiller : fiches vendeur ou acquéreur envoyées pour un
   bien, réponses reçues, et passage vers le mandat ou l'offre.
   ============================================================ */

const STATUT: Record<Fiche["statut"], { label: string; tone: "neutral" | "warn" | "ok" }> = {
  a_remplir: { label: "À remplir", tone: "neutral" },
  en_cours: { label: "Commencée", tone: "warn" },
  termine: { label: "Reçue", tone: "ok" },
};

const nomFiche = (f: Fiche) => {
  const r = f.reponses ?? {};
  const noms = [[r.prenom || f.prenom, r.nom?.toUpperCase()].filter(Boolean).join(" "), ...(r.autres ?? []).map((p) => [p.prenom, p.nom?.toUpperCase()].filter(Boolean).join(" "))].filter(Boolean);
  return r.parties === "societe" && r.societe?.denomination ? `${[r.societe.forme, r.societe.denomination].filter(Boolean).join(" ")} (${noms[0] || "?"})` : noms.join(" et ") || "Sans nom";
};

/** Points à regarder avant de signer : vigilance renforcée, mandataire, conjoint… */
export function alertesFiche(kind: KindFiche, r: Reponses, prixAffiche?: number): { texte: string; grave?: boolean }[] {
  const out: { texte: string; grave?: boolean }[] = [];
  if ((r.ppe && r.ppe !== "non") || (r.autres ?? []).some((p) => p.ppe && p.ppe !== "non"))
    out.push({ texte: `Personne politiquement exposée${r.ppeDetail ? ` (${r.ppeDetail})` : ""} : vigilance renforcée, accord du responsable de l'agence avant de poursuivre.`, grave: true });
  if (r.propreCompte === false) out.push({ texte: `N'agit pas pour son propre compte${r.pourCompteDe ? ` (pour ${r.pourCompteDe})` : ""} : identifier aussi la personne pour qui il agit.`, grave: true });
  if (r.residenceFiscale && !/^france$/i.test(r.residenceFiscale.trim())) out.push({ texte: `Résidence fiscale hors de France (${r.residenceFiscale}).` });
  if (r.parties === "societe") out.push({ texte: "Société : demander l'extrait Kbis de moins de 3 mois, les statuts et l'identité des bénéficiaires effectifs." });
  if (kind === "vendeur") {
    if (conjointAConsentir(r)) out.push({ texte: "Logement de la famille : le conjoint doit consentir au mandat (article 215 du code civil), même s'il n'est pas propriétaire." });
    if (r.regime === "inconnu") out.push({ texte: "Régime matrimonial inconnu : à vérifier sur le titre de propriété." });
    if (r.credit) out.push({ texte: `Crédit en cours${r.creditBanque ? ` (${r.creditBanque})` : ""} : à signaler au notaire pour la mainlevée.` });
  } else {
    if (r.origineFonds?.some((o) => o === "Prêt familial" || o === "Autre")) out.push({ texte: "Origine des fonds à justifier (prêt familial ou autre) : demander un justificatif." });
    if (prixAffiche && r.prixPropose != null && r.prixPropose < prixAffiche) out.push({ texte: `Prix proposé ${eur(r.prixPropose)}, soit ${eur(prixAffiche - r.prixPropose)} sous le prix affiché.` });
  }
  return out;
}

/** Risque proposé d'après les réponses : à confirmer par le conseiller. */
export const risqueSuggere = (kind: KindFiche, r: Reponses, prix?: number): Risque => {
  const a = alertesFiche(kind, r, prix);
  return a.some((x) => x.grave) ? "eleve" : a.some((x) => !/sous le prix affiché|Crédit en cours/.test(x.texte)) ? "moyen" : "faible";
};

/** Carte de la fiche du bien (vente) : résumé et accès aux deux fiches. */
export function FichesCarte({ b }: { b: Bien }) {
  const [fiches, setFiches] = useState<Fiche[] | null>(null);
  useEffect(() => {
    listerFiches(b.id)
      .then(setFiches)
      .catch(() => setFiches([]));
  }, [b.id]);
  const compte = (k: KindFiche) => {
    const l = fiches?.filter((f) => f.kind === k) ?? [];
    return l.length ? `${l.filter((f) => f.statut === "termine").length}/${l.length} reçue${l.length > 1 ? "s" : ""}` : "";
  };
  return (
    <Card title="Fiches à remplir par le client">
      <p className="text-sm text-muted">Envoyez un lien : le vendeur ou l&apos;acquéreur remplit sa fiche en ligne, sur téléphone ou ordinateur, vérifications anti-blanchiment comprises. Ses réponses remplissent le mandat ou l&apos;offre.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link href={`/biens/${b.id}/fiche-vendeur`} className="btn-secondary !h-11 !justify-start">
          <FileSignature size={16} className="text-accent" /> Fiche vendeur
          {compte("vendeur") && <span className="ml-auto text-xs text-muted">{compte("vendeur")}</span>}
        </Link>
        <Link href={`/biens/${b.id}/fiche-acquereur`} className="btn-secondary !h-11 !justify-start">
          <Handshake size={16} className="text-accent" /> Fiche acquéreur
          {compte("acquereur") && <span className="ml-auto text-xs text-muted">{compte("acquereur")}</span>}
        </Link>
      </div>
    </Card>
  );
}

type Envoi = { dest: Destinataire; jeton: string; tel?: string; email?: string; rempli?: boolean };

export function FichesBien({ b, kind }: { b: Bien; kind: KindFiche }) {
  const router = useRouter();
  const [fiches, setFiches] = useState<Fiche[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [voir, setVoir] = useState<Fiche | null>(null);
  const [evaluer, setEvaluer] = useState<Fiche | null>(null);
  const [busy, setBusy] = useState(false);
  const vendeur = kind === "vendeur";

  const charger = useCallback(async () => {
    try {
      setFiches(await listerFiches(b.id, kind));
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
      setFiches((x) => x ?? []);
    }
  }, [b.id, kind]);

  useEffect(() => {
    void charger();
    if (new URLSearchParams(window.location.search).get("nouveau")) {
      setNouveau(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [charger]);

  const agir = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await f();
      await charger();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const preparer = (f: Fiche) => {
    if (vendeur) {
      preparerMandat(b, f);
      router.push(`/biens/${b.id}/mandat`);
      return;
    }
    const autre = autreOffreEnCours(b, f);
    if (autre && !confirm(`Une offre est déjà en cours de rédaction pour ${autre}. La remplacer par celle-ci ?`)) return;
    preparerOffre(b, f);
    router.push(`/biens/${b.id}/offre`);
  };

  const ctx = contextePublic(b, kind);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted animate-fade-up">
        {vendeur
          ? "Avant le mandat : le vendeur reçoit un lien personnel et remplit, en une fois, son état civil, son régime matrimonial, les autres propriétaires, le bien (lots, syndic, diagnostics), l'origine de propriété et les vérifications anti-blanchiment."
          : "Quand un acquéreur veut faire une offre : il reçoit un lien personnel et remplit son identité, ses coordonnées de signature, le prix proposé, son financement, l'origine des fonds et les vérifications anti-blanchiment."}
      </p>
      <button type="button" className="btn-primary w-full !h-12" onClick={() => setNouveau(true)}>
        <UserPlus size={17} /> {vendeur ? "Nouvelle fiche vendeur" : "Nouvelle fiche acquéreur"}
      </button>
      {err && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>}

      {fiches == null ? (
        <div className="skeleton h-40 !rounded-3xl" />
      ) : fiches.length ? (
        fiches.map((f) => (
          <CarteFiche
            key={f.id}
            f={f}
            b={b}
            busy={busy}
            onVoir={() => setVoir(f)}
            onEvaluer={() => setEvaluer(f)}
            onPreparer={() => preparer(f)}
            onContacts={() => {
              contactsDepuisFiche(b, f);
              alert("Fiches contact créées ou complétées.");
            }}
            onLien={() =>
              agir(async () => {
                const { jeton } = await nouveauLienFiche(f.id);
                const r = f.reponses ?? {};
                setEnvoi({ dest: { civilite: r.civilite, prenom: r.prenom || f.prenom, nom: r.nom }, jeton, tel: r.tel, email: r.email, rempli: f.statut === "a_remplir" && !!r.nom });
              })
            }
            onFermer={() => agir(() => fermerFiche(f.id, !f.ferme))}
            onSupprimer={() => confirm("Supprimer cette fiche et toutes ses réponses ? Le lien envoyé ne marchera plus. Pensez à garder le PDF dans le dossier anti-blanchiment.") && agir(() => supprimerFiche(f.id))}
          />
        ))
      ) : (
        <div className="card">
          <Empty
            icon={<ClipboardList size={22} />}
            title="Aucune fiche envoyée"
            text={vendeur ? "Envoyez le lien au vendeur avant le rendez-vous de mandat : ses réponses arrivent ici." : "Dès qu'un acquéreur veut faire une offre, envoyez-lui le lien : ses réponses arrivent ici."}
          />
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-muted">
        <Lock size={13} className="mt-0.5 shrink-0" /> Le lien marche 30 jours et ne montre que la fiche du client. Les réponses ne sont lisibles que par vous (et le responsable de l&apos;agence). La fiche est effacée du Hub
        après un an : enregistrez son PDF dans le dossier anti-blanchiment du client (à garder 5 ans).
      </p>

      <NouvelleFiche
        open={nouveau}
        kind={kind}
        onClose={() => setNouveau(false)}
        b={b}
        onCree={async ({ contactId, pieces, ...d }) => {
          const r = await creerFiche(kind, b.id, { ...ctx, pieces }, d.prenom ?? "", reponsesInitiales(b, kind, d, contactId));
          setNouveau(false);
          setEnvoi({ dest: d, jeton: r.jeton, tel: d.tel, email: d.email, rempli: true });
          await charger();
        }}
      />

      {voir && (
        <Sheet open onClose={() => setVoir(null)} title={nomFiche(voir)}>
          <Reponses f={voir} prix={b.prix} />
          <div className="mt-4 grid gap-2">
            <Link href={`/imprimer/fiche-client/${b.id}?fiche=${voir.id}`} className="btn-secondary !h-11">
              <FileText size={15} /> Fiche remplie (PDF)
            </Link>
          </div>
        </Sheet>
      )}

      {evaluer && (
        <Evaluation
          f={evaluer}
          prix={b.prix}
          onClose={() => setEvaluer(null)}
          onSave={async (c) => {
            await controlerFiche(evaluer.id, c);
            setEvaluer(null);
            await charger();
          }}
        />
      )}

      {envoi && (
        <Sheet open onClose={() => setEnvoi(null)} title={`Lien pour ${[envoi.dest.prenom, envoi.dest.nom?.toUpperCase()].filter(Boolean).join(" ") || (vendeur ? "le vendeur" : "l'acquéreur")}`}>
          <p className="mb-3 text-sm text-muted">Le message est prêt : vérifiez-le puis envoyez-le. Rien ne part sans vous.</p>
          <pre className="mb-3 whitespace-pre-wrap break-words rounded-xl bg-surface-2 px-4 py-3 font-sans text-[13px]">{messageFiche(kind, envoi.dest, ctx, lienFiche(envoi.jeton), envoi.rempli)}</pre>
          <PartageLien
            texte={messageFiche(kind, envoi.dest, ctx, lienFiche(envoi.jeton), envoi.rempli)}
            sujet={objetFiche(kind, ctx)}
            tel={envoi.tel}
            email={envoi.email}
            url={lienFiche(envoi.jeton)}
          />
          <p className="mt-3 text-center text-xs text-muted">Ce lien ne sera plus affiché ensuite. S&apos;il est perdu, « Nouveau lien » en crée un autre et l&apos;ancien ne marche plus.</p>
        </Sheet>
      )}
    </div>
  );
}

function CarteFiche({
  f,
  b,
  busy,
  onVoir,
  onEvaluer,
  onPreparer,
  onContacts,
  onLien,
  onFermer,
  onSupprimer,
}: {
  f: Fiche;
  b: Bien;
  busy: boolean;
  onVoir: () => void;
  onEvaluer: () => void;
  onPreparer: () => void;
  onContacts: () => void;
  onLien: () => void;
  onFermer: () => void;
  onSupprimer: () => void;
}) {
  const r = f.reponses ?? {};
  const avecNom = !!r.nom?.trim();
  const alertes = f.statut === "a_remplir" ? [] : alertesFiche(f.kind, r, b.prix);
  const manque = manquantsReponses(f.kind, r);
  return (
    <div className={cx("card overflow-hidden animate-fade-up", f.ferme && "opacity-75")}>
      <button type="button" onClick={onVoir} className="card-pad !pb-3 block w-full text-left hover:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-serif text-lg font-semibold">{nomFiche(f)}</div>
            <div className="text-xs text-muted">
              Envoyée le {dateCourte(f.creeLe)}
              {f.maj && f.statut !== "a_remplir" ? ` · modifiée ${ilya(f.maj)}` : ""}
            </div>
          </div>
          {f.ferme ? <Badge>Close</Badge> : <Badge tone={STATUT[f.statut].tone}>{STATUT[f.statut].label}</Badge>}
        </div>
        {f.kind === "acquereur" && r.prixPropose != null && (
          <div className="mt-2 text-sm">
            Prix proposé : <b>{eur(r.prixPropose)}</b>
            {r.financement ? ` · ${r.financement === "pret" ? "avec prêt" : "comptant"}` : ""}
          </div>
        )}
        {f.statut === "en_cours" && manque.length > 0 && <p className="mt-2 text-xs text-muted">Pas encore rempli : {manque.slice(0, 4).join(", ")}{manque.length > 4 ? "…" : ""}</p>}
      </button>
      {alertes.length > 0 && (
        <div className="space-y-1.5 border-t border-line/70 px-5 py-3">
          {alertes.map((a) => (
            <p key={a.texte} className={cx("flex gap-2 text-xs", a.grave ? "text-danger" : "text-fg/80")}>
              <ShieldAlert size={14} className={cx("mt-0.5 shrink-0", a.grave ? "text-danger" : "text-warn")} /> {a.texte}
            </p>
          ))}
        </div>
      )}
      {avecNom && (
        <button type="button" onClick={onEvaluer} className="flex min-h-[52px] w-full items-center gap-3 border-t border-line/70 px-5 py-2.5 text-left hover:bg-surface-2">
          <ShieldCheck size={18} className={cx("shrink-0", controleFait(f.controle) ? "text-ok" : "text-warn")} />
          <span className="min-w-0 flex-1 text-sm">
            {controleFait(f.controle) ? (
              <>
                <span className="font-medium">{RISQUES.find((x) => x.v === f.controle!.risque)?.label}</span>
                <span className="block text-xs text-muted">
                  Évalué {f.controle!.par ? `par ${f.controle!.par} ` : ""}le {dateCourte(f.controle!.le!)}
                  {f.controle!.identiteVerifiee ? " · identité vérifiée" : ""}
                  {f.controle!.justificatifs ? " · justificatifs reçus" : ""}
                </span>
              </>
            ) : (
              <>
                <span className="font-medium">Évaluer le risque</span>
                <span className="block text-xs text-muted">Vigilance anti-blanchiment, repris dans le PDF</span>
              </>
            )}
          </span>
          {controleFait(f.controle) ? <Badge tone={f.controle!.risque === "eleve" ? "danger" : f.controle!.risque === "moyen" ? "warn" : "ok"}>Fait</Badge> : <Badge tone="warn">À faire</Badge>}
        </button>
      )}
      <div className="card-pad !pt-3 space-y-2 border-t border-line/70">
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary !h-11" disabled={!avecNom} onClick={onPreparer}>
            {f.kind === "vendeur" ? <FileSignature size={16} /> : <Handshake size={16} />} {f.kind === "vendeur" ? "Préparer le mandat" : "Préparer l'offre"}
          </button>
          <Link href={`/imprimer/fiche-client/${f.bienId}?fiche=${f.id}`} className={cx("btn-secondary !h-11", !avecNom && "pointer-events-none opacity-50")} aria-disabled={!avecNom}>
            <FileText size={16} /> Fiche remplie (PDF)
          </Link>
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onLien}>
            <RefreshCw size={14} /> Nouveau lien
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={!avecNom} onClick={onContacts}>
            <Users size={14} /> Créer les fiches contact
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onFermer}>
            <Lock size={14} /> {f.ferme ? "Rouvrir" : "Clore"}
          </button>
          <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy} onClick={onSupprimer}>
            <Trash2 size={14} /> Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function Reponses({ f, prix }: { f: Fiche; prix?: number }) {
  const r = f.reponses ?? {};
  const groupes = groupesReponses(f.kind, r)
    .map((g) => ({ ...g, lignes: g.lignes.filter(([, v]) => v) }))
    .filter((g) => g.lignes.length);
  const alertes = alertesFiche(f.kind, r, prix);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={STATUT[f.statut].tone}>{STATUT[f.statut].label}</Badge>
        <span className="text-muted">{TITRE_FICHE[f.kind]}</span>
      </div>
      {alertes.map((a) => (
        <p key={a.texte} className={cx("rounded-xl px-3 py-2 text-xs", a.grave ? "bg-danger/10 text-danger" : "bg-warn/10")}>
          {a.texte}
        </p>
      ))}
      {groupes.length ? (
        groupes.map((g) => (
          <div key={g.titre} className="rounded-2xl bg-surface-2 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{g.titre}</div>
            <dl className="mt-1 text-sm">
              {g.lignes.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-1.5">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 break-words text-right font-medium">
                    {k === "Portable" ? (
                      <a href={`tel:${v!.replace(/[^\d+]/g, "")}`} className="link">
                        {v}
                      </a>
                    ) : k === "E-mail" ? (
                      <a href={`mailto:${v}`} className="link">
                        {v}
                      </a>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted">Rien de rempli pour l&apos;instant.</p>
      )}
    </div>
  );
}

export type Saisie = Destinataire & { tel?: string; email?: string; contactId?: string; pieces: string[] };

function NouvelleFiche({ open, b, kind, onClose, onCree }: { open: boolean; b: Bien; kind: KindFiche; onClose: () => void; onCree: (s: Saisie) => Promise<void> }) {
  const vendeur = kind === "vendeur";
  const { items: contacts } = useCollection("contacts");
  const vide = (): Saisie => ({ pieces: [...PIECES[kind]] });
  const [s, setS] = useState<Saisie>(vide);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (x: Partial<Saisie>) => setS((y) => ({ ...y, ...x }));
  // Choisir un contact du Hub : ses coordonnées et son identité passent dans la fiche
  const choisir = useCallback(
    (id?: string) => {
      const c = id ? contacts.find((x) => x.id === id) : undefined;
      setS((y) => ({
        ...y,
        contactId: c?.id,
        civilite: c?.civilite || undefined,
        prenom: c?.prenom ?? "",
        nom: c?.nom && !c.nom.includes("[À compléter]") ? c.nom : "",
        tel: c?.tel ?? "",
        email: c?.email ?? "",
      }));
    },
    [contacts],
  );
  // Fiche vendeur : le premier propriétaire connu du bien est proposé d'office
  useEffect(() => {
    if (open && vendeur && !s.contactId && !s.nom && b.vendeurIds?.[0] && contacts.some((c) => c.id === b.vendeurIds![0])) choisir(b.vendeurIds[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contacts.length]);
  const creer = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onCree({ ...s, prenom: s.prenom?.trim(), nom: s.nom?.trim(), tel: s.tel?.trim() || undefined, email: s.email?.trim() || undefined });
      setS(vide());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const basculer = (x: string) => set({ pieces: s.pieces.includes(x) ? s.pieces.filter((y) => y !== x) : [...s.pieces, x] });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={TITRE_FICHE[kind]}
      footer={
        <button type="button" className="btn-primary w-full !h-12" disabled={busy || !s.nom?.trim()} onClick={creer}>
          {busy ? <Spinner /> : <Link2 size={16} />} Créer le lien
        </button>
      }
    >
      <div className="space-y-3">
        <Field label={vendeur ? "Propriétaire déjà dans le Hub (facultatif)" : "Acquéreur déjà dans le Hub (facultatif)"} hint="Ce que le Hub sait déjà sur lui et sur le bien est mis dans la fiche : il n'a plus qu'à vérifier et compléter.">
          <ContactPicker value={s.contactId ? [s.contactId] : []} onChange={(ids) => choisir(ids[0])} role={vendeur ? "vendeur" : "acquereur"} max={1} />
        </Field>
        <Field label="Civilité">
          <div className="flex gap-2">
            {(["M.", "Mme"] as const).map((c) => (
              <button key={c} type="button" onClick={() => set({ civilite: s.civilite === c ? undefined : c })} className={cx("chip !h-10 !px-4 !text-sm", s.civilite === c && "!bg-accent/10 !text-accent !border-accent/30")}>
                {c === "M." ? "Monsieur" : "Madame"}
              </button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom">
            <input className="input" value={s.prenom ?? ""} onChange={(e) => set({ prenom: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="Nom">
            <input className="input" value={s.nom ?? ""} onChange={(e) => set({ nom: e.target.value })} autoComplete="off" />
          </Field>
        </div>
        <Field label="Portable (facultatif)" hint="Pour ouvrir le SMS ou WhatsApp directement vers lui.">
          <input className="input" type="tel" inputMode="tel" value={s.tel ?? ""} onChange={(e) => set({ tel: e.target.value })} />
        </Field>
        <Field label="E-mail (facultatif)">
          <input className="input" type="email" inputMode="email" value={s.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium">Documents à lui demander</div>
          <p className="mb-2 text-xs text-muted">Décochez ceux que vous avez déjà : il ne verra que les autres.</p>
          <div className="space-y-1.5">
            {PIECES[kind].map((x) => (
              <label key={x} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line/70 px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={s.pieces.includes(x)} onChange={() => basculer(x)} />
                <span>{x}</span>
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">Une seule fiche suffit pour un couple ou une indivision : il y ajoute les autres personnes.</p>
        {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}

/** Évaluation du risque par l'agence : remplace les cases à cocher du PDF imprimé. */
function Evaluation({ f, prix, onClose, onSave }: { f: Fiche; prix?: number; onClose: () => void; onSave: (c: Controle) => Promise<void> }) {
  const r = f.reponses ?? {};
  const suggere = risqueSuggere(f.kind, r, prix);
  const [c, setC] = useState<Controle>(() => ({ par: nomConseiller() || undefined, le: today(), ...f.controle, risque: f.controle?.risque ?? suggere }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const alertes = alertesFiche(f.kind, r, prix);
  const set = (x: Partial<Controle>) => setC((y) => ({ ...y, ...x }));
  return (
    <Sheet
      open
      onClose={onClose}
      title="Évaluation du risque"
      footer={
        <button
          type="button"
          className="btn-primary w-full !h-12"
          disabled={busy || !c.risque}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await onSave({ ...c, le: c.le || today() });
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : <ShieldCheck size={16} />} Enregistrer l&apos;évaluation
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">{nomFiche(f)}</p>
        {alertes.length ? (
          <div className="space-y-1.5">
            {alertes.map((a) => (
              <p key={a.texte} className={cx("rounded-xl px-3 py-2 text-xs", a.grave ? "bg-danger/10 text-danger" : "bg-warn/10")}>
                {a.texte}
              </p>
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-ok/10 px-3 py-2 text-xs">Aucun point de vigilance particulier dans les réponses.</p>
        )}
        <div>
          <span className="label">Niveau de risque</span>
          <div className="grid grid-cols-3 gap-2">
            {RISQUES.map((x) => (
              <button
                key={x.v}
                type="button"
                onClick={() => set({ risque: x.v })}
                className={cx(
                  "min-h-12 rounded-2xl border px-2 text-sm font-medium transition active:scale-[.97]",
                  c.risque === x.v ? (x.v === "eleve" ? "border-danger bg-danger text-white" : x.v === "moyen" ? "border-warn bg-warn text-white" : "border-ok bg-ok text-white") : "border-line bg-surface"
                )}
              >
                {x.label.replace("Risque ", "")}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">Proposé d&apos;après les réponses : {RISQUES.find((x) => x.v === suggere)?.label.toLowerCase()}. À vous de trancher.</p>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 shrink-0 accent-[#6c191e]" checked={!!c.identiteVerifiee} onChange={(e) => set({ identiteVerifiee: e.target.checked })} />
          Pièce d&apos;identité vérifiée (en cours de validité, conforme à la fiche)
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 shrink-0 accent-[#6c191e]" checked={!!c.justificatifs} onChange={(e) => set({ justificatifs: e.target.checked })} />
          {f.kind === "vendeur" ? "Justificatifs de propriété reçus (titre de propriété)" : "Justificatifs de l'origine des fonds reçus"}
        </label>
        <Field label="Mesures prises, remarques (facultatif)">
          <textarea className="input min-h-[80px] text-sm" value={c.commentaire ?? ""} onChange={(e) => set({ commentaire: e.target.value })} placeholder="Ex. relevé bancaire de l'apport demandé, accord du responsable obtenu le…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contrôlé par">
            <input className="input" value={c.par ?? ""} onChange={(e) => set({ par: e.target.value })} />
          </Field>
          <Field label="Le">
            <input type="date" className="input" value={c.le ?? ""} onChange={(e) => set({ le: e.target.value })} />
          </Field>
        </div>
        {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}
