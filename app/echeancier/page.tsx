"use client";

/* Échéancier de gestion : révisions de loyer (IRL), congés et fins de bail,
   attestations d'assurance, pour tous les logements loués. */

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, Check, Copy, Mail, Pencil, Plus } from "lucide-react";
import { Badge, Card, Empty, Field, PageHeader, Sheet, cx } from "@/components/ui";
import { Toggle } from "@/components/contacts/bits";
import { useCollection, update } from "@/lib/store";
import { dateLongue, nomComplet, today } from "@/lib/format";
import { gmailHref } from "@/components/matching/BrouillonMail";
import { copier } from "@/components/assistant/outils";
import { titrePublic } from "@/lib/titrePublic";
import { nomConseiller } from "@/lib/equipe";
import { IRL, irlConnu } from "@/components/location/loi";
import { locationDe } from "@/components/location/bienLocation";
import { bailSuivi, biensGeres, evenements, gestionDe, libelleIrl, prochaineRevision, type BailEnCours, type Evenement } from "@/components/gestion/echeancier";
import type { Bien, Contact } from "@/lib/types";

const eur2 = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const court = (ymd: string) => ymd.split("-").reverse().join("/");

export default function Echeancier() {
  const { items: biens } = useCollection("biens");
  const { items: contacts } = useCollection("contacts");
  const [saisie, setSaisie] = useState<Bien | null>(null);
  const [courrier, setCourrier] = useState<Evenement | null>(null);
  const auj = today();

  const geres = useMemo(() => biensGeres(biens), [biens]);
  const evts = useMemo(() => geres.flatMap((b) => evenements(b, auj)).sort((a, b) => a.date.localeCompare(b.date)), [geres, auj]);
  const sansBail = geres.filter((b) => !bailSuivi(b));
  const bienDe = (id: string) => biens.find((b) => b.id === id)!;
  const locataires = (b: Bien) => (locationDe(b)?.locataireIds ?? []).map((id) => contacts.find((c) => c.id === id)).filter(Boolean) as Contact[];

  const groupes: [string, Evenement[]][] = [
    ["En retard", evts.filter((e) => e.date < auj)],
    ["Dans les 30 jours", evts.filter((e) => e.date >= auj && e.date <= addJours(auj, 30))],
    ["Plus tard", evts.filter((e) => e.date > addJours(auj, 30))],
  ];

  function appliquerRevision(e: Evenement) {
    const b = bienDe(e.bienId);
    const x = bailSuivi(b);
    const r = e.revision;
    if (!x || !r || r.gele) return;
    const g = gestionDe(b)!;
    const bail: BailEnCours = { ...x, loyer: r.nouveau, irlAnnee: r.irl.annee, irlValeur: r.irl.valeur, derniereRevision: e.date };
    delete (bail as Partial<BailEnCours & { source: string }>).source;
    update("biens", b.id, {
      location: { ...g, loyer: r.nouveau, bailEnCours: bail, revisions: [...(g.revisions ?? []), { date: e.date, ancien: r.ancien, nouveau: r.nouveau, irl: libelleIrl(r.irl) }] },
    } as Partial<Bien>);
  }

  function assuranceRecue(e: Evenement) {
    const b = bienDe(e.bienId);
    const x = bailSuivi(b);
    if (!x) return;
    const { source: _s, ...bail } = x;
    void _s;
    update("biens", b.id, { location: { ...gestionDe(b)!, bailEnCours: { ...bail, assuranceRecue: auj } } } as Partial<Bien>);
  }

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="Échéancier de gestion" subtitle="Révisions de loyer, congés, fins de bail et attestations d'assurance des logements loués." />

      {evts.length ? (
        groupes.map(([titre, liste]) =>
          liste.length ? (
            <div key={titre} className="space-y-2">
              <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{titre}</div>
              <ul className="space-y-2">
                {liste.map((e) => {
                  const b = bienDe(e.bienId);
                  return (
                    <li key={`${e.bienId}-${e.cle}`} className="card card-pad space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={e.tone}>{court(e.date)}</Badge>
                        <span className="text-sm font-semibold">{e.titre}</span>
                      </div>
                      <Link href={`/biens/${b.id}`} className="block text-sm hover:text-accent">
                        {b.titre}
                        {locataires(b).length ? <span className="text-muted"> · {locataires(b).map((c) => nomComplet(c)).join(", ")}</span> : null}
                      </Link>
                      <p className="text-sm text-muted">{e.texte}</p>
                      {e.cle === "revision" && e.revision && !e.revision.gele && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button className="btn-secondary btn-sm !h-9" onClick={() => setCourrier(e)}>
                            <Mail size={14} /> Courrier au locataire
                          </button>
                          <button className="btn-primary btn-sm !h-9" disabled={e.revision.provisoire} onClick={() => appliquerRevision(e)}>
                            <Check size={14} /> Révision faite
                          </button>
                        </div>
                      )}
                      {e.cle === "assurance" && (
                        <button className="btn-secondary btn-sm !h-9" onClick={() => assuranceRecue(e)}>
                          <Check size={14} /> Attestation reçue
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null,
        )
      ) : (
        <Empty icon={<CalendarClock size={22} />} title="Rien dans les 4 prochains mois" text={geres.length ? "Les échéances des baux suivis apparaîtront ici." : "Aucun logement loué avec un bail suivi. Renseigne le bail en cours d'un logement ci-dessous."} />
      )}

      <Card title="Baux suivis" action={<span className="text-xs text-muted">{geres.length - sansBail.length} / {geres.length}</span>}>
        <ul className="divide-y divide-line">
          {geres.map((b) => {
            const x = bailSuivi(b);
            return (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{b.titre}</div>
                  <div className="text-xs text-muted">
                    {x ? `${x.type === "meuble" ? "Meublé" : "Vide"} depuis le ${court(x.debut)} · ${eur2(x.loyer)} HC · révision le ${court(prochaineRevision(x, auj))}` : "Bail en cours à renseigner"}
                  </div>
                </div>
                {(!x || x.source === "saisi") && (
                  <button className="btn-ghost btn-sm" onClick={() => setSaisie(b)} aria-label="Renseigner le bail">
                    {x ? <Pencil size={15} /> : <Plus size={15} />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <AjoutBien biens={biens.filter((b) => locationDe(b) && !geres.includes(b))} onChoix={setSaisie} />
      </Card>

      {saisie && <SaisieBail b={saisie} onClose={() => setSaisie(null)} />}
      {courrier && <Courrier e={courrier} b={bienDe(courrier.bienId)} locataires={locataires(bienDe(courrier.bienId))} onClose={() => setCourrier(null)} />}
    </div>
  );
}

function addJours(ymd: string, n: number) {
  return new Date(new Date(ymd + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}

function AjoutBien({ biens, onChoix }: { biens: Bien[]; onChoix: (b: Bien) => void }) {
  const [id, setId] = useState("");
  if (!biens.length) return null;
  return (
    <div className="mt-3 flex gap-2 border-t border-line pt-3">
      <select className="input !h-10 flex-1 text-sm" value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Suivre un autre logement…</option>
        {biens.map((b) => (
          <option key={b.id} value={b.id}>
            {b.titre}
          </option>
        ))}
      </select>
      <button className="btn-secondary !h-10" disabled={!id} onClick={() => onChoix(biens.find((b) => b.id === id)!)}>
        <Plus size={15} />
      </button>
    </div>
  );
}

function SaisieBail({ b, onClose }: { b: Bien; onClose: () => void }) {
  const actuel = gestionDe(b)?.bailEnCours;
  const ref = irlConnu(today());
  const [x, setX] = useState<BailEnCours>(
    actuel ?? { debut: "", loyer: locationDe(b)?.loyer ?? 0, type: locationDe(b)?.meuble ? "meuble" : "nu", irlTrimestre: ref.trimestre, irlAnnee: ref.annee, irlValeur: ref.valeur },
  );
  const set = (p: Partial<BailEnCours>) => setX((v) => ({ ...v, ...p }));
  const connu = IRL.find((i) => i.trimestre === x.irlTrimestre && i.annee === x.irlAnnee);
  const valide = /^\d{4}-\d{2}-\d{2}$/.test(x.debut) && x.loyer > 0 && x.irlValeur > 0;

  function enregistrer() {
    const g = locationDe(b)!;
    update("biens", b.id, { location: { ...g, statut: g.statut === "a_louer" || g.statut === "en_attente" ? "loue" : g.statut, loyer: x.loyer, bailEnCours: x } } as Partial<Bien>);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Bail en cours"
      footer={
        <button className="btn-primary" disabled={!valide} onClick={enregistrer}>
          <Check size={16} /> Enregistrer
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">{b.titre}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début du bail">
            <input type="date" className="input" value={x.debut} onChange={(e) => set({ debut: e.target.value })} />
          </Field>
          <Field label="Loyer actuel HC">
            <input type="number" inputMode="decimal" className="input" value={x.loyer || ""} onChange={(e) => set({ loyer: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="flex gap-2">
          {(["nu", "meuble"] as const).map((t) => (
            <button key={t} className={cx("chip", x.type === t && "!bg-accent/10 !text-accent")} onClick={() => set({ type: t })}>
              {t === "nu" ? "Vide" : "Meublé"}
            </button>
          ))}
        </div>
        {x.type === "nu" ? <Toggle checked={x.morale} onChange={(v) => set({ morale: v })} label="Bailleur société (bail de 6 ans)" /> : <Toggle checked={x.etudiant} onChange={(v) => set({ etudiant: v })} label="Bail étudiant de 9 mois" />}
        <div className="grid grid-cols-3 gap-3">
          <Field label="IRL trimestre">
            <select className="input" value={x.irlTrimestre} onChange={(e) => set({ irlTrimestre: Number(e.target.value) as 1 | 2 | 3 | 4 })}>
              {[1, 2, 3, 4].map((t) => (
                <option key={t} value={t}>
                  T{t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Année">
            <input type="number" className="input" value={x.irlAnnee} onChange={(e) => {
              const annee = Number(e.target.value);
              const i = IRL.find((v) => v.trimestre === x.irlTrimestre && v.annee === annee);
              set({ irlAnnee: annee, ...(i ? { irlValeur: i.valeur } : {}) });
            }} />
          </Field>
          <Field label="Valeur">
            <input type="number" inputMode="decimal" step="0.01" className="input" value={x.irlValeur || ""} onChange={(e) => set({ irlValeur: Number(e.target.value) })} />
          </Field>
        </div>
        <p className="text-xs text-muted">
          IRL de la dernière révision (ou de la signature si le loyer n&apos;a jamais été révisé). {connu ? "Valeur INSEE reprise automatiquement." : "Valeur à recopier depuis le bail ou l'INSEE."}
        </p>
        <Field label="Dernière révision (si déjà faite)">
          <input type="date" className="input" value={x.derniereRevision ?? ""} onChange={(e) => set({ derniereRevision: e.target.value || undefined })} />
        </Field>
      </div>
    </Sheet>
  );
}

function Courrier({ e, b, locataires, onClose }: { e: Evenement; b: Bien; locataires: Contact[]; onClose: () => void }) {
  const r = e.revision!;
  const noms = locataires.map((c) => [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ")).join(" et ");
  const sujet = `Révision annuelle de votre loyer – ${titrePublic(b)}`;
  const corps = [
    noms ? `Bonjour ${noms},` : "Madame, Monsieur,",
    "",
    `Conformément à la clause de révision de votre bail, votre loyer est révisé au ${dateLongue(e.date)}, selon l'indice de référence des loyers (IRL) publié par l'INSEE.`,
    "",
    `• Loyer actuel hors charges : ${eur2(r.ancien)}`,
    `• Indice de référence : ${libelleIrl(r.irl)}`,
    `• Nouveau loyer hors charges : ${eur2(r.nouveau)}, soit ${eur2(Math.round((r.nouveau - r.ancien) * 100) / 100)} de plus par mois`,
    "",
    "Le nouveau montant s'applique à compter de la prochaine échéance. Les charges restent inchangées.",
    "",
    "Je reste à votre disposition pour toute question.",
    "",
    "Bien cordialement,",
    nomConseiller(),
    "PATRIM Immobilier, gestion locative",
  ].join("\n");
  const email = locataires.find((c) => c.email)?.email;
  return (
    <Sheet open onClose={onClose} title="Courrier de révision" wide>
      <textarea className="input min-h-[300px] w-full py-2.5 text-sm" defaultValue={corps} id="courrier-revision" />
      <div className="mt-3 flex flex-wrap gap-2">
        <a className="btn-primary" href={gmailHref(email, sujet, corps)} target="_blank" rel="noreferrer">
          <Mail size={16} /> Brouillon Gmail
        </a>
        <button className="btn-secondary" onClick={() => void copier((document.getElementById("courrier-revision") as HTMLTextAreaElement).value)}>
          <Copy size={16} /> Copier
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Rien n&apos;est envoyé automatiquement : relis puis envoie toi-même.</p>
    </Sheet>
  );
}
