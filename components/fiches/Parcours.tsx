"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, Phone, Plus, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { cx, Field } from "@/components/ui";
import {
  DESTINATIONS,
  DIAGNOSTICS,
  ETAPES,
  FINANCEMENTS,
  MAX_AUTRES,
  NATURES,
  OCCUPATIONS,
  ORIGINES,
  ORIGINES_FONDS,
  PARTIES,
  PPES,
  REGIMES,
  REGIMES_PACS,
  SITUATIONS,
  TITRE_FICHE,
  avecAutres,
  groupesReponses,
  manquantsReponses,
  type KindFiche,
  type Personne,
  type Reponses,
  type Societe,
  type VuePublique,
} from "./fiche";
import { useEtapesHistorique } from "@/lib/retour";

/* ============================================================
   Page publique de la fiche vendeur ou acquéreur, ouverte depuis
   le lien reçu par SMS ou mail. Elle ne parle qu'à
   /api/fiches/<jeton> : aucun accès au reste du Hub (ni store,
   ni compte, ni autre donnée).
   ============================================================ */

const eur = (n?: number) => (n == null ? "" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`);
const dateFr = (ymd?: string) => (ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

type Ecran = "accueil" | "fiche" | "merci";
type SetR = (f: (r: Reponses) => Reponses) => void;
type P = { r: Reponses; setR: SetR; kind: KindFiche };

export function ParcoursFiche({ jeton }: { jeton: string }) {
  const [vue, setVue] = useState<VuePublique | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecran, setEcran] = useState<Ecran>("accueil");
  const [etape, setEtape] = useState(0);
  // Chaque écran et chaque étape ont leur entrée d'historique : le geste retour revient d'une étape.
  const aller = useEtapesHistorique<Ecran | number>("parcours", ecran === "fiche" ? etape : ecran, (p) => {
    if (typeof p === "number") {
      setEtape(p);
      setEcran("fiche");
    } else setEcran(p);
  });
  const [r, setR] = useState<Reponses>({});
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const appeler = useCallback(
    async (corps?: unknown) => {
      const res = await fetch(`/api/fiches/${jeton}`, {
        method: corps ? "POST" : "GET",
        headers: corps ? { "content-type": "application/json" } : undefined,
        body: corps ? JSON.stringify(corps) : undefined,
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error((j.error as string) || "Le service ne répond pas pour l'instant. Réessayez dans un instant.");
      return j as unknown as VuePublique;
    },
    [jeton]
  );

  useEffect(() => {
    appeler()
      .then((v) => {
        setVue(v);
        setR({ residenceFiscale: "France", nationalite: "Française", ...v.reponses });
      })
      .catch((e: Error) => setErreur(e.message));
  }, [appeler]);
  useEffect(() => {
    document.title = `${vue ? TITRE_FICHE[vue.kind] : "Votre fiche"} · PATRIM`;
  }, [vue]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [ecran, etape]);

  const enregistrer = async (terminer = false) => {
    setEnvoi(true);
    setMsg(null);
    try {
      setVue(await appeler({ action: "enregistrer", reponses: r, terminer }));
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

  const kind = vue.kind;
  const etapes = ETAPES[kind];
  const manque = manquantsReponses(kind, r);
  const derniere = etapes.length - 1;

  if (ecran === "fiche")
    return (
      <Cadre>
        <div className="sticky top-0 z-10 -mx-4 bg-bg/90 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
          <div className="flex items-center gap-3">
            <button type="button" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Retour" onClick={() => aller(etape ? etape - 1 : "accueil")}>
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                Étape {etape + 1} sur {etapes.length}
              </div>
              <div className="font-serif text-lg font-semibold leading-tight">{etapes[etape]}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-1">
            {etapes.map((e, i) => (
              <span key={e} className={cx("h-1 flex-1 rounded-full transition", i <= etape ? "bg-brand" : "bg-line")} />
            ))}
          </div>
        </div>

        <div key={etape} className="mt-2 space-y-4 animate-fade-up">
          {etape === 0 && <EtapeIdentite r={r} setR={setR} kind={kind} />}
          {etape === 1 && <EtapeCoordonnees r={r} setR={setR} kind={kind} />}
          {etape === 2 && <EtapeFamille r={r} setR={setR} kind={kind} />}
          {etape === 3 && <EtapeParties r={r} setR={setR} kind={kind} />}
          {etape === 4 && (kind === "vendeur" ? <EtapeBien r={r} setR={setR} kind={kind} /> : <EtapeOffre r={r} setR={setR} kind={kind} prix={vue.contexte.prix} />)}
          {etape === 5 && (kind === "vendeur" ? <EtapeOrigine r={r} setR={setR} kind={kind} /> : <EtapeFinancement r={r} setR={setR} kind={kind} />)}
          {etape === 6 && <EtapeLegales r={r} setR={setR} kind={kind} />}
          {etape === derniere && <EtapeVerification r={r} setR={setR} kind={kind} manque={manque} allerA={aller} />}
        </div>

        {msg && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{msg}</p>}
        <div className="mt-6 pb-[max(16px,env(safe-area-inset-bottom))]">
          {etape < derniere ? (
            <button
              type="button"
              className="btn-primary w-full !h-12"
              disabled={envoi}
              onClick={async () => {
                if (await enregistrer()) aller(etape + 1);
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
                if (await enregistrer(true)) aller("merci");
              }}
            >
              <Check size={17} /> Envoyer ma fiche
            </button>
          )}
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
            <Lock size={11} /> Vos réponses sont enregistrées à chaque étape : vous pouvez reprendre plus tard.
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
          <h1 className="mt-4 font-serif text-2xl font-semibold">Merci {r.prenom || vue.prenom} !</h1>
          <p className="mt-2 text-sm text-muted">
            Votre fiche est bien arrivée chez votre conseiller PATRIM, qui prépare {kind === "vendeur" ? "votre mandat de vente" : "votre offre d'achat"}. Vous la recevrez pour signature électronique (ICSIGN) sur le mail
            et le portable indiqués. Vous pourrez encore corriger votre fiche avec ce même lien.
          </p>
          <button type="button" className="btn-secondary mt-5 w-full !h-11" onClick={() => aller("accueil")}>
            Revenir à ma fiche
          </button>
        </div>
        <Pieces kind={kind} />
      </Cadre>
    );

  /* ---------- Accueil ---------- */
  return (
    <Cadre>
      <Entete vue={vue} />
      <div className="mt-5 space-y-3 animate-fade-up">
        <p className="text-sm text-muted">
          Bonjour{vue.prenom ? ` ${vue.prenom}` : ""}, cette fiche réunit en une fois tout ce qu&apos;il faut pour {kind === "vendeur" ? "rédiger votre mandat de vente" : "rédiger votre offre d'achat"}, ainsi que les
          vérifications que la loi impose aux agences immobilières. Comptez une dizaine de minutes, depuis votre téléphone.
        </p>
        <button
          type="button"
          onClick={() => {
            aller(vue.statut === "termine" ? derniere : 0);
          }}
          className="card card-pad card-hover flex w-full items-center gap-3 text-left"
        >
          <span className={cx("grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold", vue.statut === "termine" ? "bg-ok/15 text-ok" : "bg-brand/10 text-brand")}>
            {vue.statut === "termine" ? <Check size={18} /> : <UserRound size={18} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{vue.statut === "termine" ? "Fiche envoyée" : vue.statut === "en_cours" ? "Reprendre ma fiche" : "Remplir ma fiche"}</span>
            <span className="block text-xs text-muted">{vue.statut === "termine" ? "Touchez pour la relire ou la corriger." : etapes.slice(0, -1).join(" · ")}</span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-muted" />
        </button>
      </div>
      <Pieces kind={kind} />
      <Confidentialite vue={vue} />
    </Cadre>
  );
}

/* ---------- Mise en page ---------- */

function Cadre({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-dvh w-full max-w-lg bg-bg px-4 pb-10">{children}</main>;
}

function Entete({ vue }: { vue: VuePublique }) {
  const c = vue.contexte;
  return (
    <header className="-mx-4 overflow-hidden bg-ink text-white sm:mt-4 sm:rounded-3xl">
      <div className="relative isolate px-5 pb-6 pt-[max(20px,env(safe-area-inset-top))]">
        {c.photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.photo} alt="" referrerPolicy="no-referrer" className="absolute inset-0 -z-20 size-full object-cover opacity-30" />
        )}
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/40" />
        <div className="flex items-center gap-2.5">
          <Image src="/emblem.png" alt="" width={34} height={34} className="rounded-lg ring-1 ring-white/15" />
          <div className="text-[13px] font-semibold tracking-[0.24em]">PATRIM</div>
        </div>
        <div className="mt-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
          <span className="h-px w-5 bg-coral" /> {TITRE_FICHE[vue.kind]}
        </div>
        <h1 className="mt-2 font-serif text-[26px] font-semibold leading-tight">{c.titre}</h1>
        {c.ville && <div className="mt-1 text-sm text-white/70">{c.ville}</div>}
        {c.prix != null && (
          <div className="mt-4 inline-block rounded-xl bg-white/[0.08] px-3 py-2 ring-1 ring-inset ring-white/10">
            <div className="text-[10px] text-white/60">Prix affiché, honoraires inclus</div>
            <div className="mt-0.5 font-semibold tabular-nums">{eur(c.prix)}</div>
          </div>
        )}
      </div>
    </header>
  );
}

function Pieces({ kind }: { kind: KindFiche }) {
  const liste =
    kind === "vendeur"
      ? ["Pièce d'identité en cours de validité de chaque propriétaire (recto verso)", "Titre de propriété", "Dernier avis de taxe foncière", "Diagnostics déjà réalisés", "Copropriété : 3 derniers procès-verbaux d'assemblée et appels de charges", "Bien loué : le bail en cours"]
      : ["Pièce d'identité en cours de validité de chaque acquéreur (recto verso)", "Justificatif de l'apport (relevé, attestation de la banque)", "Accord de principe ou simulation de la banque, si vous l'avez"];
  return (
    <div className="card card-pad mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Pièces à préparer</div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {liste.map((p) => (
          <li key={p} className="flex gap-2">
            <Check size={15} className="mt-0.5 shrink-0 text-accent" /> {p}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Votre conseiller vous dira comment les lui transmettre. Ne les envoyez pas par un réseau social.</p>
    </div>
  );
}

function Confidentialite({ vue }: { vue: VuePublique }) {
  const c = vue.contexte.conseiller;
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-xs text-muted">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
        <p>
          Ce lien est personnel : ne le transférez pas. Vos réponses ne sont visibles que par l&apos;agence PATRIM. Elles servent à rédiger {vue.kind === "vendeur" ? "le mandat" : "l'offre"} et à remplir les obligations de
          vigilance de l&apos;agence contre le blanchiment de capitaux (articles L. 561-1 et suivants du code monétaire et financier), qui imposent de les conserver cinq ans. Lien valable jusqu&apos;au{" "}
          {dateFr(vue.expire.slice(0, 10))}.
        </p>
      </div>
      {c && (
        <div className="card card-pad flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
            <UserRound size={18} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <div className="text-xs text-muted">Une question ? Votre conseiller</div>
            <div className="font-semibold">{c.nom}</div>
          </div>
          {c.tel && (
            <a href={`tel:${c.tel.replace(/[^\d+]/g, "")}`} className="btn-secondary !h-10 shrink-0">
              <Phone size={15} /> Appeler
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Champs ---------- */

function Choix<T extends string>({ items, value, onChange }: { items: { v: T; label: string }[]; value?: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <button
          key={i.v}
          type="button"
          onClick={() => onChange(i.v)}
          className={cx("min-h-11 rounded-full border px-4 py-2 text-left text-sm font-medium transition active:scale-[.97]", value === i.v ? "border-brand bg-brand text-white shadow-sm" : "border-line bg-surface text-fg/80")}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}

function OuiNon({ label, value, onChange, hint }: { label: string; value?: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <Choix items={[{ v: "oui", label: "Oui" }, { v: "non", label: "Non" }]} value={value == null ? undefined : value ? "oui" : "non"} onChange={(v) => onChange(v === "oui")} />
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Saisie({ label, value, onChange, hint, multi, ...rest }: { label: string; value?: string; onChange: (v: string) => void; hint?: string; multi?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Field label={label} hint={hint}>
      {multi ? (
        <textarea className="input min-h-[88px] !py-3 !text-base" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={rest.placeholder} />
      ) : (
        <input className="input !h-12 !text-base" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
      )}
    </Field>
  );
}

function Nombre({ label, value, onChange, hint, suffixe = "€", decimal = true }: { label: string; value?: number; onChange: (v?: number) => void; hint?: string; suffixe?: string; decimal?: boolean }) {
  const [s, setS] = useState(value != null ? String(value).replace(".", ",") : "");
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <input
          className="input !h-12 pr-14 !text-base"
          inputMode={decimal ? "decimal" : "numeric"}
          value={s}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d,.\s]/g, "");
            setS(v);
            const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
            onChange(Number.isFinite(n) ? (decimal ? n : Math.round(n)) : undefined);
          }}
        />
        {suffixe && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">{suffixe}</span>}
      </div>
    </Field>
  );
}

/** Champs d'identité, pour le signataire comme pour un autre propriétaire ou acquéreur. */
function Identite({ p, set }: { p: Personne; set: (x: Partial<Personne>) => void }) {
  return (
    <>
      <div>
        <span className="label">Civilité</span>
        <Choix items={[{ v: "Mme" as const, label: "Madame" }, { v: "M." as const, label: "Monsieur" }]} value={p.civilite} onChange={(v) => set({ civilite: v })} />
      </div>
      <Saisie label="Prénom(s)" value={p.prenom} onChange={(v) => set({ prenom: v })} autoComplete="given-name" hint="Tous les prénoms, comme sur la pièce d'identité." />
      <Saisie label="Nom" value={p.nom} onChange={(v) => set({ nom: v })} autoComplete="family-name" />
      <Saisie label="Nom de naissance (si différent)" value={p.nomNaissance} onChange={(v) => set({ nomNaissance: v })} />
      <Saisie label="Date de naissance" type="date" value={p.dateNaissance} onChange={(v) => set({ dateNaissance: v })} autoComplete="bday" />
      <Saisie label="Lieu de naissance" value={p.lieuNaissance} onChange={(v) => set({ lieuNaissance: v })} placeholder="Ville (département ou pays)" />
      <Saisie label="Nationalité" value={p.nationalite} onChange={(v) => set({ nationalite: v })} />
      <Saisie label="Profession" value={p.profession} onChange={(v) => set({ profession: v })} />
    </>
  );
}

function Coordonnees({ p, set }: { p: Personne; set: (x: Partial<Personne>) => void }) {
  return (
    <>
      <Saisie label="Adresse actuelle" multi value={p.adresse} onChange={(v) => set({ adresse: v })} placeholder="Numéro, rue, code postal, ville" />
      <Saisie label="Portable" type="tel" inputMode="tel" autoComplete="tel" value={p.tel} onChange={(v) => set({ tel: v })} placeholder="06 12 34 56 78" hint="Personnel : il reçoit le code de la signature électronique." />
      <Saisie label="E-mail" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={p.email} onChange={(v) => set({ email: v })} hint="Personnel : il reçoit le document à signer." />
    </>
  );
}

function EtapeIdentite({ r, setR }: P) {
  return <Identite p={r} set={(x) => setR((y) => ({ ...y, ...x }))} />;
}

function EtapeCoordonnees({ r, setR }: P) {
  return <Coordonnees p={r} set={(x) => setR((y) => ({ ...y, ...x }))} />;
}

function EtapeFamille({ r, setR, kind }: P) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  return (
    <>
      <div>
        <span className="label">Situation familiale</span>
        <Choix items={SITUATIONS} value={r.situation} onChange={(v) => set({ situation: v })} />
      </div>
      {r.situation === "marie" && (
        <>
          <div>
            <span className="label">Régime matrimonial</span>
            <Choix items={REGIMES} value={r.regime} onChange={(v) => set({ regime: v })} />
            <p className="mt-1.5 text-xs text-muted">Sans contrat de mariage signé chez un notaire, c&apos;est la communauté légale.</p>
          </div>
          <Saisie label="Date du mariage" type="date" value={r.dateMariage} onChange={(v) => set({ dateMariage: v })} />
          <Saisie label="Lieu du mariage" value={r.lieuMariage} onChange={(v) => set({ lieuMariage: v })} placeholder="Ville" />
        </>
      )}
      {r.situation === "pacse" && (
        <div>
          <span className="label">Régime du PACS</span>
          <Choix items={REGIMES_PACS} value={r.regimePacs} onChange={(v) => set({ regimePacs: v })} />
        </div>
      )}
      {kind === "vendeur" && (r.situation === "marie" || r.situation === "pacse") && (
        <OuiNon
          label="Le bien est-il le logement de votre famille ?"
          value={r.residenceFamille}
          onChange={(v) => set({ residenceFamille: v })}
          hint="Si oui, votre conjoint doit aussi signer le mandat, même s'il n'est pas propriétaire (article 215 du code civil)."
        />
      )}
    </>
  );
}

function EtapeParties({ r, setR, kind }: P) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  const autres = r.autres ?? [];
  const setAutre = (i: number, x: Partial<Personne>) => setR((y) => ({ ...y, autres: (y.autres ?? []).map((p, j) => (j === i ? { ...p, ...x } : p)) }));
  const setSoc = (x: Partial<Societe>) => setR((y) => ({ ...y, societe: { ...y.societe, ...x } }));
  const qui = kind === "vendeur" ? "propriétaire" : "acquéreur";
  return (
    <>
      <div>
        <span className="label">{kind === "vendeur" ? "Qui est propriétaire du bien ?" : "Qui achète ?"}</span>
        <Choix
          items={PARTIES[kind]}
          value={r.parties}
          onChange={(v) =>
            setR((y) => ({
              ...y,
              parties: v,
              autres: (v === "couple" || v === "plusieurs") && !(y.autres ?? []).length ? [{ lien: v === "couple" ? (y.situation === "marie" ? "Conjoint" : y.situation === "pacse" ? "Partenaire de PACS" : "Concubin(e)") : undefined }] : y.autres,
            }))
          }
        />
      </div>

      {r.parties === "societe" && (
        <div className="card card-pad space-y-3">
          <div className="font-semibold">La société</div>
          <Saisie label="Nom de la société" value={r.societe?.denomination} onChange={(v) => setSoc({ denomination: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Saisie label="Forme" value={r.societe?.forme} onChange={(v) => setSoc({ forme: v })} placeholder="SCI, SARL…" />
            <Saisie label="N° SIREN" inputMode="numeric" value={r.societe?.siren} onChange={(v) => setSoc({ siren: v })} />
          </div>
          <Saisie label="Adresse du siège" value={r.societe?.siege} onChange={(v) => setSoc({ siege: v })} />
          <Saisie label="Vous signez en qualité de" value={r.societe?.qualite} onChange={(v) => setSoc({ qualite: v })} placeholder="Gérant(e)" />
          <Saisie
            label="Associés détenant plus de 25 %"
            multi
            value={r.societe?.beneficiaires}
            onChange={(v) => setSoc({ beneficiaires: v })}
            placeholder="Nom, prénom, date de naissance et part de chacun"
          />
          <p className="text-xs text-muted">La loi demande d&apos;identifier les « bénéficiaires effectifs » de la société. Votre conseiller vous demandera aussi un extrait Kbis et les statuts.</p>
        </div>
      )}

      {avecAutres(r) &&
        autres.map((p, i) => (
          <div key={i} className="card card-pad space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">
                {r.parties === "couple" ? (kind === "vendeur" ? "Votre conjoint ou partenaire" : "Votre conjoint ou partenaire") : `${qui[0].toUpperCase() + qui.slice(1)} ${i + 2}`}
              </div>
              {autres.length > 1 && (
                <button type="button" className="btn-ghost btn-sm text-muted" onClick={() => setR((y) => ({ ...y, autres: (y.autres ?? []).filter((_, j) => j !== i) }))}>
                  <Trash2 size={14} /> Retirer
                </button>
              )}
            </div>
            {r.parties === "plusieurs" && <Saisie label="Lien avec vous" value={p.lien} onChange={(v) => setAutre(i, { lien: v })} placeholder={kind === "vendeur" ? "Frère, sœur, coindivisaire…" : "Conjoint, ami, associé…"} />}
            <Identite p={p} set={(x) => setAutre(i, x)} />
            <Coordonnees p={p} set={(x) => setAutre(i, x)} />
            <div>
              <span className="label">Exerce-t-il ou elle une fonction politique, juridictionnelle ou administrative importante ?</span>
              <Choix items={PPES} value={p.ppe} onChange={(v) => setAutre(i, { ppe: v })} />
            </div>
          </div>
        ))}
      {r.parties === "plusieurs" && autres.length < MAX_AUTRES && (
        <button type="button" className="btn-secondary w-full !h-12" onClick={() => setR((y) => ({ ...y, autres: [...(y.autres ?? []), {}] }))}>
          <Plus size={16} /> Ajouter un {qui}
        </button>
      )}
      {avecAutres(r) && <p className="text-xs text-muted">Chaque personne signera électroniquement : son portable et son e-mail doivent être les siens.</p>}
    </>
  );
}

function EtapeBien({ r, setR }: P) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  const copro = r.bienNature === "Appartement" || r.bienNature === "Garage" || r.bienNature === "Local" || !!r.lots;
  return (
    <>
      <Saisie label="Adresse du bien" multi value={r.bienAdresse} onChange={(v) => set({ bienAdresse: v })} placeholder="Numéro, rue, bâtiment, étage, porte, code postal, ville" />
      <div>
        <span className="label">Nature du bien</span>
        <Choix items={NATURES.map((n) => ({ v: n, label: n }))} value={r.bienNature} onChange={(v) => set({ bienNature: v })} />
      </div>
      {copro && (
        <>
          <Saisie label="N° de lot(s) de copropriété" value={r.lots} onChange={(v) => set({ lots: v })} placeholder="Ex. lot 147 (appartement), lot 283 (parking)" hint="Ils figurent sur votre titre de propriété." />
          <Saisie label="Surface loi Carrez (si connue)" value={r.carrez} onChange={(v) => set({ carrez: v })} placeholder="Ex. 45,20 m²" />
          <Saisie label="Syndic de copropriété" value={r.syndic} onChange={(v) => set({ syndic: v })} placeholder="Nom du cabinet, gestionnaire, téléphone" />
          <Nombre label="Charges de copropriété par an" value={r.chargesAnnuelles} onChange={(v) => set({ chargesAnnuelles: v })} />
        </>
      )}
      <div>
        <span className="label">Aujourd&apos;hui, le bien est</span>
        <Choix items={OCCUPATIONS} value={r.occupation} onChange={(v) => set({ occupation: v })} />
      </div>
      {r.occupation === "loue" && (
        <>
          <Nombre label="Loyer mensuel, charges comprises" value={r.loyer} onChange={(v) => set({ loyer: v })} />
          <Saisie label="Fin du bail en cours" type="date" value={r.finBail} onChange={(v) => set({ finBail: v })} />
        </>
      )}
      <Nombre label="Taxe foncière (dernier avis)" value={r.taxeFonciere} onChange={(v) => set({ taxeFonciere: v })} />
      <Nombre label="Année de construction (environ)" value={r.anneeConstruction} onChange={(v) => set({ anneeConstruction: v })} suffixe="" decimal={false} hint="Elle décide des diagnostics à faire (amiante avant 1997, plomb avant 1949)." />
      <div>
        <span className="label">Diagnostics déjà réalisés</span>
        <div className="grid gap-1.5">
          {DIAGNOSTICS.map((d) => {
            const on = !!r.diagnostics?.includes(d);
            return (
              <label key={d} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-1 text-sm">
                <input type="checkbox" className="size-5 shrink-0 accent-[#6c191e]" checked={on} onChange={() => set({ diagnostics: on ? (r.diagnostics ?? []).filter((x) => x !== d) : [...(r.diagnostics ?? []), d] })} />
                {d}
              </label>
            );
          })}
        </div>
      </div>
      <Saisie label="Travaux réalisés ces dix dernières années (facultatif)" multi value={r.travaux} onChange={(v) => set({ travaux: v })} placeholder="Nature, année, artisan…" />
      <Nombre label="Prix net vendeur souhaité (facultatif)" value={r.prixSouhaite} onChange={(v) => set({ prixSouhaite: v })} hint="Ce que vous souhaitez recevoir, avant les honoraires de l'agence. Nous en parlerons ensemble." />
    </>
  );
}

function EtapeOrigine({ r, setR }: P) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  return (
    <>
      <div>
        <span className="label">Vous êtes devenu(e) propriétaire par</span>
        <Choix items={ORIGINES} value={r.origine} onChange={(v) => set({ origine: v })} />
      </div>
      <Nombre label="En quelle année ?" value={r.origineAnnee} onChange={(v) => set({ origineAnnee: v })} suffixe="" decimal={false} />
      <Saisie label="Notaire qui a reçu l'acte (si connu)" value={r.origineNotaire} onChange={(v) => set({ origineNotaire: v })} placeholder="Nom et ville de l'étude" />
      {r.origine === "achat" && <Nombre label="Prix d'achat (facultatif)" value={r.prixAcquisition} onChange={(v) => set({ prixAcquisition: v })} />}
      <OuiNon label="Un crédit est-il encore en cours sur ce bien ?" value={r.credit} onChange={(v) => set({ credit: v })} hint="Le notaire le remboursera sur le prix de vente : il lui faut le nom de la banque." />
      {r.credit && <Saisie label="Banque du crédit" value={r.creditBanque} onChange={(v) => set({ creditBanque: v })} />}
      <Saisie label="Notaire choisi pour la vente (facultatif)" value={r.notaireVente} onChange={(v) => set({ notaireVente: v })} />
      <Saisie label="Votre projet après la vente (facultatif)" value={r.projet} onChange={(v) => set({ projet: v })} placeholder="Achat d'un autre logement, placement…" />
    </>
  );
}

function EtapeOffre({ r, setR, prix }: P & { prix?: number }) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  return (
    <>
      <Nombre label="Prix que vous proposez, honoraires inclus" value={r.prixPropose} onChange={(v) => set({ prixPropose: v })} hint={prix ? `Prix affiché : ${eur(prix)}.` : undefined} />
      <div>
        <span className="label">Ce bien sera</span>
        <Choix items={DESTINATIONS} value={r.destination} onChange={(v) => set({ destination: v })} />
      </div>
      <Saisie
        label="Conditions souhaitées (facultatif)"
        multi
        value={r.conditions}
        onChange={(v) => set({ conditions: v })}
        placeholder="Date de signature souhaitée, meubles laissés, travaux à faire avant la vente…"
      />
    </>
  );
}

function EtapeFinancement({ r, setR }: P) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  const fonds = r.origineFonds ?? [];
  return (
    <>
      <div>
        <span className="label">Vous financez l&apos;achat</span>
        <Choix items={FINANCEMENTS} value={r.financement} onChange={(v) => set({ financement: v })} />
      </div>
      <Nombre label={r.financement === "comptant" ? "Montant payé comptant" : "Apport personnel"} value={r.apport} onChange={(v) => set({ apport: v })} />
      {r.financement === "pret" && (
        <>
          <Nombre label="Montant du prêt" value={r.montantPret} onChange={(v) => set({ montantPret: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Nombre label="Durée" value={r.dureePret} onChange={(v) => set({ dureePret: v })} suffixe="ans" decimal={false} />
            <Nombre label="Taux maximum" value={r.tauxMax} onChange={(v) => set({ tauxMax: v })} suffixe="%" />
          </div>
          <Saisie label="Banque ou courtier" value={r.banque} onChange={(v) => set({ banque: v })} />
          <OuiNon label="Avez-vous un accord de principe ?" value={r.accordPrincipe} onChange={(v) => set({ accordPrincipe: v })} />
        </>
      )}
      <OuiNon label="Devez-vous vendre un bien pour acheter celui-ci ?" value={r.venteBien} onChange={(v) => set({ venteBien: v })} />
      {r.venteBien && <Saisie label="Lequel, et où en est la vente ?" value={r.venteBienDetail} onChange={(v) => set({ venteBienDetail: v })} placeholder="Ville, compromis signé ou non…" />}
      <div>
        <span className="label">D&apos;où vient votre apport ?</span>
        <div className="flex flex-wrap gap-2">
          {ORIGINES_FONDS.map((o) => {
            const on = fonds.includes(o);
            return (
              <button
                key={o}
                type="button"
                onClick={() => set({ origineFonds: on ? fonds.filter((x) => x !== o) : [...fonds, o] })}
                className={cx("min-h-11 rounded-full border px-4 py-2 text-sm font-medium transition active:scale-[.97]", on ? "border-brand bg-brand text-white shadow-sm" : "border-line bg-surface text-fg/80")}
              >
                {o}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">Plusieurs réponses possibles. Sans apport, choisissez « Revenus professionnels ».</p>
      </div>
      {fonds.some((o) => o !== "Épargne personnelle" && o !== "Revenus professionnels") && (
        <Saisie label="Précisez (facultatif)" value={r.origineFondsDetail} onChange={(v) => set({ origineFondsDetail: v })} placeholder="Donation de mes parents, vente de mon appartement à…" />
      )}
      <Saisie label="Banque où se trouvent les fonds" value={r.etablissementFonds} onChange={(v) => set({ etablissementFonds: v })} />
    </>
  );
}

function EtapeLegales({ r, setR, kind }: P) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  return (
    <>
      <div className="flex gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-xs text-muted">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-accent" />
        <p>Ces trois questions sont posées à tous nos clients : la loi impose aux agences immobilières de les vérifier avant {kind === "vendeur" ? "toute mise en vente" : "toute offre"}.</p>
      </div>
      <div>
        <span className="label">Exercez-vous, ou avez-vous exercé depuis moins d&apos;un an, une fonction politique, juridictionnelle ou administrative importante ? Ou un membre de votre famille proche ?</span>
        <Choix items={PPES} value={r.ppe} onChange={(v) => set({ ppe: v })} />
        <p className="mt-1.5 text-xs text-muted">Par exemple : ministre, parlementaire, maire d&apos;une grande ville, magistrat d&apos;une haute juridiction, ambassadeur, dirigeant d&apos;une entreprise publique.</p>
      </div>
      {(r.ppe === "moi" || r.ppe === "proche" || (r.autres ?? []).some((p) => p.ppe && p.ppe !== "non")) && (
        <Saisie label="Précisez la fonction (et la personne)" value={r.ppeDetail} onChange={(v) => set({ ppeDetail: v })} />
      )}
      <OuiNon label={kind === "vendeur" ? "Vendez-vous pour votre propre compte ?" : "Achetez-vous pour votre propre compte ?"} value={r.propreCompte} onChange={(v) => set({ propreCompte: v })} />
      {r.propreCompte === false && <Saisie label="Pour le compte de qui ?" value={r.pourCompteDe} onChange={(v) => set({ pourCompteDe: v })} />}
      <Saisie label="Pays de résidence fiscale" value={r.residenceFiscale} onChange={(v) => set({ residenceFiscale: v })} />
    </>
  );
}

function EtapeVerification({ r, setR, kind, manque, allerA }: P & { manque: string[]; allerA: (n: number) => void }) {
  const groupes = groupesReponses(kind, r)
    .map((g) => ({ ...g, lignes: g.lignes.filter(([, v]) => v) }))
    .filter((g) => g.lignes.length);
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
            {g.lignes.map(([k, v]) => (
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
          Je certifie que ces informations sont exactes et complètes. J&apos;accepte que l&apos;agence PATRIM les utilise pour {kind === "vendeur" ? "rédiger le mandat de vente" : "rédiger l'offre d'achat"} et les conserve
          au titre de ses obligations de lutte contre le blanchiment de capitaux et le financement du terrorisme.
        </span>
      </label>
    </>
  );
}
