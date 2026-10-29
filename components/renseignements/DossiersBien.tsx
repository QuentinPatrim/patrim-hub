"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, ClipboardList, FileSignature, FileText, FolderCheck, KeyRound, Link2, Lock, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { Badge, Card, cx, Empty, Field, Sheet, Spinner } from "@/components/ui";
import { PickChip } from "@/components/contacts/bits";
import { ContactPicker } from "@/components/biens/ContactPicker";
import { useCollection } from "@/lib/store";
import { dateCourte, eur, ilya } from "@/lib/format";
import type { Bien } from "@/lib/types";
import { PartageLien } from "./Partage";
import { MailFiche } from "./MailFiche";
import {
  ajouterPersonne,
  changerPieces,
  contactDepuisReponses,
  creerDossier,
  fermerDossier,
  lienPublic,
  listerDossiers,
  logementPublic,
  messageLien,
  nouveauLien,
  preparerBail,
  preparerCaution,
  reponsesInitiales,
  retirerPersonne,
  supprimerDossier,
} from "./client";
import {
  groupesReponses,
  manquantsReponses,
  PIECES,
  PIECES_PAR_DEFAUT,
  piecesDe,
  revenusMensuels,
  rolePersonne,
  type Dossier,
  type PersonneDossier,
  type PiecesDemandees,
} from "./dossier";
import type { Destinataire } from "./client";

/* ============================================================
   Côté conseiller : fiches de renseignements envoyées pour un bien
   à louer, réponses reçues, et passage vers bail et caution.
   ============================================================ */

const STATUT: Record<PersonneDossier["statut"], { label: string; tone: "neutral" | "warn" | "ok" }> = {
  a_remplir: { label: "À remplir", tone: "neutral" },
  en_cours: { label: "Commencée", tone: "warn" },
  termine: { label: "Reçue", tone: "ok" },
};

const nomPersonne = (p: PersonneDossier) => [p.reponses?.prenom || p.prenom, p.reponses?.nom?.toUpperCase()].filter(Boolean).join(" ") || "Sans nom";

type Envoi = {
  personne: Pick<PersonneDossier, "prenom" | "role" | "garantDe">;
  /** Civilité et nom, pour « Bonjour Madame NOM, ». */
  dest: Destinataire;
  jeton: string;
  tel?: string;
  email?: string;
  dossier?: Dossier;
  pieces: PiecesDemandees;
  /** La fiche part avec ce que le Hub savait déjà. */
  prerempli?: boolean;
};

const destDe = (p: PersonneDossier): Destinataire => ({ civilite: p.reponses?.civilite, prenom: p.reponses?.prenom || p.prenom, nom: p.reponses?.nom });

/** Carte de la fiche du bien : résumé et accès à la page. */
export function RenseignementsCarte({ b }: { b: Bien }) {
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  useEffect(() => {
    listerDossiers(b.id)
      .then(setDossiers)
      .catch(() => setDossiers([]));
  }, [b.id]);
  const recues = dossiers?.reduce((n, d) => n + d.personnes.filter((p) => p.statut === "termine").length, 0) ?? 0;
  return (
    <Card title="Candidats">
      <p className="text-sm text-muted">
        {dossiers?.length
          ? `${dossiers.length} dossier${dossiers.length > 1 ? "s" : ""} · ${recues} fiche${recues > 1 ? "s" : ""} reçue${recues > 1 ? "s" : ""}`
          : "Envoyez la fiche de renseignements par lien : le candidat la remplit en ligne, sur téléphone ou ordinateur, avec ses colocataires et ses garants."}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Link href={`/biens/${b.id}/renseignements?nouveau=1`} className="btn-primary !h-11">
          <Link2 size={16} /> Envoyer la fiche à remplir
        </Link>
        <Link href={`/biens/${b.id}/renseignements`} className="btn-secondary !h-11">
          <ClipboardList size={16} /> Renseignements reçus
        </Link>
      </div>
    </Card>
  );
}

export function DossiersBien({ b }: { b: Bien }) {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [envoi, setEnvoi] = useState<Envoi | null>(null);
  const [voir, setVoir] = useState<{ d: Dossier; p: PersonneDossier } | null>(null);
  const [ajout, setAjout] = useState<Dossier | null>(null);
  const [pieces, setPieces] = useState<Dossier | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    try {
      const ds = await listerDossiers(b.id);
      setDossiers(ds);
      setErr(null);
      return ds;
    } catch (e) {
      setErr((e as Error).message);
      setDossiers((x) => x ?? []);
      return null;
    }
  }, [b.id]);

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

  const renvoyer = (d: Dossier, p: PersonneDossier) =>
    agir(async () => {
      const { jeton } = await nouveauLien(p.id);
      setVoir(null);
      setEnvoi({ personne: p, dest: destDe(p), jeton, tel: p.reponses?.tel, email: p.reponses?.email, dossier: d, pieces: d.logement.pieces ?? {} });
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted animate-fade-up">
        Le candidat reçoit un lien personnel, remplit sa fiche en ligne (téléphone ou ordinateur), puis ajoute lui-même son conjoint, ses colocataires et ses garants. Chacun a son propre lien et ne voit que sa fiche.
      </p>
      <button type="button" className="btn-primary w-full !h-12" onClick={() => setNouveau(true)}>
        <UserPlus size={17} /> Nouveau candidat
      </button>
      {err && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>}

      {dossiers == null ? (
        <div className="skeleton h-40 !rounded-3xl" />
      ) : dossiers.length ? (
        dossiers.map((d) => (
          <CarteDossier
            key={d.id}
            d={d}
            busy={busy}
            onVoir={(p) => setVoir({ d, p })}
            onAjouter={() => setAjout(d)}
            onPieces={() => setPieces(d)}
            onBail={() => {
              preparerBail(b, d);
              router.push(`/biens/${b.id}/bail`);
            }}
            onCaution={(g) => {
              preparerCaution(b, d, g);
              router.push(`/biens/${b.id}/caution`);
            }}
            onContacts={() => {
              d.personnes.filter((p) => p.reponses?.nom).forEach((p) => contactDepuisReponses(p.reponses!, p.role, b.id));
              setErr(null);
              alert("Fiches contact créées ou complétées.");
            }}
            onFermer={() => agir(() => fermerDossier(d.id, !d.ferme))}
            onSupprimer={() => confirm("Supprimer ce dossier et toutes les réponses ? Les liens envoyés ne marcheront plus.") && agir(() => supprimerDossier(d.id))}
          />
        ))
      ) : (
        <div className="card">
          <Empty icon={<ClipboardList size={22} />} title="Aucune fiche envoyée" text="Après une visite, envoyez le lien au candidat : ses réponses arrivent ici." />
        </div>
      )}
      <p className="flex items-start gap-2 text-xs text-muted">
        <Lock size={13} className="mt-0.5 shrink-0" /> Les liens marchent 30 jours. Les dossiers sont effacés automatiquement trois mois après leur création (candidatures non retenues).
      </p>

      <NouveauCandidat
        open={nouveau}
        onClose={() => setNouveau(false)}
        onCree={async ({ contactId, pieces, tel, email, ...dest }) => {
          const reponses = reponsesInitiales({ ...dest, tel, email }, contactId);
          const r = await creerDossier(b.id, { ...logementPublic(b), pieces }, dest.prenom ?? "", reponses);
          setNouveau(false);
          setEnvoi({ personne: { prenom: dest.prenom ?? "", role: "locataire" }, dest, jeton: r.jeton, tel: reponses.tel, email: reponses.email, pieces, prerempli: true });
          await charger();
        }}
      />

      {ajout && (
        <AjoutPersonne
          d={ajout}
          onClose={() => setAjout(null)}
          onAjoute={async ({ role, garantDe, contactId, tel, email, ...dest }) => {
            const reponses = reponsesInitiales({ ...dest, tel, email }, contactId);
            const r = await ajouterPersonne(ajout.id, role, dest.prenom ?? "", garantDe, reponses);
            setAjout(null);
            setEnvoi({ personne: { prenom: dest.prenom ?? "", role, garantDe }, dest, jeton: r.jeton, tel: reponses.tel, email: reponses.email, dossier: ajout, pieces: ajout.logement.pieces ?? {}, prerempli: true });
            await charger();
          }}
        />
      )}

      {pieces && (
        <PiecesDossier
          d={pieces}
          onClose={() => setPieces(null)}
          onSave={(x) =>
            agir(async () => {
              await changerPieces(pieces.id, x);
              setPieces(null);
            })
          }
        />
      )}

      {voir && (
        <Sheet open onClose={() => setVoir(null)} title={nomPersonne(voir.p)}>
          <Renseignements p={voir.p} d={voir.d} />
          <div className="mt-4 grid gap-2">
            <button type="button" className="btn-secondary !h-11" disabled={busy} onClick={() => renvoyer(voir.d, voir.p)}>
              <RefreshCw size={15} /> Renvoyer un lien
            </button>
            {!voir.p.principal && (
              <button
                type="button"
                className="btn-ghost !h-10 text-danger"
                disabled={busy}
                onClick={() => confirm(`Retirer ${nomPersonne(voir.p)} du dossier ?`) && agir(async () => (await retirerPersonne(voir.p.id), setVoir(null)))}
              >
                <Trash2 size={15} /> Retirer du dossier
              </button>
            )}
            <p className="text-center text-xs text-muted">Un nouveau lien remplace l&apos;ancien, qui ne marche plus.</p>
          </div>
        </Sheet>
      )}

      {envoi && (
        <EnvoiLien b={b} envoi={envoi} onClose={() => setEnvoi(null)} />
      )}
    </div>
  );
}

function CarteDossier({
  d,
  busy,
  onVoir,
  onAjouter,
  onPieces,
  onBail,
  onCaution,
  onContacts,
  onFermer,
  onSupprimer,
}: {
  d: Dossier;
  busy: boolean;
  onVoir: (p: PersonneDossier) => void;
  onAjouter: () => void;
  onPieces: () => void;
  onBail: () => void;
  onCaution: (g: PersonneDossier) => void;
  onContacts: () => void;
  onFermer: () => void;
  onSupprimer: () => void;
}) {
  const principal = d.personnes.find((p) => p.principal);
  const locataires = d.personnes.filter((p) => p.role !== "garant");
  const garants = d.personnes.filter((p) => p.role === "garant" && p.reponses?.nom);
  const loyerCc = (d.logement.loyer ?? 0) + (d.logement.charges ?? 0);
  const revenus = locataires.reduce((n, p) => n + revenusMensuels(p.reponses), 0);
  const fois = loyerCc && revenus ? revenus / loyerCc : 0;
  const recues = d.personnes.filter((p) => p.statut === "termine").length;
  const avecNom = locataires.some((p) => p.reponses?.nom);

  return (
    <div className={cx("card overflow-hidden animate-fade-up", d.ferme && "opacity-75")}>
      <div className="card-pad !pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-serif text-lg font-semibold">{principal ? nomPersonne(principal) : "Dossier"}</div>
            <div className="text-xs text-muted">
              Envoyé le {dateCourte(d.creeLe)} · {recues}/{d.personnes.length} fiche{d.personnes.length > 1 ? "s" : ""} reçue{recues > 1 ? "s" : ""}
            </div>
          </div>
          {d.ferme ? <Badge>Clos</Badge> : recues === d.personnes.length ? <Badge tone="ok">Complet</Badge> : <Badge tone="warn">En cours</Badge>}
        </div>
        {revenus > 0 && loyerCc > 0 && (
          <div className={cx("mt-3 rounded-xl px-3 py-2 text-sm", fois >= 3 ? "bg-ok/10" : "bg-warn/10")}>
            Revenus des locataires : <b>{eur(revenus)}</b> par mois, soit <b>{fois.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} fois</b> le loyer charges comprises.
          </div>
        )}
      </div>
      <div className="divide-y divide-line/70 border-t border-line/70">
        {d.personnes.map((p) => (
          <button key={p.id} type="button" onClick={() => onVoir(p)} className={cx("flex min-h-[56px] w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2", p.role === "garant" && "pl-9")}>
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", p.role === "garant" ? "bg-accent/10 text-accent" : "bg-brand/10 text-brand")}>
              {p.role === "garant" ? <ShieldCheck size={16} /> : (p.prenom[0] ?? "?").toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{nomPersonne(p)}</span>
              <span className="block text-xs text-muted">
                {rolePersonne(p, d.personnes)}
                {p.maj && p.statut !== "a_remplir" ? ` · ${ilya(p.maj)}` : ""}
              </span>
            </span>
            <Badge tone={STATUT[p.statut].tone}>{STATUT[p.statut].label}</Badge>
            <ChevronRight size={16} className="shrink-0 text-muted" />
          </button>
        ))}
      </div>
      <div className="card-pad !pt-3 space-y-2 border-t border-line/70">
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="btn-primary !h-11" disabled={!avecNom} onClick={onBail}>
            <KeyRound size={16} /> Préparer le bail
          </button>
          <Link href={`/imprimer/candidat/${d.bienId}?dossier=${d.id}`} className={cx("btn-secondary !h-11", !recues && "pointer-events-none opacity-50")} aria-disabled={!recues}>
            <FileText size={16} /> Fiche remplie (PDF)
          </Link>
          {garants.map((g) => (
            <button key={g.id} type="button" className="btn-secondary !h-11" onClick={() => onCaution(g)}>
              <FileSignature size={16} /> Caution de {g.reponses?.prenom || g.prenom}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn-ghost btn-sm" disabled={busy || d.ferme} onClick={onAjouter}>
            <Plus size={14} /> Ajouter une personne
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onPieces}>
            <FolderCheck size={14} /> Documents demandés
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={!avecNom && !garants.length} onClick={onContacts}>
            <Users size={14} /> Créer les fiches contact
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={onFermer}>
            <Lock size={14} /> {d.ferme ? "Rouvrir" : "Clore"}
          </button>
          <button type="button" className="btn-ghost btn-sm text-danger" disabled={busy} onClick={onSupprimer}>
            <Trash2 size={14} /> Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function Renseignements({ p, d }: { p: PersonneDossier; d: Dossier }) {
  const r = p.reponses ?? {};
  const manque = manquantsReponses(r);
  const groupes = groupesReponses(r).map((g) => ({ ...g, lignes: g.lignes.filter(([, v]) => v) })).filter((g) => g.lignes.length);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={STATUT[p.statut].tone}>{STATUT[p.statut].label}</Badge>
        <span className="text-muted">{rolePersonne(p, d.personnes)}</span>
      </div>
      {p.statut !== "termine" && manque.length > 0 && <p className="rounded-xl bg-warn/10 px-3 py-2 text-xs">Pas encore rempli : {manque.join(", ")}.</p>}
      {groupes.length ? (
        groupes.map((g) => (
          <div key={g.titre} className="rounded-2xl bg-surface-2 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{g.titre}</div>
            <dl className="mt-1 text-sm">
              {g.lignes.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-1.5">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 break-words text-right font-medium">
                    {k === "Portable" ? <a href={`tel:${v!.replace(/[^\d+]/g, "")}`} className="link">{v}</a> : k === "E-mail" ? <a href={`mailto:${v}`} className="link">{v}</a> : v}
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

type Saisie = Destinataire & { tel?: string; email?: string; contactId?: string };

/** Identité de la personne : un contact du Hub (tout se remplit) ou civilité, prénom, nom. */
function ChampsPersonne({ s, set, avecCoordonnees = true }: { s: Saisie; set: (x: Partial<Saisie>) => void; avecCoordonnees?: boolean }) {
  const { items: contacts } = useCollection("contacts");
  const choisir = (id?: string) => {
    const c = id ? contacts.find((x) => x.id === id) : undefined;
    set({
      contactId: c?.id,
      civilite: c?.civilite || undefined,
      prenom: c?.prenom ?? "",
      nom: c?.nom && !c.nom.includes("[À compléter]") ? c.nom : "",
      tel: c?.tel ?? "",
      email: c?.email ?? "",
    });
  };
  return (
    <>
      <Field label="Déjà dans le Hub ? (facultatif)" hint="Son identité, ses coordonnées et son adresse partent dans la fiche : il n'a plus qu'à vérifier et compléter.">
        <ContactPicker value={s.contactId ? [s.contactId] : []} onChange={(ids) => choisir(ids[0])} role="locataire" max={1} />
      </Field>
      <Field label="Civilité">
        <div className="flex gap-2">
          {(["M.", "Mme"] as const).map((c) => (
            <button key={c} type="button" onClick={() => set({ civilite: s.civilite === c ? undefined : c })} className={cx("chip !h-10 !px-4 !text-sm", s.civilite === c && "!border-accent/30 !bg-accent/10 !text-accent")}>
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
      {avecCoordonnees && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Portable (facultatif)">
            <input className="input" type="tel" inputMode="tel" value={s.tel ?? ""} onChange={(e) => set({ tel: e.target.value })} />
          </Field>
          <Field label="E-mail (facultatif)">
            <input className="input" type="email" inputMode="email" value={s.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
      )}
    </>
  );
}

/** Cases des documents à demander : on décoche ce qu'on a déjà. */
function ChoixPieces({ value, onChange, roles = ["locataire", "garant"] }: { value: PiecesDemandees; onChange: (v: PiecesDemandees) => void; roles?: (keyof PiecesDemandees)[] }) {
  const basculer = (k: keyof PiecesDemandees, x: string) => {
    const l = value[k] ?? [];
    onChange({ ...value, [k]: l.includes(x) ? l.filter((y) => y !== x) : [...l, x] });
  };
  return (
    <div className="space-y-3">
      {roles.map((k) => (
        <div key={k}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{k === "garant" ? "Pour chaque garant" : "Pour le locataire (et chaque colocataire)"}</div>
          <div className="space-y-1.5">
            {PIECES[k].map((x) => (
              <label key={x} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line/70 px-3 py-2.5 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" checked={(value[k] ?? []).includes(x)} onChange={() => basculer(k, x)} />
                <span>{x}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function NouveauCandidat({ open, onClose, onCree }: { open: boolean; onClose: () => void; onCree: (s: Saisie & { pieces: PiecesDemandees }) => Promise<void> }) {
  const vide = () => ({ pieces: { ...PIECES_PAR_DEFAUT } });
  const [s, setS] = useState<Saisie & { pieces: PiecesDemandees }>(vide);
  const [docs, setDocs] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (x: Partial<Saisie & { pieces: PiecesDemandees }>) => setS((y) => ({ ...y, ...x }));
  const nb = (s.pieces.locataire?.length ?? 0) + (s.pieces.garant?.length ?? 0);
  const creer = async () => {
    setBusy(true);
    setErr(null);
    try {
      await onCree({ ...s, prenom: s.prenom?.trim(), nom: s.nom?.trim(), tel: s.tel?.trim() || undefined, email: s.email?.trim() || undefined });
      setS(vide());
      setDocs(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nouveau candidat"
      footer={
        <button type="button" className="btn-primary w-full !h-12" disabled={busy || !s.prenom?.trim() || !s.nom?.trim()} onClick={creer}>
          {busy ? <Spinner /> : <Link2 size={16} />} Créer son lien
        </button>
      }
    >
      <div className="space-y-3">
        <ChampsPersonne s={s} set={set} />
        <button type="button" onClick={() => setDocs((x) => !x)} className="flex min-h-12 w-full items-center gap-3 rounded-xl bg-surface-2 px-4 text-left text-sm">
          <FolderCheck size={17} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Documents à lui demander</span>
            <span className="block text-xs text-muted">{nb ? `${nb} document${nb > 1 ? "s" : ""} coché${nb > 1 ? "s" : ""} · décochez ceux que vous avez déjà` : "Aucun : rien ne lui sera demandé"}</span>
          </span>
          <ChevronRight size={16} className={cx("shrink-0 text-muted transition", docs && "rotate-90")} />
        </button>
        {docs && <ChoixPieces value={s.pieces} onChange={(pieces) => set({ pieces })} />}
        {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}

function AjoutPersonne({ d, onClose, onAjoute }: { d: Dossier; onClose: () => void; onAjoute: (x: Saisie & { role: "colocataire" | "garant"; garantDe?: string }) => Promise<void> }) {
  const locataires = useMemo(() => d.personnes.filter((p) => p.role !== "garant"), [d]);
  const [role, setRole] = useState<"colocataire" | "garant">("garant");
  const [s, setS] = useState<Saisie>({});
  const [pour, setPour] = useState<string | undefined>(locataires.length === 1 ? locataires[0].id : undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Ajouter une personne"
      footer={
        <button
          type="button"
          className="btn-primary w-full !h-12"
          disabled={busy || !s.prenom?.trim() || !s.nom?.trim() || (role === "garant" && !pour)}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await onAjoute({ ...s, prenom: s.prenom?.trim(), nom: s.nom?.trim(), role, garantDe: role === "garant" ? pour : undefined });
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Link2 size={16} /> Créer son lien
        </button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <PickChip active={role === "garant"} onClick={() => setRole("garant")}>
            Garant
          </PickChip>
          <PickChip active={role === "colocataire"} onClick={() => setRole("colocataire")}>
            Conjoint ou colocataire
          </PickChip>
        </div>
        {role === "garant" && (
          <div>
            <span className="label">Garant de</span>
            <div className="flex flex-wrap gap-2">
              {locataires.map((l) => (
                <PickChip key={l.id} active={pour === l.id} onClick={() => setPour(l.id)}>
                  {nomPersonne(l)}
                </PickChip>
              ))}
            </div>
          </div>
        )}
        <ChampsPersonne s={s} set={(x) => setS((y) => ({ ...y, ...x }))} />
        {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
      </div>
    </Sheet>
  );
}

/** Documents demandés pour un dossier déjà envoyé : les liens restent valables. */
function PiecesDossier({ d, onClose, onSave }: { d: Dossier; onClose: () => void; onSave: (x: PiecesDemandees) => void }) {
  const [v, setV] = useState<PiecesDemandees>(d.logement.pieces ?? {});
  return (
    <Sheet
      open
      onClose={onClose}
      title="Documents demandés"
      footer={
        <button type="button" className="btn-primary w-full !h-12" onClick={() => onSave(v)}>
          Enregistrer
        </button>
      }
    >
      <p className="mb-3 text-sm text-muted">Cochez ce que vous attendez encore. La liste s&apos;affiche dans leur fiche en ligne ; les liens déjà envoyés restent valables.</p>
      <ChoixPieces value={v} onChange={setV} />
    </Sheet>
  );
}

/** Le lien vient d'être créé : mail formel sur la trame de l'agence, ou message court. */
function EnvoiLien({ b, envoi, onClose }: { b: Bien; envoi: Envoi; onClose: () => void }) {
  const logement = envoi.dossier?.logement ?? logementPublic(b);
  const url = lienPublic(envoi.jeton);
  const deQui = envoi.dossier?.personnes.find((p) => p.id === envoi.personne.garantDe)?.prenom;
  const message = messageLien(envoi.dest, envoi.personne.role, logement, url, deQui);
  const nom = [envoi.dest.civilite === "M." ? "M." : envoi.dest.civilite === "Mme" ? "Mme" : "", envoi.dest.prenom, envoi.dest.nom?.toUpperCase()].filter(Boolean).join(" ");
  return (
    <Sheet open onClose={onClose} title={`Lien pour ${nom || "le candidat"}`}>
      <p className="mb-3 text-sm text-muted">Le mail est prêt, sur la trame de l&apos;agence : vérifiez-le puis envoyez-le. Rien ne part sans vous.</p>
      <MailFiche
        bienId={b.id}
        dest={envoi.dest}
        pieces={piecesDe({ pieces: envoi.pieces }, envoi.personne.role)}
        prerempli={envoi.prerempli}
        role={envoi.personne.role}
        logement={logement}
        url={url}
        deQui={deQui}
        garants={envoi.dossier?.personnes.filter((p) => p.role === "garant").map((p) => p.reponses?.prenom || p.prenom)}
        email={envoi.email}
      />
      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Ou un message court par SMS ou WhatsApp</p>
      <pre className="mb-3 whitespace-pre-wrap break-words rounded-xl bg-surface-2 px-4 py-3 font-sans text-[13px]">{message}</pre>
      <PartageLien texte={message} sujet={`Votre fiche de renseignements – ${logement.titre}`} tel={envoi.tel} email={envoi.email} url={url} />
      <p className="mt-3 text-center text-xs text-muted">Ce lien ne sera plus affiché ensuite. S&apos;il est perdu, « Renvoyer un lien » en crée un nouveau.</p>
    </Sheet>
  );
}
