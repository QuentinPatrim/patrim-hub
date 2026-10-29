"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, Mail, Pencil, Phone, Plus, ShieldCheck, Sparkles, Trash2, UserRound } from "lucide-react";
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
  composerAdresse,
  decouperAdresse,
  etapeDuChamp,
  groupesReponses,
  mailValide,
  piecesAttendues,
  manquantsReponses,
  telValide,
  type KindFiche,
  type Personne,
  type Reponses,
  type Societe,
  type VuePublique,
} from "./fiche";
import { useEtapesHistorique } from "@/lib/retour";
import { ChampsAdresse } from "./Adresse";

/* ============================================================
   Page publique de la fiche vendeur ou acquéreur, ouverte depuis
   le lien reçu par SMS ou mail. Elle ne parle qu'à
   /api/fiches/<jeton> : aucun accès au reste du Hub (ni store,
   ni compte, ni autre donnée).
   ============================================================ */

const eur = (n?: number) => (n == null ? "" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`);
const dateFr = (ymd?: string) => (ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

type Ecran = "accueil" | "fiche" | "merci";

/** Ancienne adresse d'un seul tenant : répartie dans les trois champs. */
const enParts = <T extends Personne>(p: T): T => (p.adresse && !p.adresseRue && !p.adresseCp && !p.adresseVille ? { ...p, ...decouperAdresse(p.adresse) } : p);
function preparer(r: Reponses): Reponses {
  const out = enParts(r);
  if (out.autres) out.autres = out.autres.map(enParts);
  if (out.bienAdresse && !out.bienRue && !out.bienCp && !out.bienVille) {
    const d = decouperAdresse(out.bienAdresse);
    Object.assign(out, { bienRue: d.adresseRue, bienCp: d.adresseCp, bienVille: d.adresseVille });
  }
  return out;
}

/** Interface client toujours claire, fond blanc, quel que soit le thème de l'appareil. */
function useClair() {
  useEffect(() => {
    const html = document.documentElement;
    const avant = { dark: html.classList.contains("dark"), theme: html.dataset.theme, fond: document.body.style.background };
    html.classList.remove("dark");
    html.dataset.theme = "light";
    document.body.style.background = "#fff";
    const meta = document.querySelector('meta[name="theme-color"]');
    const couleur = meta?.getAttribute("content");
    meta?.setAttribute("content", "#ffffff");
    return () => {
      html.classList.toggle("dark", avant.dark);
      if (avant.theme) html.dataset.theme = avant.theme;
      document.body.style.background = avant.fond;
      if (couleur) meta?.setAttribute("content", couleur);
    };
  }, []);
}
type SetR = (f: (r: Reponses) => Reponses) => void;
/** connus : champs déjà remplis à l'ouverture (par le conseiller ou lors d'une visite précédente). */
type P = { r: Reponses; setR: SetR; kind: KindFiche; connus?: Set<string> };

/** Un mot d'accompagnement en haut de chaque étape. */
const AIDE: Record<KindFiche, string[]> = {
  vendeur: [
    "Commençons par vous : recopiez simplement votre pièce d'identité.",
    "Où vous joindre ? C'est sur ce portable et cet e-mail que vous recevrez le mandat à signer.",
    "Votre situation familiale permet de savoir qui doit signer le mandat.",
    "Êtes-vous seul(e) propriétaire, ou à plusieurs ?",
    "Quelques mots sur votre bien. Ce que votre conseiller connaît déjà est indiqué : vérifiez-le d'un coup d'œil.",
    "Comment le bien vous appartient : votre notaire en aura besoin pour la vente.",
    "Trois questions rapides, posées à tous nos clients.",
    "Presque fini ! Relisez vos réponses, puis envoyez votre fiche.",
  ],
  acquereur: [
    "Commençons par vous : recopiez simplement votre pièce d'identité.",
    "Où vous joindre ? C'est sur ce portable et cet e-mail que vous recevrez l'offre à signer.",
    "Votre situation familiale permet de rédiger l'offre au bon nom.",
    "Achetez-vous seul(e), ou à plusieurs ?",
    "Votre proposition pour ce bien.",
    "Comment vous financez l'achat : cela rassure le vendeur sur le sérieux de votre offre.",
    "Trois questions rapides, posées à tous nos clients.",
    "Presque fini ! Relisez vos réponses, puis envoyez votre fiche.",
  ],
};
const NATIONALITES = ["Française", "Belge", "Suisse", "Espagnole", "Italienne", "Portugaise", "Allemande", "Britannique", "Marocaine", "Algérienne", "Tunisienne"];
const remplis = (r: Reponses) => new Set(Object.entries(r).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k]) => k));

export function ParcoursFiche({ jeton }: { jeton: string }) {
  useClair();
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
  const [connus, setConnus] = useState<Set<string>>(new Set());
  const [envoi, setEnvoi] = useState(false);
  // Dernières réponses enregistrées : sert à la sauvegarde quand on quitte la page
  const enregistre = useRef("");
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
        const depart = preparer({ residenceFiscale: "France", nationalite: "Française", ...v.reponses });
        setR(depart);
        setConnus(remplis(preparer({ ...v.reponses })));
        enregistre.current = JSON.stringify(depart);
      })
      .catch((e: Error) => setErreur(e.message));
  }, [appeler]);
  useEffect(() => {
    document.title = `${vue ? TITRE_FICHE[vue.kind] : "Votre fiche"} · PATRIM`;
  }, [vue]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [ecran, etape]);

  // Téléphone verrouillé, onglet fermé, appel reçu : les réponses de l'étape en cours ne sont pas perdues
  useEffect(() => {
    if (ecran !== "fiche") return;
    const quitter = () => {
      if (document.visibilityState !== "hidden") return;
      const corps = JSON.stringify(r);
      if (corps === enregistre.current) return;
      enregistre.current = corps;
      fetch(`/api/fiches/${jeton}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "enregistrer", reponses: r }),
        keepalive: true,
        referrerPolicy: "no-referrer",
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", quitter);
    return () => document.removeEventListener("visibilitychange", quitter);
  }, [ecran, r, jeton]);

  const enregistrer = async (terminer = false) => {
    setEnvoi(true);
    setMsg(null);
    try {
      enregistre.current = JSON.stringify(r);
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
  const manqueIci = manque.filter((m) => etapeDuChamp(m) === etape);

  if (ecran === "fiche")
    return (
      <Cadre>
        <div className="sticky top-0 z-10 -mx-4 bg-white/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
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
          <p className="flex gap-2.5 rounded-2xl bg-brand/[0.05] px-4 py-3 text-sm text-fg/85">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-brand" /> {AIDE[kind][etape]}
          </p>
          {etape === 0 && <EtapeIdentite r={r} setR={setR} kind={kind} />}
          {etape === 1 && <EtapeCoordonnees r={r} setR={setR} kind={kind} />}
          {etape === 2 && <EtapeFamille r={r} setR={setR} kind={kind} />}
          {etape === 3 && <EtapeParties r={r} setR={setR} kind={kind} />}
          {etape === 4 && (kind === "vendeur" ? <EtapeBien r={r} setR={setR} kind={kind} connus={connus} /> : <EtapeOffre r={r} setR={setR} kind={kind} prix={vue.contexte.prix} />)}
          {etape === 5 && (kind === "vendeur" ? <EtapeOrigine r={r} setR={setR} kind={kind} /> : <EtapeFinancement r={r} setR={setR} kind={kind} />)}
          {etape === 6 && <EtapeLegales r={r} setR={setR} kind={kind} />}
          {etape === derniere && <EtapeVerification r={r} setR={setR} kind={kind} manque={manque} allerA={aller} />}
        </div>

        {msg && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{msg}</p>}
        <div className="mt-6 pb-[max(16px,env(safe-area-inset-bottom))]">
          {etape < derniere && manqueIci.length > 0 && (
            <p className="mb-2 text-center text-xs text-muted">Encore à remplir sur cette page : {manqueIci.join(", ").toLowerCase()}. Vous pouvez aussi continuer et y revenir.</p>
          )}
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
          <h1 className="mt-4 font-serif text-2xl font-semibold">Merci{r.nom && r.civilite ? ` ${r.civilite === "M." ? "Monsieur" : "Madame"} ${r.nom.toUpperCase()}` : r.prenom || vue.prenom ? ` ${r.prenom || vue.prenom}` : ""} !</h1>
          <p className="mt-2 text-sm text-muted">
            Votre fiche est bien arrivée chez votre conseiller PATRIM, qui prépare {kind === "vendeur" ? "votre mandat de vente" : "votre offre d'achat"}. Vous la recevrez pour signature électronique (ICSIGN) sur le mail
            et le portable indiqués. Vous pourrez encore corriger votre fiche avec ce même lien.
          </p>
          <button type="button" className="btn-secondary mt-5 w-full !h-11" onClick={() => aller("accueil")}>
            Revenir à ma fiche
          </button>
        </div>
        <Pieces vue={vue} />
      </Cadre>
    );

  /* ---------- Accueil ---------- */
  const v0 = vue.reponses ?? {};
  const salut = v0.nom && v0.civilite ? `${v0.civilite === "M." ? "Monsieur" : "Madame"} ${v0.nom.toUpperCase()}` : vue.prenom;
  const dejaRempli = vue.statut === "a_remplir" && Object.keys(v0).length > 0;
  return (
    <Cadre>
      <Entete vue={vue} />
      <div className="mt-5 space-y-3 animate-fade-up">
        <p className="text-sm text-muted">
          Bonjour{salut ? ` ${salut}` : ""}, cette fiche réunit en une fois tout ce qu&apos;il faut pour {kind === "vendeur" ? "rédiger votre mandat de vente" : "rédiger votre offre d'achat"}, ainsi que les
          vérifications que la loi impose aux agences immobilières. Comptez une dizaine de minutes, sur téléphone ou sur ordinateur.
        </p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-2xl border border-line/70 px-4 py-3 text-xs text-fg/80">
          {etapes.slice(0, -1).map((e, i) => (
            <li key={e} className="flex items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-semibold text-brand">{i + 1}</span> {e}
            </li>
          ))}
        </ul>
        {dejaRempli && (
          <p className="flex gap-2 rounded-2xl bg-brand/[0.06] px-4 py-3 text-sm text-fg/85">
            <Check size={16} className="mt-0.5 shrink-0 text-brand" /> Votre conseiller a déjà indiqué les informations dont il dispose : il vous suffit de les vérifier et de compléter le reste.
          </p>
        )}
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
            <span className="block text-xs text-muted">
              {vue.statut === "termine" ? "Touchez pour la relire ou la corriger." : vue.statut === "en_cours" ? "Vos réponses ont été gardées : reprenez où vous en étiez." : "Vous pouvez vous arrêter à tout moment et reprendre plus tard."}
            </span>
          </span>
          <ArrowRight size={18} className="shrink-0 text-muted" />
        </button>
      </div>
      <Pieces vue={vue} />
      <Confidentialite vue={vue} />
    </Cadre>
  );
}

/* ---------- Mise en page ---------- */

function Cadre({ children }: { children: ReactNode }) {
  return <main className="mx-auto min-h-dvh w-full max-w-lg bg-white px-4 pb-10 text-fg">{children}</main>;
}

function Entete({ vue }: { vue: VuePublique }) {
  const c = vue.contexte;
  return (
    <header className="pt-[max(20px,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2.5">
        <Image src="/emblem.png" alt="" width={34} height={34} className="rounded-lg" />
        <div className="text-[13px] font-semibold tracking-[0.24em] text-brand">PATRIM</div>
      </div>
      {c.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.photo} alt="" referrerPolicy="no-referrer" className="mt-5 aspect-[16/9] w-full rounded-3xl bg-surface-2 object-cover" />
      )}
      <div className="mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
        <span className="h-px w-5 bg-coral" /> {TITRE_FICHE[vue.kind]}
      </div>
      <h1 className="mt-2 font-serif text-[26px] font-semibold leading-tight">{c.titre}</h1>
      {c.ville && <div className="mt-1 text-sm text-muted">{c.ville}</div>}
      {c.prix != null && (
        <div className="mt-3 inline-block rounded-xl border border-line px-3 py-2">
          <div className="text-[10px] text-muted">Prix affiché, honoraires inclus</div>
          <div className="mt-0.5 font-semibold tabular-nums">{eur(c.prix)}</div>
        </div>
      )}
    </header>
  );
}

function Pieces({ vue }: { vue: VuePublique }) {
  const liste = piecesAttendues(vue.kind, vue.contexte);
  const recues = vue.contexte.recues?.length ?? 0;
  const mail = vue.contexte.conseiller?.mail;
  if (!liste.length) return null;
  return (
    <div className="card card-pad mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Documents à préparer</div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {liste.map((p) => (
          <li key={p} className="flex gap-2">
            <Check size={15} className="mt-0.5 shrink-0 text-accent" /> {p}
          </li>
        ))}
      </ul>
      {recues > 0 && <p className="mt-2 text-xs text-muted">Votre conseiller a déjà {recues > 1 ? `${recues} autres documents` : "un autre document"} : inutile de le{recues > 1 ? "s" : ""} renvoyer.</p>}
      {mail ? (
        <a
          className="btn-secondary mt-3 w-full !h-11"
          href={`mailto:${mail}?subject=${encodeURIComponent(`Mes documents – ${TITRE_FICHE[vue.kind].toLowerCase()} – ${vue.contexte.titre}`)}&body=${encodeURIComponent("Bonjour,\n\nVeuillez trouver ci-joint mes documents.\n\nBien cordialement,")}`}
        >
          <Mail size={15} /> Envoyer mes documents par e-mail
        </a>
      ) : (
        <p className="mt-2 text-xs text-muted">Votre conseiller vous dira comment les lui transmettre.</p>
      )}
      <p className="mt-2 text-xs text-muted">Ne les envoyez pas par un réseau social.</p>
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

function Saisie({
  label,
  value,
  onChange,
  hint,
  multi,
  erreur,
  ...rest
}: { label: string; value?: string; onChange: (v: string) => void; hint?: string; multi?: boolean; erreur?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <Field label={label} hint={hint && <span className={erreur ? "text-danger" : undefined}>{hint}</span>}>
      {multi ? (
        <textarea className="input min-h-[88px] !py-3 !text-base" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={rest.placeholder} />
      ) : (
        <input className={cx("input !h-12 !text-base", erreur && "!border-danger")} aria-invalid={erreur || undefined} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
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
      <Saisie label="Nationalité" value={p.nationalite} onChange={(v) => set({ nationalite: v })} list="nationalites" />
      <datalist id="nationalites">
        {NATIONALITES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <Saisie label="Profession" value={p.profession} onChange={(v) => set({ profession: v })} />
    </>
  );
}

function Coordonnees({ p, set }: { p: Personne; set: (x: Partial<Personne>) => void }) {
  return (
    <>
      <ChampsAdresse
        label="Adresse actuelle"
        value={{ rue: p.adresseRue, cp: p.adresseCp, ville: p.adresseVille }}
        onChange={(a) => set({ adresseRue: a.rue, adresseCp: a.cp, adresseVille: a.ville, adresse: composerAdresse(a.rue?.trim(), a.cp, a.ville?.trim()) })}
      />
      <Saisie
        label="Portable"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={p.tel}
        onChange={(v) => set({ tel: v })}
        placeholder="06 12 34 56 78"
        hint={telValide(p.tel) ? "Personnel : il reçoit le code de la signature électronique." : "Ce numéro semble incomplet : vérifiez-le (chiffres, espaces ou + uniquement)."}
        erreur={!telValide(p.tel)}
      />
      <Saisie
        label="E-mail"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        value={p.email}
        onChange={(v) => set({ email: v.trim() })}
        hint={mailValide(p.email) ? "Personnel : il reçoit le document à signer." : "Cette adresse semble incomplète : elle doit ressembler à prenom.nom@exemple.fr."}
        erreur={!mailValide(p.email)}
      />
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

/** Champs du bien que le conseiller a souvent déjà : repliés dans un résumé à vérifier. */
const CONNU_BIEN: { cle: keyof Reponses; label: string; texte: (r: Reponses) => string | undefined }[] = [
  { cle: "bienAdresse", label: "Adresse", texte: (r) => r.bienAdresse },
  { cle: "bienNature", label: "Nature", texte: (r) => r.bienNature },
  { cle: "lots", label: "Lots", texte: (r) => r.lots },
  { cle: "carrez", label: "Surface Carrez", texte: (r) => r.carrez },
  { cle: "syndic", label: "Syndic", texte: (r) => r.syndic },
  { cle: "chargesAnnuelles", label: "Charges par an", texte: (r) => (r.chargesAnnuelles != null ? eur(r.chargesAnnuelles) : undefined) },
  { cle: "taxeFonciere", label: "Taxe foncière", texte: (r) => (r.taxeFonciere != null ? eur(r.taxeFonciere) : undefined) },
  { cle: "anneeConstruction", label: "Construit vers", texte: (r) => (r.anneeConstruction ? String(r.anneeConstruction) : undefined) },
];

function EtapeBien({ r, setR, connus }: P) {
  const set = (x: Partial<Reponses>) => setR((y) => ({ ...y, ...x }));
  const copro = r.bienNature === "Appartement" || r.bienNature === "Garage" || r.bienNature === "Local" || !!r.lots;
  // Repliés : les champs déjà connus à l'ouverture, tant que le client ne demande pas à les corriger
  const [corriger, setCorriger] = useState(false);
  const replies = new Set(corriger ? [] : CONNU_BIEN.filter((c) => connus?.has(c.cle) && c.texte(r)).map((c) => c.cle));
  if (replies.has("bienAdresse") && !(r.bienRue && r.bienVille)) replies.delete("bienAdresse");
  const voir = (cle: keyof Reponses) => !replies.has(cle);
  const resume = CONNU_BIEN.filter((c) => replies.has(c.cle));
  return (
    <>
      {resume.length > 0 && (
        <div className="card card-pad">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Check size={16} className="text-ok" /> Déjà renseigné
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCorriger(true)}>
              <Pencil size={13} /> Corriger
            </button>
          </div>
          <dl className="mt-2 divide-y divide-line/70 text-sm">
            {resume.map((c) => (
              <div key={c.cle} className="flex justify-between gap-4 py-2">
                <dt className="shrink-0 text-muted">{c.label}</dt>
                <dd className="min-w-0 break-words text-right">{c.texte(r)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1 text-xs text-muted">Si tout est juste, il ne vous reste que les questions ci-dessous.</p>
        </div>
      )}
      {voir("bienAdresse") && <ChampsAdresse
        label="Adresse du bien"
        value={{ rue: r.bienRue, cp: r.bienCp, ville: r.bienVille }}
        onChange={(a) => set({ bienRue: a.rue, bienCp: a.cp, bienVille: a.ville, bienAdresse: composerAdresse(a.rue?.trim(), a.cp, a.ville?.trim()) })}
        hint="Ajoutez si besoin le bâtiment, l'étage et la porte après la rue."
      />}
      {voir("bienNature") && (
        <div>
          <span className="label">Nature du bien</span>
          <Choix items={NATURES.map((n) => ({ v: n, label: n }))} value={r.bienNature} onChange={(v) => set({ bienNature: v })} />
        </div>
      )}
      {copro && (
        <>
          {voir("lots") && <Saisie label="N° de lot(s) de copropriété" value={r.lots} onChange={(v) => set({ lots: v })} placeholder="Ex. lot 147 (appartement), lot 283 (parking)" hint="Ils figurent sur votre titre de propriété." />}
          {voir("carrez") && <Saisie label="Surface loi Carrez (si connue)" value={r.carrez} onChange={(v) => set({ carrez: v })} placeholder="Ex. 45,20 m²" />}
          {voir("syndic") && <Saisie label="Syndic de copropriété" value={r.syndic} onChange={(v) => set({ syndic: v })} placeholder="Nom du cabinet, gestionnaire, téléphone" />}
          {voir("chargesAnnuelles") && <Nombre label="Charges de copropriété par an" value={r.chargesAnnuelles} onChange={(v) => set({ chargesAnnuelles: v })} />}
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
      {voir("taxeFonciere") && <Nombre label="Taxe foncière (dernier avis)" value={r.taxeFonciere} onChange={(v) => set({ taxeFonciere: v })} />}
      {voir("anneeConstruction") && <Nombre label="Année de construction (environ)" value={r.anneeConstruction} onChange={(v) => set({ anneeConstruction: v })} suffixe="" decimal={false} hint="Elle décide des diagnostics à faire (amiante avant 1997, plomb avant 1949)." />}
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
          <div className="mt-2 flex flex-wrap gap-1.5">
            {manque.map((m) => (
              <button key={m} type="button" className="rounded-full border border-warn/40 bg-white px-3 py-1.5 text-xs font-medium text-fg/85 active:scale-[.97]" onClick={() => allerA(etapeDuChamp(m))}>
                {m} <ArrowRight size={11} className="inline" />
              </button>
            ))}
          </div>
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
