"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, FileSpreadsheet, Info, RefreshCw, ShieldCheck, TriangleAlert, Upload } from "lucide-react";
import { Badge, Card, cx, Spinner } from "@/components/ui";
import { useCollection } from "@/lib/store";
import { nomComplet } from "@/lib/format";
import type { Contact } from "@/lib/types";
import { dessinerFormes, planFormes } from "./dessinFormes";
import type { Apercu } from "./formes";
import { ErreurLecture, lireTableau, type Aide, type Tableau } from "./lecture";
import { analyser, choixParDefaut, empreinte, LIBELLE, modification, proprietaires, valeurAffichee, type Analyse, type Candidat, type Champ, type Rapprochement } from "./rapprochement";

/* « Compléter depuis ICS » : le fichier exporté d'ICS est lu sur l'appareil, rapproché des
   propriétaires du Hub, et seuls les champs vides cochés par le conseiller sont remplis.
   Le fichier n'est ni envoyé, ni gardé : il disparaît en quittant la page. */

type Etat =
  | { etape: "choix"; erreur?: string; colonnes?: string[]; aide?: string; apercu?: Apercu }
  | { etape: "lecture"; nom: string; avancement?: string }
  | { etape: "verif"; nom: string; analyse: Analyse; aide: string; apercu?: Apercu }
  | { etape: "fait"; fiches: number; infos: number };

const s = (n: number) => (n > 1 ? "s" : "");

/** Code d'aide au dépannage : la forme du fichier (genre, lignes, colonnes, polices du PDF), jamais son contenu. */
function codeAide(aide: Aide, t?: Tableau) {
  let forme = "";
  try {
    if (t) forme = empreinte(t);
  } catch {
    /* sans la forme du tableau */
  }
  return [aide.fichier, forme, aide.pdf].filter(Boolean).join(" · ");
}

export function ImportIcs() {
  const { items: contacts, update } = useCollection("contacts");
  const { items: biens } = useCollection("biens");
  const [etat, setEtat] = useState<Etat>({ etape: "choix" });
  const [choix, setChoix] = useState<Record<string, number>>({});
  const [coches, setCoches] = useState<Record<string, Champ[]>>({});
  const input = useRef<HTMLInputElement>(null);
  const nbProprietaires = useMemo(() => proprietaires(contacts, biens).length, [contacts, biens]);

  async function lire(file: File) {
    setEtat({ etape: "lecture", nom: file.name });
    // Impression d'écran : les lettres des images sont lues page par page, sur cet appareil.
    const aide: Aide = { suivi: (fait, total) => setEtat({ etape: "lecture", nom: file.name, avancement: `page ${fait} sur ${total}` }) };
    try {
      if (file.size > 20 * 1024 * 1024) throw new ErreurLecture("Ce fichier dépasse 20 Mo. Exportez seulement la liste des propriétaires.");
      const tableau = await lireTableau(new Uint8Array(await file.arrayBuffer()), aide);
      // Liste lue lettre par lettre sur une impression : un nom lu à une lettre près est proposé, à confirmer.
      const res = analyser(tableau, contacts, biens, / approx\./.test(aide.pdf ?? ""));
      if ("colonnesTrouvees" in res) {
        setEtat({ etape: "choix", erreur: "Les colonnes de nom et de coordonnées n'ont pas été reconnues dans ce fichier.", colonnes: res.colonnesTrouvees, aide: codeAide(aide, tableau), apercu: aide.apercu });
        return;
      }
      const c: Record<string, number> = {};
      const k: Record<string, Champ[]> = {};
      for (const r of res.retrouves) {
        c[r.contact.id] = choixParDefaut(r);
        k[r.contact.id] = c[r.contact.id] >= 0 ? r.candidats[c[r.contact.id]].ajouts.map((p) => p.champ) : [];
      }
      setChoix(c);
      setCoches(k);
      setEtat({ etape: "verif", nom: file.name, analyse: res, aide: codeAide(aide, tableau), apercu: aide.apercu });
    } catch (e) {
      setEtat({ etape: "choix", erreur: e instanceof ErreurLecture ? e.message : "Ce fichier n'a pas pu être lu. Imprimez de nouveau la liste depuis ICS en « PDF VIEWER », puis réessayez.", aide: codeAide(aide), apercu: aide.apercu });
    }
  }

  function choisirFichier() {
    if (input.current) {
      input.current.value = "";
      input.current.click();
    }
  }

  function changerCandidat(r: Rapprochement, k: number) {
    setChoix((x) => ({ ...x, [r.contact.id]: k }));
    setCoches((x) => ({ ...x, [r.contact.id]: k >= 0 ? r.candidats[k].ajouts.map((p) => p.champ) : [] }));
  }

  function cocher(id: string, champ: Champ) {
    setCoches((x) => {
      const l = x[id] ?? [];
      return { ...x, [id]: l.includes(champ) ? l.filter((c) => c !== champ) : [...l, champ] };
    });
  }

  const selection = (r: Rapprochement) => {
    const k = choix[r.contact.id] ?? -1;
    return k >= 0 ? r.candidats[k].ajouts.filter((p) => (coches[r.contact.id] ?? []).includes(p.champ)) : [];
  };

  function valider(a: Analyse) {
    let fiches = 0;
    let infos = 0;
    for (const r of a.retrouves) {
      const actuel = contacts.find((c) => c.id === r.contact.id);
      const m = actuel && modification(actuel, selection(r));
      if (!m) continue;
      update(r.contact.id, m.patch as Partial<Contact>);
      fiches++;
      infos += m.champs.length;
    }
    setEtat({ etape: "fait", fiches, infos });
  }

  // Aucun filtre de type : le fichier est reconnu à son contenu (une impression ICS peut finir par .tmp).
  const fichier = <input ref={input} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && lire(e.target.files[0])} />;

  if (etat.etape === "lecture")
    return (
      <Card>
        <div className="flex items-center gap-3 py-6 text-sm text-muted">
          <Spinner />
          {etat.avancement ? `Lecture des images de « ${etat.nom} » sur cet appareil, ${etat.avancement}…` : `Lecture de « ${etat.nom} » sur cet appareil…`}
        </div>
      </Card>
    );

  if (etat.etape === "fait")
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok/10 text-ok">
              <CircleCheck size={20} />
            </span>
            <div className="min-w-0">
              <div className="font-semibold">
                {etat.infos ? `${etat.infos} information${s(etat.infos)} ajoutée${s(etat.infos)} sur ${etat.fiches} fiche${s(etat.fiches)}` : "Rien n'a été ajouté"}
              </div>
              <p className="mt-1 text-sm text-muted">Une note « Complété depuis ICS » est ajoutée à l&apos;historique de chaque fiche modifiée.</p>
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-warn/10 px-3 py-2.5 text-sm text-fg ring-1 ring-inset ring-warn/25">
            <strong className="font-semibold">Dernière étape&nbsp;:</strong> supprimez le fichier exporté de vos Téléchargements, puis videz la corbeille.
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/contacts" className="btn-primary">
              Voir mes contacts
            </Link>
            <button type="button" className="btn-secondary" onClick={() => setEtat({ etape: "choix" })}>
              Lire un autre fichier
            </button>
          </div>
        </Card>
      </div>
    );

  if (etat.etape === "verif") {
    const a = etat.analyse;
    const aCompleter = a.retrouves.filter((r) => r.candidats.some((c) => c.ajouts.length));
    const complets = a.retrouves.filter((r) => !r.candidats.some((c) => c.ajouts.length));
    const total = a.retrouves.reduce((n, r) => n + selection(r).length, 0);
    return (
      <div className="space-y-4 sm:space-y-5">
        {fichier}
        <Card>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg ring-1 ring-inset ring-line/80">
              <FileSpreadsheet size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{etat.nom}</div>
              <div className="mt-0.5 text-xs text-muted">
                {a.lignes} personne{s(a.lignes)} dans le fichier · {a.retrouves.length} de vos propriétaires retrouvé{s(a.retrouves.length)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.colonnes.map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
          </div>
          <button type="button" onClick={choisirFichier} className="btn-ghost btn-sm -mx-2 mt-3">
            <RefreshCw size={14} /> Changer de fichier
          </button>
        </Card>

        {/ approx\./.test(etat.aide) && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-[13px] leading-relaxed">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" />
            <span>Cette liste a été lue lettre par lettre sur une impression&nbsp;: relisez chaque numéro et chaque adresse e-mail avant de valider.</span>
          </div>
        )}

        {aCompleter.length ? (
          <section className="space-y-3">
            <h2 className="h-section px-1">À compléter</h2>
            {aCompleter.map((r) => (
              <CarteProprietaire key={r.contact.id} r={r} choix={choix[r.contact.id] ?? -1} coches={coches[r.contact.id] ?? []} onChoix={(k) => changerCandidat(r, k)} onCoche={(c) => cocher(r.contact.id, c)} />
            ))}
          </section>
        ) : (
          <Card>
            <p className="text-sm text-muted">
              {a.retrouves.length
                ? "Rien à ajouter : vos propriétaires retrouvés dans ce fichier sont déjà complets."
                : "Aucun de vos propriétaires n'a été retrouvé dans ce fichier. Vérifiez qu'il s'agit bien de la liste des propriétaires d'ICS."}
            </p>
            {!a.retrouves.length && <CodeAide code={etat.aide} />}
            {!a.retrouves.length && etat.apercu && <Formes apercu={etat.apercu} />}
          </Card>
        )}

        {complets.length > 0 && (
          <Card title="Déjà complets">
            <ul className="divide-y divide-line/70">
              {complets.map((r) => (
                <li key={r.contact.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="text-sm font-medium">{nomComplet(r.contact)}</div>
                  {r.candidats.length === 1 && <Differences c={r.candidats[0]} />}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {a.absents.length > 0 && (
          <Card title="Pas dans ce fichier">
            <p className="text-sm leading-relaxed text-muted">{a.absents.map((c) => nomComplet(c)).join(" · ")}</p>
          </Card>
        )}

        <div className="space-y-2 pb-2">
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={!total} onClick={() => valider(a)}>
            {total ? `Ajouter ${total === 1 ? "l'information cochée" : `les ${total} informations cochées`}` : "Cochez ce qu'il faut ajouter"}
          </button>
          <p className="text-xs text-muted">Seuls les champs vides sont remplis. Une valeur différente dans ICS est signalée, jamais remplacée.</p>
          {a.retrouves.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="flex min-h-[40px] cursor-pointer items-center">Un souci avec ce fichier&nbsp;?</summary>
              <CodeAide code={etat.aide} />
            </details>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {fichier}
      <Card>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ok/10 text-ok">
            <ShieldCheck size={20} />
          </span>
          <p className="text-sm leading-relaxed">
            Le fichier est lu sur cet appareil et n&apos;est envoyé nulle part. Seuls vos propriétaires du Hub y sont cherchés
            {nbProprietaires ? ` (${nbProprietaires})` : ""}&nbsp;: les autres personnes du fichier sont ignorées.
          </p>
        </div>
        <ol className="mt-4 space-y-2.5 text-sm">
          {[
            "Dans ICS, menu Editions › « Liste Téléphones et Mails » : choisissez les propriétaires et imprimez en « PDF VIEWER ». Un export Excel ou CSV convient aussi.",
            "Choisissez le fichier ci-dessous, même si son nom se termine par .tmp.",
            "Vérifiez ce qui sera ajouté, puis validez. Seuls les champs vides sont remplis.",
          ].map((t, i) => (
            <li key={t} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-semibold text-accent">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
        <button type="button" onClick={choisirFichier} className="btn-primary mt-5 w-full sm:w-auto">
          <Upload size={16} /> Choisir le fichier exporté
        </button>
        {etat.erreur && (
          <div className="mt-4 rounded-xl bg-danger/10 px-3 py-2.5 text-sm text-danger ring-1 ring-inset ring-danger/20">
            {etat.erreur}
            {!!etat.colonnes?.length && <div className="mt-1.5 text-xs text-fg/80">Colonnes trouvées&nbsp;: {etat.colonnes.join(" · ")}</div>}
            {etat.aide && <CodeAide code={etat.aide} />}
            {etat.apercu && <Formes apercu={etat.apercu} />}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Code d'aide à transmettre en capture en cas de souci : il décrit la forme du fichier, sans aucun nom ni coordonnée. */
function CodeAide({ code }: { code: string }) {
  if (!code) return null;
  return (
    <p className="mt-2 break-words text-[11px] leading-relaxed text-fg/70">
      Code d&apos;aide (sans aucun nom ni coordonnée, peut être transmis en capture)&nbsp;: <span className="font-mono">{code}</span>
    </p>
  );
}

/** Formes de lettres d'un PDF fait d'images, pour le dépannage : chacune une seule fois et dans le désordre, posées sur
 *  leur ligne de base. Chaque point de l'image devient un carré net de plusieurs pixels de l'écran, pour qu'une capture
 *  garde le dessin exact. */
function Formes({ apercu }: { apercu: Apercu }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !apercu.formes.length) return;
    const dpr = window.devicePixelRatio || 1;
    const plan = planFormes(apercu, Math.max(200, Math.floor((c.parentElement?.clientWidth || 600) * dpr)), 720 * dpr);
    c.width = plan.L;
    c.height = plan.H;
    c.style.width = `${plan.L / dpr}px`;
    c.style.height = `${plan.H / dpr}px`;
    dessinerFormes(ctx, apercu, plan);
  }, [apercu]);
  if (!apercu.formes.length) return null;
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] leading-relaxed text-fg/70">
        Formes des lettres des premières pages, chacune une seule fois et dans le désordre&nbsp;: aucun nom ni numéro ne peut y être relu. Comme le code d&apos;aide, cet aperçu peut être transmis en capture.
      </p>
      <div className="overflow-hidden rounded-lg ring-1 ring-line">
        <canvas ref={ref} role="img" aria-label="Formes des lettres trouvées dans le fichier" style={{ imageRendering: "pixelated", display: "block", maxWidth: "100%" }} />
      </div>
    </div>
  );
}

function CarteProprietaire({ r, choix, coches, onChoix, onCoche }: { r: Rapprochement; choix: number; coches: Champ[]; onChoix: (k: number) => void; onCoche: (c: Champ) => void }) {
  const cand = choix >= 0 ? r.candidats[choix] : undefined;
  const aChoisir = r.candidats.length > 1 || r.candidats[0].niveau !== "nomPrenom";
  return (
    <div className="card overflow-hidden animate-fade-up">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
        <div className="min-w-0">
          <Link href={`/contacts/${r.contact.id}`} className="font-semibold hover:text-accent">
            {nomComplet(r.contact)}
          </Link>
          {r.biens.length > 0 && <div className="mt-0.5 truncate text-xs text-muted">{r.biens.map((b) => b.titre || b.adresse).join(" · ")}</div>}
        </div>
        {cand && <Badge tone={cand.niveau === "nomPrenom" ? "ok" : "warn"}>{cand.niveau === "nomPrenom" ? "Même nom et prénom" : cand.niveau === "nom" ? "Même nom" : "Nom proche"}</Badge>}
      </div>

      {aChoisir ? (
        <fieldset className="px-2 pb-1 sm:px-3">
          <legend className="px-2 pb-1 text-xs text-muted">
            {r.candidats.length > 1
              ? "Plusieurs fiches ICS possibles : laquelle est la bonne ?"
              : r.candidats[0].niveau === "proche"
                ? "Nom lu sur l'impression à une lettre près : est-ce bien cette personne ?"
                : "Le prénom n'a pas pu être vérifié : est-ce bien cette personne ?"}
          </legend>
          {r.candidats.map((c, k) => (
            <label key={c.fiche.ligne} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
              <input type="radio" name={`ics-${r.contact.id}`} className="size-5 shrink-0 accent-accent" checked={choix === k} onChange={() => onChoix(k)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{c.fiche.libelle}</span>
                <span className="block text-xs text-muted">
                  {c.ajouts.length ? `${c.ajouts.length} information${s(c.ajouts.length)} à ajouter` : "rien à ajouter"}
                  {c.niveau === "nom" ? " · prénom non vérifié" : c.niveau === "proche" ? " · nom lu à une lettre près" : ""}
                </span>
              </span>
            </label>
          ))}
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
            <input type="radio" name={`ics-${r.contact.id}`} className="size-5 shrink-0 accent-accent" checked={choix < 0} onChange={() => onChoix(-1)} />
            <span className="text-sm text-muted">{r.candidats.length > 1 ? "Aucune de ces fiches" : "Non, ne rien ajouter"}</span>
          </label>
        </fieldset>
      ) : (
        <div className="px-4 pb-1 text-xs text-muted sm:px-5">Dans ICS&nbsp;: {cand?.fiche.libelle}</div>
      )}

      {cand && cand.ajouts.length > 0 && (
        <ul className="mt-1 border-t border-line/70 px-2 py-1 sm:px-3">
          {cand.ajouts.map((p) => (
            <li key={p.champ}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                <input type="checkbox" className="size-5 shrink-0 accent-accent" checked={coches.includes(p.champ)} onChange={() => onCoche(p.champ)} />
                <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
                  <span className="block text-[11px] text-muted sm:w-32 sm:shrink-0 sm:text-xs">{LIBELLE[p.champ]}</span>
                  <span className={cx("block break-words text-sm", !coches.includes(p.champ) && "text-muted line-through decoration-muted/50")}>{valeurAffichee(p)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {cand && <Differences c={cand} encadre />}
      <div className="h-2" />
    </div>
  );
}

function Differences({ c, encadre }: { c: Candidat; encadre?: boolean }) {
  if (!c.differences.length && !c.fiche.autres.length) return null;
  return (
    <div className={cx("text-xs leading-relaxed text-muted", encadre ? "mx-4 mt-2 rounded-xl bg-surface-2/70 px-3 py-2.5 sm:mx-5" : "mt-1")}>
      <div className="flex gap-2">
        <Info size={14} className="mt-0.5 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          {c.differences.map((p) => (
            <div key={p.champ} className="break-words">
              {LIBELLE[p.champ]} différent dans ICS&nbsp;: {valeurAffichee(p)} (le Hub garde {valeurAffichee({ champ: p.champ, valeur: p.actuel ?? "" })})
            </div>
          ))}
          {c.fiche.autres.length > 0 && <div className="break-words">Aussi dans ICS&nbsp;: {c.fiche.autres.join(" · ")}</div>}
        </div>
      </div>
    </div>
  );
}
