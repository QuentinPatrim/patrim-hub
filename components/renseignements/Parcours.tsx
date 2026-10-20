"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronRight, Clock, Lock, Phone, Plus, ShieldCheck, UserRound, Users, X } from "lucide-react";
import { cx, Field } from "@/components/ui";
import { PartageLien } from "./Partage";
import {
  LOGEMENTS_ACTUELS,
  SITUATIONS_FAMILIALES,
  SITUATIONS_PRO,
  libelle,
  manquantsReponses,
  rolePersonne,
  groupesReponses,
  sansEmploiSalarie,
  type PersonneDossier,
  type Reponses,
  type VuePublique,
} from "./dossier";

/* ============================================================
   Page publique de la fiche de renseignements, ouverte par le
   candidat locataire ou son garant depuis le lien reçu par SMS ou
   mail. Elle ne parle qu'à /api/renseignements/<jeton> : aucun
   accès au reste du Hub (ni store, ni compte, ni autre donnée).
   ============================================================ */

const eur = (n?: number) => (n == null ? "" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`);
const dateFr = (ymd?: string) => (ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
const CLE_LIENS = "patrim-renseignements:liens";

type Ecran = "accueil" | "fiche" | "merci" | "foyer";
const ETAPES = ["Identité", "Coordonnées", "Situation", "Travail et revenus", "Vérification"] as const;

function lireLiens(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(CLE_LIENS) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function garderLien(id: string, jeton: string) {
  try {
    sessionStorage.setItem(CLE_LIENS, JSON.stringify({ ...lireLiens(), [id]: jeton }));
  } catch {}
}

export function Parcours({ jeton }: { jeton: string }) {
  const [vue, setVue] = useState<VuePublique | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecran, setEcran] = useState<Ecran>("accueil");
  const [etape, setEtape] = useState(0);
  const [r, setR] = useState<Reponses>({});
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const appeler = useCallback(
    async (corps?: unknown) => {
      const res = await fetch(`/api/renseignements/${jeton}`, {
        method: corps ? "POST" : "GET",
        headers: corps ? { "content-type": "application/json" } : undefined,
        body: corps ? JSON.stringify(corps) : undefined,
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((j.error as string) || "Le service ne répond pas pour l'instant. Réessayez dans un instant.");
      return j;
    },
    [jeton]
  );

  useEffect(() => {
    appeler()
      .then((j) => {
        const v = j as unknown as VuePublique;
        setVue(v);
        setR(v.moi.reponses ?? {});
      })
      .catch((e: Error) => setErreur(e.message));
  }, [appeler]);

  useEffect(() => {
    document.title = "Fiche de renseignements · PATRIM";
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [ecran, etape]);

  const enregistrer = async (terminer = false) => {
    setEnvoi(true);
    setMsg(null);
    try {
      const v = (await appeler({ action: "enregistrer", reponses: r, terminer })) as unknown as VuePublique;
      if (v.moi) setVue(v);
      return true;
    } catch (e) {
      setMsg((e as Error).message);
      return false;
    } finally {
      setEnvoi(false);
    }
  };

  if (erreur)
    return (
      <Cadre>
        <div className="card card-pad mt-6 text-center animate-fade-up">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
            <Lock size={22} />
          </span>
          <h1 className="mt-3 font-serif text-xl font-semibold">Lien indisponible</h1>
          <p className="mt-2 text-sm text-muted">{erreur}</p>
        </div>
      </Cadre>
    );
  if (!vue)
    return (
      <Cadre>
        <div className="skeleton mt-6 h-48 !rounded-3xl" />
        <div className="skeleton mt-4 h-24 !rounded-3xl" />
      </Cadre>
    );

  const moi = vue.moi;
  const foyer = vue.foyer ?? [];
  const role = rolePersonne(moi, foyer);
  const manque = manquantsReponses(r);

  if (ecran === "fiche")
    return (
      <Cadre>
        <div className="sticky top-0 z-10 -mx-4 bg-bg/90 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
          <div className="flex items-center gap-3">
            <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Retour" onClick={() => (etape ? setEtape(etape - 1) : setEcran("accueil"))}>
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Étape {etape + 1} sur {ETAPES.length}
              </div>
              <div className="font-serif text-lg font-semibold leading-tight">{ETAPES[etape]}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-1">
            {ETAPES.map((e, i) => (
              <span key={e} className={cx("h-1 flex-1 rounded-full transition", i <= etape ? "bg-brand" : "bg-line")} />
            ))}
          </div>
        </div>

        <div key={etape} className="mt-2 space-y-4 animate-fade-up">
          {etape === 0 && <EtapeIdentite r={r} setR={setR} />}
          {etape === 1 && <EtapeCoordonnees r={r} setR={setR} />}
          {etape === 2 && <EtapeSituation r={r} setR={setR} moi={moi} foyer={foyer} />}
          {etape === 3 && <EtapeTravail r={r} setR={setR} />}
          {etape === 4 && <EtapeVerification r={r} setR={setR} manque={manque} allerA={setEtape} />}
        </div>

        {msg && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{msg}</p>}
        <div className="mt-6 pb-[max(16px,env(safe-area-inset-bottom))]">
          {etape < ETAPES.length - 1 ? (
            <button
              type="button"
              className="btn-primary w-full !h-12"
              disabled={envoi}
              onClick={async () => {
                if (await enregistrer()) setEtape(etape + 1);
              }}
            >
              Continuer <ArrowRight size={17} />
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary w-full !h-12"
              disabled={envoi || manque.length > 0 || !r.accord}
              onClick={async () => {
                if (await enregistrer(true)) setEcran("merci");
              }}
            >
              <Check size={17} /> Envoyer ma fiche
            </button>
          )}
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
            <Lock size={11} /> Vos réponses sont enregistrées à chaque étape.
          </p>
        </div>
      </Cadre>
    );

  if (ecran === "merci")
    return (
      <Cadre>
        <div className="card card-pad mt-6 text-center animate-fade-up">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-ok/15 text-ok">
            <Check size={28} />
          </span>
          <h1 className="mt-4 font-serif text-2xl font-semibold">Merci {r.prenom || moi.prenom} !</h1>
          <p className="mt-2 text-sm text-muted">Votre fiche est bien arrivée chez votre conseiller PATRIM. Vous pourrez encore la corriger avec ce même lien.</p>
          {moi.principal ? (
            <div className="mt-5 space-y-2">
              <button type="button" className="btn-primary w-full !h-12" onClick={() => setEcran("foyer")}>
                <Users size={17} /> Ajouter conjoint, colocataire ou garant
              </button>
              <button type="button" className="btn-ghost w-full !h-11" onClick={() => setEcran("accueil")}>
                Revenir à mon dossier
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary mt-5 w-full !h-11" onClick={() => setEcran("accueil")}>
              Revenir à ma fiche
            </button>
          )}
        </div>
      </Cadre>
    );

  if (ecran === "foyer" && moi.principal)
    return (
      <Cadre>
        <div className="flex items-center gap-3 pt-[max(12px,env(safe-area-inset-top))]">
          <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Retour" onClick={() => setEcran("accueil")}>
            <ArrowLeft size={18} />
          </button>
          <div className="font-serif text-xl font-semibold">Les personnes du dossier</div>
        </div>
        <Foyer vue={vue} appeler={appeler} recharger={async () => setVue((await appeler()) as unknown as VuePublique)} />
      </Cadre>
    );

  /* ---------- Accueil ---------- */
  const autres = foyer.filter((p) => p.id !== moi.id);
  return (
    <Cadre>
      <Entete vue={vue} />
      <div className="mt-5 space-y-3 animate-fade-up">
        <p className="text-sm text-muted">
          Bonjour{moi.prenom ? ` ${moi.prenom}` : ""}, {moi.role === "garant" ? `vous vous portez garant${foyer[0]?.prenom ? ` de ${foyer[0].prenom}` : ""} pour ce logement. Remplissez` : "remplissez"} votre fiche en quelques minutes : elle remplace la fiche papier.
        </p>
        <Tuile
          n={1}
          titre={moi.principal ? "Vos renseignements" : `Vos renseignements · ${role}`}
          texte={moi.statut === "termine" ? "Fiche envoyée. Touchez pour la corriger." : moi.statut === "en_cours" ? "Commencée : reprenez où vous en étiez." : "Identité, coordonnées, situation, revenus."}
          statut={moi.statut}
          onClick={() => {
            setEtape(moi.statut === "termine" ? ETAPES.length - 1 : 0);
            setEcran("fiche");
          }}
        />
        {moi.principal && (
          <Tuile
            n={2}
            titre="Conjoint, colocataires et garants"
            texte={autres.length ? `${autres.length} personne${autres.length > 1 ? "s" : ""} ajoutée${autres.length > 1 ? "s" : ""} · ${autres.filter((p) => p.statut === "termine").length} fiche(s) reçue(s)` : "Chacun reçoit son propre lien et remplit sa fiche."}
            statut={autres.length && autres.every((p) => p.statut === "termine") ? "termine" : autres.length ? "en_cours" : "a_remplir"}
            onClick={() => setEcran("foyer")}
          />
        )}
      </div>
      <Confidentialite conseiller={vue.logement.conseiller} expire={vue.expire} />
    </Cadre>
  );
}

/* ---------- Mise en page ---------- */

function Cadre({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-dvh w-full max-w-lg bg-bg px-4 pb-10">{children}</main>;
}

function Entete({ vue }: { vue: VuePublique }) {
  const l = vue.logement;
  const cc = l.loyer != null ? l.loyer + (l.charges ?? 0) : undefined;
  return (
    <header className="-mx-4 overflow-hidden bg-ink text-white sm:mt-4 sm:rounded-3xl">
      <div className="relative isolate px-5 pb-6 pt-[max(20px,env(safe-area-inset-top))]">
        {l.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={l.photo} alt="" referrerPolicy="no-referrer" className="absolute inset-0 -z-20 size-full object-cover opacity-30" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />
        <div className="flex items-center gap-2.5">
          <Image src="/emblem.png" alt="" width={34} height={34} className="rounded-lg ring-1 ring-white/15" />
          <div className="text-[13px] font-semibold tracking-[0.24em]">PATRIM</div>
        </div>
        <div className="mt-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
          <span className="h-px w-5 bg-coral" /> Fiche de renseignements
        </div>
        <h1 className="mt-2 font-serif text-[26px] font-semibold leading-tight">{l.titre}</h1>
        {l.ville && <div className="mt-1 text-sm text-white/70">{l.ville}{l.meuble != null ? ` · Location ${l.meuble ? "meublée" : "vide"}` : ""}</div>}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {cc != null && <Chiffre label="Loyer + charges" value={eur(cc)} />}
          {l.depot != null && <Chiffre label="Dépôt de garantie" value={eur(l.depot)} />}
          {l.entree ? <Chiffre label="Entrée prévue" value={new Date(l.entree + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} /> : l.honoraires != null ? <Chiffre label="Honoraires" value={eur(l.honoraires)} /> : null}
        </div>
      </div>
    </header>
  );
}

function Chiffre({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.08] px-2.5 py-2 ring-1 ring-inset ring-white/10">
      <div className="truncate text-[10px] text-white/60">{label}</div>
      <div className="mt-0.5 truncate font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Tuile({ n, titre, texte, statut, onClick }: { n: number; titre: string; texte: string; statut: PersonneDossier["statut"]; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card card-pad card-hover flex w-full items-center gap-3 text-left">
      <span className={cx("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold", statut === "termine" ? "bg-ok/15 text-ok" : "bg-brand/10 text-brand")}>
        {statut === "termine" ? <Check size={18} /> : n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{titre}</span>
        <span className="block text-xs text-muted">{texte}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-muted" />
    </button>
  );
}

const STATUT: Record<PersonneDossier["statut"], { label: string; cls: string }> = {
  a_remplir: { label: "À remplir", cls: "bg-surface-2 text-muted" },
  en_cours: { label: "Commencée", cls: "bg-warn/15 text-warn" },
  termine: { label: "Reçue", cls: "bg-ok/15 text-ok" },
};
function Statut({ s }: { s: PersonneDossier["statut"] }) {
  return <span className={cx("inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-semibold", STATUT[s].cls)}>{STATUT[s].label}</span>;
}

function Confidentialite({ conseiller, expire }: { conseiller?: VuePublique["logement"]["conseiller"]; expire: string }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-xs text-muted">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
        <p>
          Ce lien est personnel : ne le transférez pas. Vos réponses ne sont visibles que par l&apos;agence PATRIM et servent uniquement à étudier la candidature. Elles sont effacées au plus tard trois mois après l&apos;ouverture du dossier si la
          location ne se fait pas. Lien valable jusqu&apos;au {dateFr(expire.slice(0, 10))}.
        </p>
      </div>
      {conseiller && (
        <div className="card card-pad flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
            <UserRound size={18} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-xs text-muted">Une question ? Votre conseiller</div>
            <div className="font-semibold">{conseiller.nom}</div>
          </div>
          {conseiller.tel && (
            <a href={`tel:${conseiller.tel.replace(/[^\d+]/g, "")}`} className="btn-secondary !h-10 shrink-0">
              <Phone size={15} /> Appeler
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Champs ---------- */

type SetR = (f: (r: Reponses) => Reponses) => void;
type PropsEtape = { r: Reponses; setR: SetR };

function Choix<T extends string>({ items, value, onChange }: { items: { v: T; label: string }[]; value?: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button
          key={i.v}
          type="button"
          onClick={() => onChange(i.v)}
          className={cx("h-11 rounded-full border px-4 text-sm font-medium transition active:scale-[.97]", value === i.v ? "border-brand bg-brand text-white shadow-sm" : "border-line bg-surface text-fg/80")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Texte({ r, setR, k, label, hint, ...rest }: PropsEtape & { k: keyof Reponses; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint}>
      <input className="input !h-12 !text-base" value={(r[k] as string) ?? ""} onChange={(e) => setR((x) => ({ ...x, [k]: e.target.value }))} {...rest} />
    </Field>
  );
}

function Montant({ r, setR, k, label, hint }: PropsEtape & { k: "loyerActuel" | "salaire" | "autresRevenus"; label: string; hint?: string }) {
  const [s, setS] = useState(r[k] != null ? String(r[k]).replace(".", ",") : "");
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          className="input !h-12 pr-10 !text-base"
          inputMode="decimal"
          value={s}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d,.\s]/g, "");
            setS(v);
            const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
            setR((x) => ({ ...x, [k]: Number.isFinite(n) ? n : undefined }));
          }}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">€</span>
      </div>
    </Field>
  );
}

function EtapeIdentite({ r, setR }: PropsEtape) {
  return (
    <>
      <div>
        <span className="label">Civilité</span>
        <Choix items={[{ v: "Mme" as const, label: "Madame" }, { v: "M." as const, label: "Monsieur" }]} value={r.civilite} onChange={(v) => setR((x) => ({ ...x, civilite: v }))} />
      </div>
      <Texte r={r} setR={setR} k="prenom" label="Prénom(s)" autoComplete="given-name" />
      <Texte r={r} setR={setR} k="nom" label="Nom" autoComplete="family-name" />
      <Texte r={r} setR={setR} k="nomNaissance" label="Nom de naissance (si différent)" />
      <Texte r={r} setR={setR} k="dateNaissance" label="Date de naissance" type="date" autoComplete="bday" />
      <Texte r={r} setR={setR} k="lieuNaissance" label="Lieu de naissance" placeholder="Ville (département ou pays)" />
    </>
  );
}

function EtapeCoordonnees({ r, setR }: PropsEtape) {
  return (
    <>
      <Texte r={r} setR={setR} k="tel" label="Portable" type="tel" inputMode="tel" autoComplete="tel" placeholder="06 12 34 56 78" hint="Il servira aussi pour la signature électronique du bail." />
      <Texte r={r} setR={setR} k="email" label="E-mail" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" />
      <Field label="Adresse actuelle">
        <textarea className="input min-h-[88px] !py-3 !text-base" autoComplete="street-address" value={r.adresse ?? ""} onChange={(e) => setR((x) => ({ ...x, adresse: e.target.value }))} placeholder="Numéro, rue, code postal, ville" />
      </Field>
    </>
  );
}

function EtapeSituation({ r, setR, moi, foyer }: PropsEtape & { moi: PersonneDossier; foyer: Omit<PersonneDossier, "reponses">[] }) {
  const de = foyer.find((p) => p.id === moi.garantDe)?.prenom;
  return (
    <>
      <div>
        <span className="label">Situation familiale</span>
        <Choix items={SITUATIONS_FAMILIALES} value={r.situation} onChange={(v) => setR((x) => ({ ...x, situation: v }))} />
      </div>
      <div>
        <span className="label">Personnes à charge</span>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary !size-11 !p-0" aria-label="Moins" onClick={() => setR((x) => ({ ...x, aCharge: Math.max(0, (x.aCharge ?? 0) - 1) }))}>
            −
          </button>
          <span className="w-8 text-center text-lg font-semibold tabular-nums">{r.aCharge ?? 0}</span>
          <button type="button" className="btn-secondary !size-11 !p-0" aria-label="Plus" onClick={() => setR((x) => ({ ...x, aCharge: Math.min(20, (x.aCharge ?? 0) + 1) }))}>
            +
          </button>
        </div>
      </div>
      <div>
        <span className="label">Aujourd&apos;hui, vous êtes</span>
        <Choix items={LOGEMENTS_ACTUELS} value={r.logement} onChange={(v) => setR((x) => ({ ...x, logement: v }))} />
      </div>
      {r.logement === "locataire" && <Montant r={r} setR={setR} k="loyerActuel" label="Loyer actuel, charges comprises" />}
      {moi.role === "garant" && <Texte r={r} setR={setR} k="lien" label={`Votre lien avec ${de ?? "le locataire"}`} placeholder="Parent, ami…" />}
    </>
  );
}

function EtapeTravail({ r, setR }: PropsEtape) {
  const salarie = r.pro && !sansEmploiSalarie(r);
  return (
    <>
      <div>
        <span className="label">Situation professionnelle</span>
        <Choix items={SITUATIONS_PRO} value={r.pro} onChange={(v) => setR((x) => ({ ...x, pro: v }))} />
      </div>
      {r.pro && r.pro !== "sans" && (
        <>
          <Texte r={r} setR={setR} k="profession" label={r.pro === "etudiant" ? "Études suivies" : r.pro === "retraite" ? "Ancienne profession" : "Profession"} />
          {salarie && <Texte r={r} setR={setR} k="employeur" label={r.pro === "independant" ? "Entreprise (nom et ville)" : "Employeur (nom et ville)"} />}
          {(r.pro === "cdd" || r.pro === "interim" || r.pro === "apprenti") && <Texte r={r} setR={setR} k="finCdd" label="Fin du contrat" type="date" />}
        </>
      )}
      {r.pro && (
        <Montant
          r={r}
          setR={setR}
          k="salaire"
          label={r.pro === "retraite" ? "Pension nette par mois" : r.pro === "independant" ? "Revenu net moyen par mois" : r.pro === "etudiant" || r.pro === "sans" ? "Revenus par mois (bourse, job…)" : "Salaire net par mois"}
          hint={salarie ? "Montant avant impôt sur le revenu, tel qu'indiqué sur la fiche de paie." : undefined}
        />
      )}
      <Montant r={r} setR={setR} k="autresRevenus" label="Autres revenus par mois (facultatif)" hint="Allocations, pensions, revenus locatifs…" />
      {!!r.autresRevenus && <Texte r={r} setR={setR} k="autresRevenusDetail" label="Nature de ces revenus" />}
    </>
  );
}

function EtapeVerification({ r, setR, manque, allerA }: PropsEtape & { manque: string[]; allerA: (n: number) => void }) {
  const groupes = groupesReponses(r);
  return (
    <>
      {manque.length > 0 && (
        <div className="rounded-2xl bg-warn/10 px-4 py-3 text-sm">
          <div className="font-semibold text-warn">Il manque encore :</div>
          <div className="mt-1 text-fg/80">{manque.join(", ")}.</div>
        </div>
      )}
      {groupes.map((g) => (
        <div key={g.titre} className="card card-pad">
          <div className="flex items-center justify-between">
            <div className="h-section !text-base">{g.titre}</div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => allerA(g.etape)}>
              Modifier
            </button>
          </div>
          <dl className="mt-2 divide-y divide-line/70 text-sm">
            {g.lignes
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="shrink-0 text-muted">{k}</dt>
                  <dd className="min-w-0 break-words text-right">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
      <label className="card card-pad flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[#6c191e]" checked={!!r.accord} onChange={(e) => setR((x) => ({ ...x, accord: e.target.checked }))} />
        <span className="text-sm">
          Je certifie que ces informations sont exactes et j&apos;accepte que l&apos;agence PATRIM les utilise pour étudier cette candidature et préparer les documents de la location.
        </span>
      </label>
    </>
  );
}

/* ---------- Conjoint, colocataires, garants (candidat principal) ---------- */

function Foyer({ vue, appeler, recharger }: { vue: VuePublique; appeler: (c?: unknown) => Promise<Record<string, unknown>>; recharger: () => Promise<void> }) {
  const foyer = vue.foyer ?? [];
  const [liens, setLiens] = useState<Record<string, string>>({});
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ajout, setAjout] = useState<"colocataire" | "garant" | null>(null);
  const [prenom, setPrenom] = useState("");
  const [pour, setPour] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setLiens(lireLiens()), []);

  const locataires = foyer.filter((p) => p.role !== "garant");
  const moiPrenom = vue.moi.reponses?.prenom || vue.moi.prenom;
  const action = async (corps: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const j = await appeler(corps);
      if (typeof j.jeton === "string" && typeof j.id === "string") {
        garderLien(j.id, j.jeton);
        setLiens(lireLiens());
        setOuvert(j.id);
      }
      await recharger();
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const groupes = locataires.map((l) => ({ l, garants: foyer.filter((g) => g.role === "garant" && g.garantDe === l.id) }));
  const ligne = (p: Omit<PersonneDossier, "reponses">) => {
    const estMoi = p.id === vue.moi.id;
    const jeton = liens[p.id];
    const url = jeton ? `${window.location.origin}/renseignements/${jeton}` : "";
    const de = foyer.find((x) => x.id === p.garantDe)?.prenom;
    const texte = [
      `Bonjour ${p.prenom},`,
      p.role === "garant"
        ? `Pour notre dossier de location auprès de l'agence PATRIM, peux-tu remplir ta fiche de garant${de ? ` (pour ${de})` : ""} ici :`
        : "Pour notre dossier de location auprès de l'agence PATRIM, peux-tu remplir ta fiche de renseignements ici :",
      url,
      "C'est rapide et sécurisé. Merci !",
      moiPrenom,
    ].join("\n");
    return (
      <div key={p.id} className={cx("py-3", p.role === "garant" && "pl-4")}>
        <div className="flex items-center gap-3">
          <span className={cx("grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold", p.role === "garant" ? "bg-accent/10 text-accent" : "bg-brand/10 text-brand")}>
            {p.role === "garant" ? <ShieldCheck size={16} /> : (p.prenom[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{estMoi ? `${p.prenom || "Vous"} (vous)` : p.prenom}</div>
            <div className="text-xs text-muted">{rolePersonne(p, foyer)}</div>
          </div>
          <Statut s={p.statut} />
        </div>
        {!estMoi && (
          <div className="mt-2 flex flex-wrap gap-2 pl-12">
            {p.statut !== "termine" && (
              <button type="button" className="btn-secondary btn-sm !h-9" disabled={busy} onClick={() => (jeton ? setOuvert(ouvert === p.id ? null : p.id) : action({ action: "lien", personneId: p.id }))}>
                {jeton ? "Envoyer son lien" : "Créer son lien"}
              </button>
            )}
            {jeton && p.statut !== "termine" && (
              <a className="btn-ghost btn-sm !h-9" href={`/renseignements/${jeton}`}>
                Remplir sa fiche ici
              </a>
            )}
            {p.statut !== "termine" && (
              <button type="button" className="btn-ghost btn-sm !h-9 text-muted" disabled={busy} onClick={() => confirm(`Retirer ${p.prenom} du dossier ?`) && action({ action: "retirer", personneId: p.id })}>
                <X size={14} /> Retirer
              </button>
            )}
          </div>
        )}
        {ouvert === p.id && jeton && (
          <div className="mt-3 rounded-2xl bg-surface-2 p-3 animate-fade-up">
            <p className="mb-2 text-xs text-muted">Envoyez ce lien à {p.prenom} : il est personnel et ne montre que sa propre fiche.</p>
            <PartageLien texte={texte} sujet="Fiche de renseignements PATRIM" url={url} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4 space-y-4 animate-fade-up">
      <p className="text-sm text-muted">Chaque personne reçoit son propre lien et remplit sa fiche depuis son téléphone. Vous voyez ici qui a terminé, jamais leurs réponses.</p>
      <div className="card card-pad !py-1 divide-y divide-line/70">
        {groupes.map(({ l, garants }) => (
          <div key={l.id}>
            {ligne(l)}
            {garants.map(ligne)}
          </div>
        ))}
      </div>
      {err && <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{err}</p>}

      {ajout ? (
        <div className="card card-pad space-y-3 animate-fade-up">
          <div className="font-semibold">{ajout === "garant" ? "Ajouter un garant" : "Ajouter un conjoint ou colocataire"}</div>
          <Field label="Son prénom">
            <input className="input !h-12 !text-base" value={prenom} onChange={(e) => setPrenom(e.target.value)} autoFocus />
          </Field>
          {ajout === "garant" && (
            <div>
              <span className="label">Garant de</span>
              <Choix items={locataires.map((l) => ({ v: l.id, label: l.id === vue.moi.id ? `${l.prenom || "Vous"} (vous)` : l.prenom }))} value={pour} onChange={setPour} />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost flex-1 !h-11" onClick={() => setAjout(null)}>
              Annuler
            </button>
            <button
              type="button"
              className="btn-primary flex-1 !h-11"
              disabled={busy || !prenom.trim() || (ajout === "garant" && !pour)}
              onClick={async () => {
                if (await action({ action: "ajouter", role: ajout, prenom, garantDe: pour })) {
                  setAjout(null);
                  setPrenom("");
                }
              }}
            >
              <Plus size={16} /> Ajouter
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className="btn-secondary !h-12"
            onClick={() => {
              setAjout("colocataire");
              setPour(undefined);
            }}
          >
            <Users size={17} /> Conjoint ou colocataire
          </button>
          <button
            type="button"
            className="btn-secondary !h-12"
            onClick={() => {
              setAjout("garant");
              setPour(locataires.length === 1 ? locataires[0].id : undefined);
            }}
          >
            <ShieldCheck size={17} /> Garant
          </button>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Clock size={12} /> Un lien perdu ? « Créer son lien » en fait un nouveau, l&apos;ancien ne marche plus.
      </p>
    </div>
  );
}
